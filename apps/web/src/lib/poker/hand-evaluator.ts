import { compare, evaluate } from "@poker-apprentice/hand-evaluator";
import { createLogger } from "@/lib/logger";

const evalLogger = createLogger("poker-hand-evaluator");

export interface HandEvaluation {
  rank: number;
  description: string;
  hand: string[]; // The actual 5-card hand
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

// Map rank characters to readable names
const RANK_NAMES: Record<string, string> = {
  "2": "2",
  "3": "3",
  "4": "4",
  "5": "5",
  "6": "6",
  "7": "7",
  "8": "8",
  "9": "9",
  T: "10",
  J: "Jack",
  Q: "Queen",
  K: "King",
  A: "Ace",
};

/**
 * Creates a detailed description of a poker hand
 * @param strength - Hand strength (0-9)
 * @param hand - Array of 5 cards representing the hand
 * @returns Detailed description like "Two Pair, 7's and 4's"
 */
function getDetailedDescription(strength: number, hand: string[]): string {
  const baseDescription = STRENGTH_DESCRIPTIONS[strength] || "Unknown";

  // Extract ranks from cards (first character of each card string)
  const ranks = hand.map((card) => card[0]);

  // Count occurrences of each rank
  const rankCounts = new Map<string, number>();
  ranks.forEach((rank) => {
    rankCounts.set(rank, (rankCounts.get(rank) || 0) + 1);
  });

  // Sort by count (descending) then by rank value (descending for ties)
  const rankOrder = [
    "A",
    "K",
    "Q",
    "J",
    "T",
    "9",
    "8",
    "7",
    "6",
    "5",
    "4",
    "3",
    "2",
  ];
  const sortedRanks = Array.from(rankCounts.entries()).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1]; // Sort by count descending
    return rankOrder.indexOf(a[0]) - rankOrder.indexOf(b[0]); // Sort by rank descending
  });

  switch (strength) {
    case 0: // High Card
      return `${RANK_NAMES[sortedRanks[0][0]]} High`;
    case 1: // Pair
      return `Pair of ${RANK_NAMES[sortedRanks[0][0]]}'s`;
    case 2: // Two Pair
      return `Two Pair, ${RANK_NAMES[sortedRanks[0][0]]}'s and ${RANK_NAMES[sortedRanks[1][0]]}'s`;
    case 3: // Three of a Kind
      return `Three ${RANK_NAMES[sortedRanks[0][0]]}'s`;
    case 4: // Straight
      // Find the highest card in the straight
      const highCard = sortedRanks[0][0];
      return `Straight, ${RANK_NAMES[highCard]} High`;
    case 5: // Flush
      return `Flush, ${RANK_NAMES[sortedRanks[0][0]]} High`;
    case 6: // Full House
      return `Full House, ${RANK_NAMES[sortedRanks[0][0]]}'s over ${RANK_NAMES[sortedRanks[1][0]]}'s`;
    case 7: // Four of a Kind
      return `Four ${RANK_NAMES[sortedRanks[0][0]]}'s`;
    case 8: // Straight Flush
      const sfHighCard = sortedRanks[0][0];
      return `Straight Flush, ${RANK_NAMES[sfHighCard]} High`;
    case 9: // Royal Flush
      return "Royal Flush";
    default:
      return baseDescription;
  }
}

/**
 * Evaluates PLO hand with partial board (flop or turn)
 * Evaluates based only on available cards
 *
 * @param holeCards - Player's 4 hole cards
 * @param boardCards - 3, 4, or 5 community cards
 * @returns Hand evaluation based on available cards
 */
