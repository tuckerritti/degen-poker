import { supabase } from "./supabase.js";
import { logger } from "./logger.js";
import {
  HAND_COMPLETE_DELAY_MS,
  HAND_COMPLETE_DELAY_321_MS,
} from "@poker/shared";

/**
 * Cleanup scheduler for completed hands.
 * Runs periodically to delete game_states where hand_completed_at exceeds the delay period
 * (5 seconds for standard modes, 15 seconds for 321 mode).
 *
 * This allows the engine to set hand_completed_at and return immediately from the HTTP request,
 * while the cleanup happens asynchronously in the background. This prevents blocking the request
 * handler and is resilient to engine restarts (database-driven state recovery).
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
        defaultDelayMs: HAND_COMPLETE_DELAY_MS,
        delay321Ms: HAND_COMPLETE_DELAY_321_MS,
      },
      "Starting hand completion cleanup scheduler (delay varies by game mode)",
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
    const now = Date.now();
    const minCutoffTime = new Date(now - HAND_COMPLETE_DELAY_MS).toISOString();

    // Find all completed game_states with room info to check game mode
    const { data: completedHands, error: queryErr } = await supabase
      .from("game_states")
      .select("id, room_id, hand_number, hand_completed_at, rooms!inner(game_mode)")
      .not("hand_completed_at", "is", null)
      .lte("hand_completed_at", minCutoffTime);

    if (queryErr) {
      logger.error({ err: queryErr }, "Failed to query completed hands");
      return;
    }

    if (!completedHands || completedHands.length === 0) {
      // Health check: log if we haven't processed anything in a while but also haven't errored
      // Log every 5 minutes to avoid log noise while still providing health visibility
      const timeSinceLastCheck = Date.now() - this.lastHealthCheckAt;
      if (timeSinceLastCheck > 300000 && this.consecutiveErrors === 0) {
        logger.debug("Cleanup scheduler healthy, no hands to clean");
        this.lastHealthCheckAt = Date.now();
      }
      return;
    }

    // Filter hands that have exceeded their game-mode-specific delay
    const handsToDelete = completedHands.filter((hand) => {
      const completedAt = new Date(hand.hand_completed_at as string).getTime();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const gameMode = (hand.rooms as any)?.game_mode;
      const delayMs =
        gameMode === "game_mode_321"
          ? HAND_COMPLETE_DELAY_321_MS
          : HAND_COMPLETE_DELAY_MS;
      return now >= completedAt + delayMs;
    });

    if (handsToDelete.length === 0) {
      return;
    }

    // Batch delete for better performance
    const handIds = handsToDelete.map((h) => h.id);
    const { error: deleteErr } = await supabase
      .from("game_states")
      .delete()
      .in("id", handIds);

    if (deleteErr) {
      logger.error(
        { err: deleteErr, handCount: handsToDelete.length, handIds },
        "Failed to batch delete completed game_states",
      );
    } else {
      this.consecutiveErrors = 0;
      this.lastHealthCheckAt = Date.now();
      logger.info(
        {
          handCount: handsToDelete.length,
          hands: handsToDelete.map((h) => ({
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
