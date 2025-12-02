"use client";

import { useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase/client";
import { clientLogger } from "@/lib/client-logger";
import type { PlayerHand } from "@/types/database";

/**
 * Hook to subscribe to real-time player hand updates
 * Per POKER_PLAN.md Section 2: RLS ensures players only see their own cards
 * This hook filters by session_id to get the current player's hole cards
 */
export function usePlayerHand(roomId: string | null, sessionId: string | null) {
  const [playerHand, setPlayerHand] = useState<PlayerHand | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!roomId || !sessionId) {
      setLoading(false);
      return;
    }

    clientLogger.debug("usePlayerHand: Initializing subscription", { roomId });
    const supabase = getBrowserClient();

    // Initial fetch - get current player's hand
    const fetchInitial = async () => {
      try {
        clientLogger.debug("usePlayerHand: Fetching player hand", { roomId });
        const { data, error } = await supabase
          .from("player_hands")
          .select("*")
          .eq("room_id", roomId)
          .eq("session_id", sessionId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) {
          clientLogger.error(
            "usePlayerHand: Error fetching player hand",
            error,
          );
          setError(error.message);
        } else {
          // IMPORTANT: Never log actual hole cards for security
          clientLogger.info("usePlayerHand: Player hand fetched", {
            roomId,
            hasHand: !!data,
            cardCount: data?.cards
              ? (data.cards as unknown as string[]).length
              : 0,
          });
          setPlayerHand(data);
        }
      } catch (err) {
        clientLogger.error(
          "usePlayerHand: Unexpected error",
          err instanceof Error ? err : new Error(String(err)),
        );
        setError("Failed to fetch player hand");
      } finally {
        setLoading(false);
      }
    };

    fetchInitial();

    // Subscribe to changes - filter by session_id (RLS enforcement)
    const channel = supabase
      .channel(`player-hand:${roomId}:${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "player_hands",
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          // IMPORTANT: Never log actual hole cards for security
          clientLogger.info("usePlayerHand: Real-time update received", {
            roomId,
            eventType: payload.eventType,
          });
          if (payload.eventType === "DELETE") {
            clientLogger.info("usePlayerHand: Hand deleted", { roomId });
            setPlayerHand(null);
          } else if (
            payload.eventType === "INSERT" ||
            payload.eventType === "UPDATE"
          ) {
            setPlayerHand(payload.new as PlayerHand);
          }
        },
      )
      .subscribe();

    return () => {
      clientLogger.debug("usePlayerHand: Unsubscribing", { roomId });
      channel.unsubscribe();
    };
  }, [roomId, sessionId]);

  return { playerHand, loading, error };
}
