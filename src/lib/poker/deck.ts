import crypto from "crypto";
import { createLogger } from "@/lib/logger";

const deckLogger = createLogger("poker-deck");

const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"];
const SUITS = ["h", "d", "c", "s"]; // hearts, diamonds, clubs, spades

/**
 * Creates a standard 52-card deck
 */
export function createDeck(): string[] {
  const deck: string[] = [];
  for (const rank of RANKS) {
    for (const suit of SUITS) {
      deck.push(rank + suit);
    }
  }
  return deck;
}

/**
 * Generates a cryptographically secure random seed
 */
export function generateSeed(): string {
  const seed = crypto.randomBytes(32).toString("hex");
  deckLogger.debug({ seedLength: seed.length }, "Generated new deck seed");
  return seed;
}

/**
 * Shuffles a deck using a deterministic seed (Fisher-Yates)
 */
export function shuffleDeck(seed: string): string[] {
  deckLogger.debug(
    { seed: seed.substring(0, 8) + "..." },
    "Shuffling deck with seed",
  );
  const deck = createDeck();

  // Verify deck has no nulls before shuffling
  const nullsBefore = deck.filter((c) => c == null).length;
  if (nullsBefore > 0) {
    deckLogger.error({ nullsBefore }, "Deck has nulls before shuffling!");
  }

  // Seeded Fisher-Yates shuffle
  const rng = seedRandom(seed);

  for (let i = deck.length - 1; i > 0; i--) {
    const rngValue = rng();
    const j = Math.floor(rngValue * (i + 1));

    // Bounds check to catch issues
    if (j < 0 || j > i) {
      deckLogger.error(
        { i, j, rngValue, iPlus1: i + 1 },
        "Invalid swap index!",
      );
      continue;
    }

    // Use temporary variable for safer swap
    const temp = deck[i];
    deck[i] = deck[j];
    deck[j] = temp;
  }

  // Verify deck has no nulls after shuffling
  const nullsAfter = deck.filter((c) => c == null).length;
  if (nullsAfter > 0) {
    deckLogger.error(
      { nullsAfter, sample: deck.slice(0, 20) },
      "Deck has nulls after shuffling!",
    );
  }

  deckLogger.debug({ deckSize: deck.length }, "Deck shuffled successfully");
  return deck;
}

/**
 * Simple seeded PRNG using linear congruential generator
 * For production, consider using a crypto library for better randomness
 */
function seedRandom(seed: string): () => number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash = hash | 0; // Convert to 32-bit integer
  }

  // Ensure hash is positive
  hash = Math.abs(hash);

  return function () {
    hash = (hash * 9301 + 49297) % 233280;
    // Ensure result is always in [0, 1)
    return Math.abs(hash) / 233280;
  };
}

/**
 * Gets a card at a specific index from the deck
 */
export function getCardAtIndex(deck: string[], index: number): string {
  if (index < 0 || index >= deck.length) {
    throw new Error(`Invalid card index: ${index}`);
  }
  return deck[index];
}

/**
 * Gets multiple cards from a deck by indices
 */
export function getCardsAtIndices(deck: string[], indices: number[]): string[] {
  return indices.map((index) => getCardAtIndex(deck, index));
}

/**
 * Converts card string to readable format
 * Example: "Ah" -> "Ace of Hearts"
 */
export function cardToString(card: string): string {
  const rank = card[0];
  const suit = card[1];

  const rankNames: Record<string, string> = {
    "2": "Two",
    "3": "Three",
    "4": "Four",
    "5": "Five",
    "6": "Six",
    "7": "Seven",
    "8": "Eight",
    "9": "Nine",
    T: "Ten",
    J: "Jack",
    Q: "Queen",
    K: "King",
    A: "Ace",
  };

  const suitNames: Record<string, string> = {
    h: "Hearts",
    d: "Diamonds",
    c: "Clubs",
    s: "Spades",
  };

  return `${rankNames[rank]} of ${suitNames[suit]}`;
}
