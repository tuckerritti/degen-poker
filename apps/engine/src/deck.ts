import seedrandom from "seedrandom";

const RANKS = [
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "T",
  "J",
  "Q",
  "K",
  "A",
] as const;
const SUITS = ["c", "d", "h", "s"] as const;

export type Card = `${(typeof RANKS)[number]}${(typeof SUITS)[number]}`;

export function freshDeck(): Card[] {
  const deck: Card[] = [];
  for (const r of RANKS) {
    for (const s of SUITS) {
      deck.push(`${r}${s}` as Card);
    }
  }
  return deck;
}

export function shuffleDeck(seed: string): Card[] {
  const rng = seedrandom(seed);
  const deck = freshDeck();
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

/**
 * Creates two shuffled decks combined (104 cards total)
 * Used for 321 mode when single deck is insufficient
 */
export function shuffleDoubleDeck(seed: string): Card[] {
  const rng = seedrandom(seed);
  const deck1 = freshDeck();
  const deck2 = freshDeck();
  const combined = [...deck1, ...deck2];

  // Fisher-Yates shuffle on combined deck
  for (let i = combined.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [combined[i], combined[j]] = [combined[j], combined[i]];
  }

  return combined;
}

/**
 * Determines if two decks are needed for a game
 * @param numPlayers - Number of active players
 * @param cardsPerPlayer - Hole cards per player (6 for 321, 4 for PLO, 2 for Holdem)
 * @param boardCards - Total community cards (15 for 321, 10 for double board, 5 for single)
 */
export function needsTwoDecks(
  numPlayers: number,
  cardsPerPlayer: number,
  boardCards: number,
): boolean {
  const totalCards = numPlayers * cardsPerPlayer + boardCards;
  return totalCards > 52;
}