export function evaluatePLOHandPartial(
  holeCards: string[],
  boardCards: string[],
): HandEvaluation {
  if (boardCards.length < 3 || boardCards.length > 5) {
    evalLogger.error(
      { boardCardsCount: boardCards.length },
      "Invalid board - must have 3-5 cards",
    );
    return { rank: -1, description: "Invalid board", hand: [] };
  }

  if (holeCards.length !== 4) {
    evalLogger.error(
      { holeCardsCount: holeCards.length },
      "Invalid PLO hand - must have 4 hole cards",
    );
    return { rank: -1, description: "Invalid hand", hand: [] };
  }

  // For partial boards, evaluate all valid combinations with available cards
  let bestEvaluation: ReturnType<typeof evaluate> | null = null;

  // PLO rule: must use exactly 2 from hand, exactly 3 from board
  // For partial boards (3-4 cards), we evaluate all possible 3-card combinations
  for (let h1 = 0; h1 < 4; h1++) {
    for (let h2 = h1 + 1; h2 < 4; h2++) {
      // Generate all 3-card combinations from available board cards
      for (let b1 = 0; b1 < boardCards.length; b1++) {
        for (let b2 = b1 + 1; b2 < boardCards.length; b2++) {
          for (let b3 = b2 + 1; b3 < boardCards.length; b3++) {
            const hand = [
              holeCards[h1],
              holeCards[h2],
              boardCards[b1],
              boardCards[b2],
              boardCards[b3],
            ];

            try {
              // Type assertion needed because hand-evaluator expects specific card type union
              const result = evaluate({
                holeCards: hand as unknown as Parameters<
                  typeof evaluate
                >[0]["holeCards"],
              });
              if (
                !bestEvaluation ||
                compare(
                  result as ReturnType<typeof evaluate>,
                  bestEvaluation,
                ) === -1
              ) {
                bestEvaluation = result as ReturnType<typeof evaluate>;
              }
            } catch (error) {
              evalLogger.error(
                {
                  hand,
                  error: error instanceof Error ? error.message : String(error),
                },
                "Hand evaluation failed",
              );
            }
          }
        }
      }
    }
  }

  evalLogger.debug(
    {
      holeCards,
      boardCards,
      bestRank: bestEvaluation?.strength ?? -1,
      bestDescription: bestEvaluation
        ? getDetailedDescription(
            bestEvaluation.strength,
            bestEvaluation.hand as unknown as string[],
          )
        : "",
      bestHand: bestEvaluation?.hand ?? [],
    },
    "PLO partial hand evaluated",
  );

  if (!bestEvaluation) {
    return { rank: -1, description: "Invalid hand", hand: [] };
  }

  return {
    rank: bestEvaluation.strength,
    description: getDetailedDescription(
      bestEvaluation.strength,
      bestEvaluation.hand as unknown as string[],
    ),
    hand: bestEvaluation.hand as unknown as string[],
  };
}

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
    evalLogger.error(
      { holeCardsCount: holeCards.length },
      "Invalid PLO hand - must have 4 hole cards",
    );
    return { rank: -1, description: "Invalid hand", hand: [] };
  }

  if (boardCards.length !== 5) {
    evalLogger.error(
      { boardCardsCount: boardCards.length },
      "Invalid board - must have 5 cards",
    );
    return { rank: -1, description: "Invalid board", hand: [] };
  }

  // PLO rule: must use exactly 2 from hand, 3 from board
  // Try all combinations (C(4,2) * C(5,3) = 6 * 10 = 60 combinations)
  let bestEvaluation: ReturnType<typeof evaluate> | null = null;

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
              const result = evaluate({
                holeCards: hand as unknown as Parameters<
                  typeof evaluate
                >[0]["holeCards"],
              });
              if (
                !bestEvaluation ||
                compare(
                  result as ReturnType<typeof evaluate>,
                  bestEvaluation,
                ) === -1
              ) {
                bestEvaluation = result as ReturnType<typeof evaluate>;
              }
            } catch (error) {
              evalLogger.error(
                {
                  hand,
                  error: error instanceof Error ? error.message : String(error),
                },
                "Hand evaluation failed",
              );
            }
          }
        }
      }
    }
  }

  evalLogger.debug(
    {
      holeCards,
      boardCards,
      bestRank: bestEvaluation?.strength ?? -1,
      bestDescription: bestEvaluation
        ? getDetailedDescription(
            bestEvaluation.strength,
            bestEvaluation.hand as unknown as string[],
          )
        : "",
      bestHand: bestEvaluation?.hand ?? [],
    },
    "PLO hand evaluated",
  );

  if (!bestEvaluation) {
    return { rank: -1, description: "Invalid hand", hand: [] };
  }

  return {
    rank: bestEvaluation.strength,
    description: getDetailedDescription(
      bestEvaluation.strength,
      bestEvaluation.hand as unknown as string[],
    ),
    hand: bestEvaluation.hand as unknown as string[],
  };
}

/**
 * Evaluates Hold'em hand with partial board (flop or turn)
 * Best 5 cards from 2 hole + available community cards
 *
 * @param holeCards - Player's 2 hole cards
 * @param boardCards - 3, 4, or 5 community cards
 * @returns Hand evaluation based on available cards
 */
