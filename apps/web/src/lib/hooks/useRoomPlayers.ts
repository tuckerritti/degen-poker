"use client";

import { useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase/client";
import { clientLogger } from "@/lib/client-logger";
import type { RoomPlayer } from "@/types/database";

/**
 * Hook to subscribe to real-time player updates for a room
 */
export function useRoomPlayers(roomId: string | null) {
  const [players, setPlayers] = useState<RoomPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Exposed refetch function
  const refetch = async () => {
    if (!roomId) return;

    try {
      clientLogger.debug("useRoomPlayers: Manual refetch", { roomId });
      const supabase = getBrowserClient();
      const { data, error } = await supabase
        .from("room_players")
        .select("*")
        .eq("room_id", roomId)
        .order("seat_number", { ascending: true });

      if (error) {
        clientLogger.error("useRoomPlayers: Error refetching players", error);
        setError(error.message);
      } else {
        clientLogger.info("useRoomPlayers: Players refetched", {
          roomId,
          playerCount: data?.length || 0,
        });
        setPlayers(data || []);
      }
    } catch (err) {
      clientLogger.error(
        "useRoomPlayers: Unexpected refetch error",
        err instanceof Error ? err : new Error(String(err)),
      );
      setError("Failed to refetch players");
    }
  };

  useEffect(() => {
    if (!roomId) {
      setLoading(false);
      return;
    }

    clientLogger.debug("useRoomPlayers: Initializing subscription", { roomId });
    const supabase = getBrowserClient();

    // Initial fetch
    const fetchInitial = async () => {
      try {
        clientLogger.debug("useRoomPlayers: Fetching players", { roomId });
        const { data, error } = await supabase
          .from("room_players")
          .select("*")
          .eq("room_id", roomId)
          .order("seat_number", { ascending: true });

        if (error) {
          clientLogger.error("useRoomPlayers: Error fetching players", error);
          setError(error.message);
        } else {
          clientLogger.info("useRoomPlayers: Players fetched", {
            roomId,
            playerCount: data?.length || 0,
          });
          setPlayers(data || []);
        }
      } catch (err) {
        clientLogger.error(
          "useRoomPlayers: Unexpected error",
          err instanceof Error ? err : new Error(String(err)),
        );
        setError("Failed to fetch players");
      } finally {
        setLoading(false);
      }
    };

    fetchInitial();

    // Subscribe to changes
    const channel = supabase
      .channel(`room-players:${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "room_players",
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          const newPlayer = payload.new as RoomPlayer;
          clientLogger.info("useRoomPlayers: Player joined", {
            roomId,
            seatNumber: newPlayer.seat_number,
            displayName: newPlayer.display_name,
          });
          setPlayers((prev) => {
            // Avoid duplicates if player already exists
            if (prev.some((p) => p.id === newPlayer.id)) {
              return prev;
            }
            return [...prev, newPlayer].sort(
              (a, b) => a.seat_number - b.seat_number,
            );
          });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "room_players",
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          const updatedPlayer = payload.new as RoomPlayer;
          clientLogger.debug("useRoomPlayers: Player updated", {
            roomId,
            seatNumber: updatedPlayer.seat_number,
            chipStack: updatedPlayer.chip_stack,
          });
          setPlayers((prev) =>
            prev.map((p) => (p.id === payload.new.id ? updatedPlayer : p)),
          );
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "room_players",
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          clientLogger.info("useRoomPlayers: Player left", {
            roomId,
            playerId: payload.old.id,
          });
          setPlayers((prev) => prev.filter((p) => p.id !== payload.old.id));
        },
      )
      .subscribe((status) => {
        clientLogger.info("useRoomPlayers: Subscription status", {
          roomId,
          status,
        });
      });

    return () => {
      clientLogger.debug("useRoomPlayers: Unsubscribing", { roomId });
      channel.unsubscribe();
    };
  }, [roomId]);

  return { players, loading, error, refetch };
}
