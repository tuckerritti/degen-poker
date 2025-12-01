import { evaluate } from "@poker-apprentice/hand-evaluator";
import { createLogger } from "@/lib/logger";

const evalLogger = createLogger("poker-hand-evaluator");

export interface HandEvaluation {
  rank: number;
  description: string;
}

// Map hand strength to readable descriptions
// Strength values from @poker-apprentice/hand-evaluator (higher is better)
const STRENGTH_DESCRIPTIONS: Record<number, string> = {
  0: "High Card",
  1: "Pair",
  2: "Two Pair",
  3: "Three of a Kind",
  4: "Straight",
  5: "Flush",
  6: "Full House",
  7: "Four of a Kind",
  8: "Straight Flush",
  9: "Royal Flush",
};

/**
 * Evaluates PLO hand using exactly 2 hole cards + 3 board cards
 * Returns best possible 5-card hand
 *
 * PLO Rule: Must use exactly 2 cards from hand, exactly 3 from board
 */
export function evaluatePLOHand(
  holeCards: string[], // 4 cards
  boardCards: string[], // 5 cards
): HandEvaluation {
  if (holeCards.length !== 4) {
    evalLogger.error({ holeCardsCount: holeCards.length }, "Invalid PLO hand - must have 4 hole cards");
    return { rank: Infinity, description: "Invalid hand" };
  }

  if (boardCards.length !== 5) {
    evalLogger.error({ boardCardsCount: boardCards.length }, "Invalid board - must have 5 cards");
    return { rank: Infinity, description: "Invalid board" };
  }

  // PLO rule: must use exactly 2 from hand, 3 from board
  // Try all combinations (C(4,2) * C(5,3) = 6 * 10 = 60 combinations)
  let bestRank = -1;
  let bestDescription = "";

  for (let h1 = 0; h1 < 4; h1++) {
    for (let h2 = h1 + 1; h2 < 4; h2++) {
      for (let b1 = 0; b1 < 5; b1++) {
        for (let b2 = b1 + 1; b2 < 5; b2++) {
          for (let b3 = b2 + 1; b3 < 5; b3++) {
            const hand = [
              holeCards[h1],
              holeCards[h2],
              boardCards[b1],
              boardCards[b2],
              boardCards[b3],
            ];

            try {
              // Type assertion needed because hand-evaluator expects specific card type union
              const result = evaluate({ holeCards: hand as unknown as Parameters<typeof evaluate>[0]['holeCards'] });
              // Higher strength number = better hand
              if (result.strength > bestRank) {
                bestRank = result.strength;
                bestDescription = STRENGTH_DESCRIPTIONS[result.strength] || "Unknown";
              }
            } catch (error) {
              evalLogger.error(
                { hand, error: error instanceof Error ? error.message : String(error) },
                "Hand evaluation failed"
              );
            }
          }
        }
      }
    }
  }

  evalLogger.debug({
    holeCards,
    boardCards,
    bestRank,
    bestDescription,
  }, "PLO hand evaluated");

  return { rank: bestRank, description: bestDescription };
}

/**
 * Finds winner(s) for a single board
 * Returns all players with the best hand rank (handles ties)
 */
export function findBoardWinners(
  players: Array<{
    seatNumber: number;
    holeCards: string[];
    hasFolded: boolean;
  }>,
  boardCards: string[],
): Array<{ seatNumber: number; rank: number; description: string }> {
  const activePlayers = players.filter((p) => !p.hasFolded);

  if (activePlayers.length === 0) {
    evalLogger.warn("No active players to evaluate");
    return [];
  }

  // Evaluate each player's hand
  const evaluations = activePlayers.map((p) => ({
    seatNumber: p.seatNumber,
    ...evaluatePLOHand(p.holeCards, boardCards),
  }));

  // Find best rank (higher is better)
  const bestRank = Math.max(...evaluations.map((e) => e.rank));

  // Return all players with the best rank (handles ties)
  const winners = evaluations.filter((e) => e.rank === bestRank);

  evalLogger.info({
    boardCards,
    totalPlayers: activePlayers.length,
    winnerCount: winners.length,
    bestRank,
    isTie: winners.length > 1,
  }, "Board winners determined");

  return winners;
}
