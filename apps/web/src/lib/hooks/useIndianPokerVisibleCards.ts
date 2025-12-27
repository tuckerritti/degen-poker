"use client";

import { useEffect, useState } from "react";
import { engineFetch } from "@/lib/engineClient";
import { clientLogger } from "@/lib/client-logger";

/**
 * SECURITY: Server-enforced Indian Poker visibility
 * Fetches visible cards from the secure endpoint that returns all OTHER players' cards
 * Never exposes the requesting player's own card
 */
export function useIndianPokerVisibleCards(
  roomId: string | null,
  gameStateId: string | null,
  mySeatNumber: number | null,
) {
  const [visibleCards, setVisibleCards] = useState<Record<
    string,
    string[]
  > | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Only fetch if we have all required params
    if (!roomId || !gameStateId || mySeatNumber === null) {
      setVisibleCards(null);
      setLoading(false);
      return;
    }

    const fetchVisibleCards = async () => {
      setLoading(true);
      setError(null);

      try {
        clientLogger.debug(
          "useIndianPokerVisibleCards: Fetching visible cards",
          {
            roomId,
            gameStateId,
            mySeatNumber,
          },
        );

        const response = await engineFetch(
          `/rooms/${roomId}/game-states/${gameStateId}/indian-poker-cards?seat=${mySeatNumber}`,
          {
            method: "GET",
          },
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(
            errorData.error || `Failed to fetch visible cards: ${response.statusText}`,
          );
        }

        const data = await response.json();
        clientLogger.info(
          "useIndianPokerVisibleCards: Visible cards fetched",
          {
            roomId,
            gameStateId,
            cardCount: Object.keys(data.visibleCards || {}).length,
          },
        );

        setVisibleCards(data.visibleCards || {});
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to fetch visible cards";
        clientLogger.error(
          "useIndianPokerVisibleCards: Error fetching visible cards",
          err instanceof Error ? err : new Error(String(err)),
        );
        setError(errorMessage);
        setVisibleCards(null);
      } finally {
        setLoading(false);
      }
    };

    fetchVisibleCards();

    // Re-fetch when game state changes (e.g., phase transitions)
    // Could also set up polling here if needed
  }, [roomId, gameStateId, mySeatNumber]);

  return { visibleCards, loading, error };
}