export function evaluateHoldemHandPartial(
  holeCards: string[],
  boardCards: string[],
): HandEvaluation {
  if (boardCards.length < 3 || boardCards.length > 5) {
    evalLogger.error(
      { boardCardsCount: boardCards.length },
      "Invalid board - must have 3-5 cards",
    );
    return { rank: -1, description: "Invalid board", hand: [] };
  }

  if (holeCards.length !== 2) {
    evalLogger.error(
      { holeCardsCount: holeCards.length },
      "Invalid Hold'em hand - must have 2 hole cards",
    );
    return { rank: Infinity, description: "Invalid hand", hand: [] };
  }

  try {
    // Combine hole cards and board cards
    const allCards = [...holeCards, ...boardCards];

    // Type assertion needed because hand-evaluator expects specific card type union
    const result = evaluate({
      holeCards: allCards as unknown as Parameters<
        typeof evaluate
      >[0]["holeCards"],
    });

    const description = getDetailedDescription(
      result.strength,
      result.hand as unknown as string[],
    );

    evalLogger.debug(
      {
        holeCards,
        boardCards,
        rank: result.strength,
        description,
        hand: result.hand,
      },
      "Hold'em partial hand evaluated",
    );

    return {
      rank: result.strength,
      description,
      hand: result.hand as unknown as string[],
    };
  } catch (error) {
    evalLogger.error(
      {
        holeCards,
        boardCards,
        error: error instanceof Error ? error.message : String(error),
      },
      "Hold'em hand evaluation failed",
    );
    return { rank: -1, description: "Evaluation error", hand: [] };
  }
}

/**
 * Evaluates Hold'em hand using best 5 cards from 2 hole + 5 board
 * Returns best possible 5-card hand
 */
export function evaluateHoldemHand(
  holeCards: string[], // 2 cards
  boardCards: string[], // 5 cards
): HandEvaluation {
  if (holeCards.length !== 2) {
    evalLogger.error(
      { holeCardsCount: holeCards.length },
      "Invalid Hold'em hand - must have 2 hole cards",
    );
    return { rank: Infinity, description: "Invalid hand", hand: [] };
  }

  if (boardCards.length !== 5) {
    evalLogger.error(
      { boardCardsCount: boardCards.length },
      "Invalid board - must have 5 cards",
    );
    return { rank: Infinity, description: "Invalid board", hand: [] };
  }

  try {
    // Combine hole cards and board cards
    const allCards = [...holeCards, ...boardCards];

    // Type assertion needed because hand-evaluator expects specific card type union
    const result = evaluate({
      holeCards: allCards as unknown as Parameters<
        typeof evaluate
      >[0]["holeCards"],
    });

    const description = getDetailedDescription(
      result.strength,
      result.hand as unknown as string[],
    );

    evalLogger.debug(
      {
        holeCards,
        boardCards,
        rank: result.strength,
        description,
        hand: result.hand,
      },
      "Hold'em hand evaluated",
    );

    return {
      rank: result.strength,
      description,
      hand: result.hand as unknown as string[],
    };
  } catch (error) {
    evalLogger.error(
      {
        holeCards,
        boardCards,
        error: error instanceof Error ? error.message : String(error),
      },
      "Hold'em hand evaluation failed",
    );
    return { rank: -1, description: "Evaluation error", hand: [] };
  }
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
): Array<{
  seatNumber: number;
  rank: number;
  description: string;
  hand: string[];
}> {
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

  // Find best hand using full compare (strength + kickers)
  const bestEvaluation = evaluations.reduce<
    (typeof evaluations)[number] | null
  >((best, current) => {
    if (!best) return current;
    const comparison = compare(
      {
        strength: current.rank,
        hand: current.hand as unknown as Parameters<typeof compare>[0]["hand"],
      },
      {
        strength: best.rank,
        hand: best.hand as unknown as Parameters<typeof compare>[0]["hand"],
      },
    );
    return comparison === -1 ? current : best;
  }, null);

  if (!bestEvaluation) {
    evalLogger.warn("No valid evaluations found");
    return [];
  }

  // Return all players with the best rank (handles ties)
  const winners = evaluations.filter(
    (e) =>
      compare(
        {
          strength: e.rank,
          hand: e.hand as unknown as Parameters<typeof compare>[0]["hand"],
        },
        {
          strength: bestEvaluation.rank,
          hand: bestEvaluation.hand as unknown as Parameters<
            typeof compare
          >[0]["hand"],
        },
      ) === 0,
  );

  evalLogger.info(
    {
      boardCards,
      totalPlayers: activePlayers.length,
      winnerCount: winners.length,
      bestRank: bestEvaluation.rank,
      isTie: winners.length > 1,
    },
    "Board winners determined",
  );

  return winners;
}
