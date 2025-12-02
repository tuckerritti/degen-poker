"use client";

import { useEffect, useState } from "react";
import { clientLogger } from "@/lib/client-logger";
import type { PlayerHand } from "@/types/database";
import { getBrowserClient } from "@/lib/supabase/client";

/**
 * Hook to subscribe to real-time player hand updates directly via Supabase
 * RLS restricts rows to auth.uid() = auth_user_id
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

    let cancelled = false;
    const supabase = getBrowserClient();

    const fetchInitial = async () => {
      try {
        const { data, error } = await supabase
          .from("player_hands")
          .select("*")
          .eq("room_id", roomId)
          .eq("auth_user_id", sessionId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!cancelled) {
          if (error) {
            setError(error.message);
          } else {
            setPlayerHand(data);
          }
        }
      } catch (err) {
        if (!cancelled) {
          clientLogger.error(
            "usePlayerHand: Unexpected error",
            err instanceof Error ? err : new Error(String(err)),
          );
          setError("Failed to fetch player hand");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchInitial();

    const channel = supabase
      .channel(`player-hands:${roomId}:${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "player_hands",
          filter: `auth_user_id=eq.${sessionId}`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") {
            setPlayerHand(null);
          } else {
            setPlayerHand(payload.new as PlayerHand);
          }
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      channel.unsubscribe();
    };
  }, [roomId, sessionId]);

  return { playerHand, loading, error };
}
