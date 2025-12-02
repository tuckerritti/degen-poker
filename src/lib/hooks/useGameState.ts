"use client";

import { useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase/client";
import { clientLogger } from "@/lib/client-logger";
import type { GameState } from "@/types/database";

/**
 * Hook to subscribe to real-time game state updates for a room
 */
export function useGameState(roomId: string | null) {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!roomId) {
      setLoading(false);
      return;
    }

    clientLogger.debug("useGameState: Initializing subscription", { roomId });
    const supabase = getBrowserClient();

    // Initial fetch
    const fetchInitial = async () => {
      try {
        clientLogger.debug("useGameState: Fetching initial game state", {
          roomId,
        });
        const { data, error } = await supabase
          .from("game_states")
          .select("*")
          .eq("room_id", roomId)
          .single();

        if (error) {
          if (error.code === "PGRST116") {
            // No game state yet (no hand started)
            clientLogger.info("useGameState: No active hand", { roomId });
            setGameState(null);
          } else {
            clientLogger.error(
              "useGameState: Error fetching game state",
              error,
            );
            setError(error.message);
          }
        } else {
          clientLogger.info("useGameState: Game state fetched", {
            roomId,
            phase: data.phase,
            potSize: data.pot_size,
          });
          setGameState(data);
        }
      } catch (err) {
        clientLogger.error(
          "useGameState: Unexpected error",
          err instanceof Error ? err : new Error(String(err)),
        );
        setError("Failed to fetch game state");
      } finally {
        setLoading(false);
      }
    };

    fetchInitial();

    // Subscribe to changes
    const channel = supabase
      .channel(`game-state:${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "game_states",
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          clientLogger.info("useGameState: Real-time update received", {
            roomId,
            eventType: payload.eventType,
            phase:
              payload.eventType !== "DELETE"
                ? (payload.new as GameState).phase
                : undefined,
          });
          if (payload.eventType === "DELETE") {
            clientLogger.info("useGameState: Hand ended", { roomId });
            setGameState(null);
          } else {
            setGameState(payload.new as GameState);
          }
        },
      )
      .subscribe();

    return () => {
      clientLogger.debug("useGameState: Unsubscribing", { roomId });
      channel.unsubscribe();
    };
  }, [roomId]);

  return { gameState, loading, error };
}
