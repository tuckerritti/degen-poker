import { supabase } from "./supabase.js";
import { logger } from "./logger.js";
import { HAND_COMPLETE_DELAY_MS } from "@poker/shared";

/**
 * Cleanup scheduler for completed hands.
 * Runs periodically to delete game_states where hand_completed_at is older than HAND_COMPLETE_DELAY_MS.
 *
 * This allows the engine to set hand_completed_at and return immediately from the HTTP request,
 * while the cleanup happens asynchronously in the background. This prevents blocking the request
 * handler for 5 seconds and is resilient to engine restarts (database-driven state recovery).
 */
export class HandCompletionCleanup {
  private intervalId: NodeJS.Timeout | null = null;
  // Check every second. Note: cleanup may occur up to 1 second after the delay period
  // expires (e.g., hand at 5.001s may be cleaned at 6s). This is acceptable for UX.
  private readonly checkIntervalMs = 1000;
  private cleanupPromise: Promise<void> | null = null;
  private lastHealthCheckAt: number = Date.now();
  private consecutiveErrors = 0;

  /**
   * Start the cleanup scheduler.
   * Safe to call multiple times - will log a debug message if already running.
   */
  start() {
    if (this.intervalId) {
      logger.debug("HandCompletionCleanup already running");
      return;
    }

    logger.info(
      {
        checkIntervalMs: this.checkIntervalMs,
        delayMs: HAND_COMPLETE_DELAY_MS,
      },
      "Starting hand completion cleanup scheduler",
    );

    this.intervalId = setInterval(() => {
      this.cleanup().catch((err) => {
        this.consecutiveErrors++;
        logger.error(
          { err, consecutiveErrors: this.consecutiveErrors },
          "Error in hand completion cleanup",
        );
      });
    }, this.checkIntervalMs);
  }

  /**
   * Stop the cleanup scheduler.
   * Clears the interval and waits for any in-progress cleanup to finish.
   * @returns Promise that resolves when cleanup is fully stopped
   */
  async stop(): Promise<void> {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;

      // Wait for any in-progress cleanup to finish
      if (this.cleanupPromise) {
        logger.info("Waiting for in-progress cleanup to finish...");
        await this.cleanupPromise;
      }

      logger.info("Hand completion cleanup scheduler stopped");
    }
  }

  /**
   * Cleanup completed hands that have exceeded the delay period.
   * This is safe to run multiple times - it's idempotent.
   *
   * Finds all game_states where hand_completed_at is older than HAND_COMPLETE_DELAY_MS
   * and deletes them to trigger the frontend hand completion flow.
   */
  private async cleanup(): Promise<void> {
    // Prevent concurrent executions by waiting for existing cleanup
    if (this.cleanupPromise) {
      return this.cleanupPromise;
    }

    this.cleanupPromise = this.performCleanup();
    try {
      await this.cleanupPromise;
    } finally {
      this.cleanupPromise = null;
    }
  }

  private async performCleanup(): Promise<void> {
    const cutoffTimestamp = Date.now() - HAND_COMPLETE_DELAY_MS;
    const cutoffTime = new Date(cutoffTimestamp).toISOString();

    // Find all game_states where hand_completed_at is older than cutoff
    const { data: completedHands, error: queryErr } = await supabase
      .from("game_states")
      .select("id, room_id, hand_number, hand_completed_at")
      .not("hand_completed_at", "is", null)
      .lte("hand_completed_at", cutoffTime);

    if (queryErr) {
      logger.error({ err: queryErr }, "Failed to query completed hands");
      return;
    }

    if (!completedHands || completedHands.length === 0) {
      // Health check: log if we haven't processed anything in a while but also haven't errored
      const timeSinceLastCheck = Date.now() - this.lastHealthCheckAt;
      if (timeSinceLastCheck > 60000 && this.consecutiveErrors === 0) {
        logger.debug("Cleanup scheduler healthy, no hands to clean");
        this.lastHealthCheckAt = Date.now();
      }
      return;
    }

    // Batch delete for better performance
    const handIds = completedHands.map((h) => h.id);
    const { error: deleteErr } = await supabase
      .from("game_states")
      .delete()
      .in("id", handIds);

    if (deleteErr) {
      logger.error(
        { err: deleteErr, handCount: completedHands.length, handIds },
        "Failed to batch delete completed game_states",
      );
    } else {
      this.consecutiveErrors = 0;
      this.lastHealthCheckAt = Date.now();
      logger.info(
        {
          handCount: completedHands.length,
          hands: completedHands.map((h) => ({
            roomId: h.room_id,
            handNumber: h.hand_number,
            completedAt: h.hand_completed_at,
          })),
        },
        "Cleaned up completed hands",
      );
    }
  }
}

// Export singleton instance
export const handCompletionCleanup = new HandCompletionCleanup();
