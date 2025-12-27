"use client";

import { useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase/client";
import { clientLogger } from "@/lib/client-logger";
import type { HandResult } from "@/types/database";

/**
 * Hook to fetch and subscribe to the latest hand result for a room.
 */
export function useLatestHandResult(roomId: string | null) {
  const [handResult, setHandResult] = useState<HandResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!roomId) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    const supabase = getBrowserClient();

    const fetchInitial = async () => {
      try {
        const { data, error } = await supabase
          .from("hand_results")
          .select("*")
          .eq("room_id", roomId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!cancelled) {
          if (error) {
            clientLogger.error(
              "useLatestHandResult: Error fetching hand",
              error,
            );
            setError(error.message);
          } else {
            setHandResult(data);
          }
        }
      } catch (err) {
        if (!cancelled) {
          clientLogger.error(
            "useLatestHandResult: Unexpected error",
            err instanceof Error ? err : new Error(String(err)),
          );
          setError("Failed to fetch latest hand result");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchInitial();

    const channel = supabase
      .channel(`hand-results:${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "hand_results",
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          if (!cancelled) {
            setHandResult(payload.new as HandResult);
          }
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      channel.unsubscribe();
    };
  }, [roomId]);

  return { handResult, loading, error };
}
