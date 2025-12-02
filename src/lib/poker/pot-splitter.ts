import { createLogger } from "@/lib/logger";
import { findBoardWinners } from "./hand-evaluator";

const potLogger = createLogger("poker-pot");

export interface Winner {
  seatNumber: number;
  amount: number;
  board: "A" | "B";
  handRank: number;
  handDescription: string;
}

export interface PlayerInHand {
  seatNumber: number;
  holeCards: string[];
  hasFolded: boolean;
  totalInvested: number;
}

/**
 * Splits the pot between players on Board A and Board B
 * Each board gets 50% of the total pot
 *
 * Uses actual PLO hand evaluation to determine winners on each board
 */
export function splitPot(
  players: PlayerInHand[],
  boardA: string[],
  boardB: string[],
  potSize: number,
): Winner[] {
  potLogger.info(
    {
      totalPlayers: players.length,
      potSize,
      boardACards: boardA.length,
      boardBCards: boardB.length,
    },
    "Splitting pot with hand evaluation",
  );

  const activePlayers = players.filter((p) => !p.hasFolded);

  potLogger.debug(
    {
      activePlayers: activePlayers.length,
      foldedPlayers: players.length - activePlayers.length,
    },
    "Active players determined",
  );

  if (activePlayers.length === 0) {
    potLogger.warn("No active players - cannot split pot");
    return [];
  }

  // If only one player remains, they win everything
  if (activePlayers.length === 1) {
    potLogger.info(
      {
        winner: activePlayers[0].seatNumber,
        amount: potSize,
      },
      "Single winner takes entire pot",
    );
    return [
      {
        seatNumber: activePlayers[0].seatNumber,
        amount: potSize,
        board: "A",
        handRank: 0,
        handDescription: "Winner by default",
      },
    ];
  }

  // Evaluate hands for both boards
  const boardAWinners = findBoardWinners(
    activePlayers.map((p) => ({
      seatNumber: p.seatNumber,
      holeCards: p.holeCards,
      hasFolded: p.hasFolded,
    })),
    boardA,
  );

  const boardBWinners = findBoardWinners(
    activePlayers.map((p) => ({
      seatNumber: p.seatNumber,
      holeCards: p.holeCards,
      hasFolded: p.hasFolded,
    })),
    boardB,
  );

  // Split pot 50/50 between boards
  const halfPot = Math.floor(potSize / 2);
  const oddChip = potSize % 2;

  const winners: Winner[] = [];

  // Board A: split half pot (with odd chip) among winners
  if (boardAWinners.length > 0) {
    const amountPerWinnerA = Math.floor(
      (halfPot + oddChip) / boardAWinners.length,
    );
    const remainderA = (halfPot + oddChip) % boardAWinners.length;

    boardAWinners.forEach((winner, idx) => {
      winners.push({
        seatNumber: winner.seatNumber,
        amount: amountPerWinnerA + (idx === 0 ? remainderA : 0),
        board: "A",
        handRank: winner.rank,
        handDescription: winner.description,
      });
    });
  }

  // Board B: split half pot among winners
  if (boardBWinners.length > 0) {
    const amountPerWinnerB = Math.floor(halfPot / boardBWinners.length);
    const remainderB = halfPot % boardBWinners.length;

    boardBWinners.forEach((winner, idx) => {
      winners.push({
        seatNumber: winner.seatNumber,
        amount: amountPerWinnerB + (idx === 0 ? remainderB : 0),
        board: "B",
        handRank: winner.rank,
        handDescription: winner.description,
      });
    });
  }

  potLogger.info(
    {
      totalWinners: winners.length,
      boardAWinners: boardAWinners.length,
      boardBWinners: boardBWinners.length,
      totalDistributed: winners.reduce((sum, w) => sum + w.amount, 0),
      scoops: activePlayers
        .filter(
          (p) =>
            boardAWinners.some((w) => w.seatNumber === p.seatNumber) &&
            boardBWinners.some((w) => w.seatNumber === p.seatNumber),
        )
        .map((p) => p.seatNumber),
    },
    "Pot split complete with hand evaluation",
  );

  return winners;
}

/**
 * Creates side pots when players are all-in with different chip amounts
 */
export function createSidePots(
  players: Array<{
    seatNumber: number;
    totalInvested: number;
    hasFolded: boolean;
  }>,
): Array<{ amount: number; eligibleSeats: number[] }> {
  potLogger.debug(
    {
      totalPlayers: players.length,
    },
    "Creating side pots",
  );

  const activePlayers = players.filter((p) => !p.hasFolded);

  if (activePlayers.length === 0) {
    potLogger.warn("No active players for side pots");
    return [];
  }

  // Sort players by amount invested
  const sorted = [...activePlayers].sort(
    (a, b) => a.totalInvested - b.totalInvested,
  );

  const pots: Array<{ amount: number; eligibleSeats: number[] }> = [];
  let lastInvestment = 0;

  for (let i = 0; i < sorted.length; i++) {
    const player = sorted[i];
    const investment = player.totalInvested;

    if (investment > lastInvestment) {
      // Calculate pot amount from this level
      const levelAmount = investment - lastInvestment;
      const numPlayers = sorted.length - i;
      const potAmount = levelAmount * numPlayers;

      // All players from this point onwards are eligible
      const eligibleSeats = sorted.slice(i).map((p) => p.seatNumber);

      pots.push({
        amount: potAmount,
        eligibleSeats,
      });

      lastInvestment = investment;
    }
  }

  potLogger.info(
    {
      sidePotCount: pots.length,
      totalAmount: pots.reduce((sum, p) => sum + p.amount, 0),
    },
    "Side pots created",
  );

  return pots;
}

/**
 * Splits multiple side pots between boards A and B
 * Each side pot is split 50/50 between the two boards
 */
export function splitPotWithSidePots(
  players: PlayerInHand[],
  boardA: string[],
  boardB: string[],
  sidePots: Array<{ amount: number; eligibleSeats: number[] }>,
): Winner[] {
  const allWinners: Winner[] = [];

  potLogger.info(
    {
      sidePotCount: sidePots.length,
      totalPlayers: players.length,
    },
    "Splitting side pots",
  );

  for (const [potIndex, pot] of sidePots.entries()) {
    potLogger.debug(
      {
        potIndex,
        amount: pot.amount,
        eligibleSeats: pot.eligibleSeats,
      },
      "Processing side pot",
    );

    // Filter to eligible players for this pot
    const eligiblePlayers = players.filter((p) =>
      pot.eligibleSeats.includes(p.seatNumber),
    );

    // Split this pot's amount between boards
    const potWinners = splitPot(eligiblePlayers, boardA, boardB, pot.amount);

    allWinners.push(...potWinners);
  }

  potLogger.info(
    {
      totalWinners: allWinners.length,
      totalDistributed: allWinners.reduce((sum, w) => sum + w.amount, 0),
    },
    "All side pots distributed",
  );

  return allWinners;
}
