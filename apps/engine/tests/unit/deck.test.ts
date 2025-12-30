import { describe, it, expect } from "vitest";
import {
  freshDeck,
  shuffleDeck,
  shuffleDoubleDeck,
  needsTwoDecks,
} from "../../src/deck.js";

describe("Deck Utilities", () => {
  describe("freshDeck", () => {
    it("should generate 52 unique cards", () => {
      const deck = freshDeck();
      expect(deck).toHaveLength(52);
      expect(new Set(deck).size).toBe(52);
    });

    it("should contain all ranks and suits", () => {
      const deck = freshDeck();
      const ranks = [
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
      ];
      const suits = ["c", "d", "h", "s"];

      ranks.forEach((rank) => {
        suits.forEach((suit) => {
          const card = `${rank}${suit}`;
          expect(deck).toContain(card);
        });
      });
    });

    it("should have cards in predictable order (ranks first, then suits)", () => {
      const deck = freshDeck();
      expect(deck[0]).toBe("2c");
      expect(deck[1]).toBe("2d");
      expect(deck[2]).toBe("2h");
      expect(deck[3]).toBe("2s");
      expect(deck[4]).toBe("3c");
    });

    it("should end with Ace of spades", () => {
      const deck = freshDeck();
      expect(deck[51]).toBe("As");
    });
  });

  describe("shuffleDeck", () => {
    it("should produce same shuffle with same seed", () => {
      const seed = "test-seed-123";
      const deck1 = shuffleDeck(seed);
      const deck2 = shuffleDeck(seed);

      expect(deck1).toEqual(deck2);
    });

    it("should produce different shuffle with different seed", () => {
      const deck1 = shuffleDeck("seed-1");
      const deck2 = shuffleDeck("seed-2");

      expect(deck1).not.toEqual(deck2);
    });

    it("should still contain all 52 cards after shuffle", () => {
      const deck = shuffleDeck("random-seed");
      expect(deck).toHaveLength(52);
      expect(new Set(deck).size).toBe(52);
    });

    it("should contain same cards as fresh deck, just in different order", () => {
      const fresh = freshDeck();
      const shuffled = shuffleDeck("test-seed");

      const freshSorted = [...fresh].sort();
      const shuffledSorted = [...shuffled].sort();

      expect(shuffledSorted).toEqual(freshSorted);
    });

    it("should actually shuffle (not return original order)", () => {
      const fresh = freshDeck();
      const shuffled = shuffleDeck("test-seed");

      // Very unlikely to have the same order after shuffle
      expect(shuffled).not.toEqual(fresh);
    });

    it("should be deterministic across multiple calls", () => {
      const seed = "deterministic-test";
      const results = Array.from({ length: 5 }, () => shuffleDeck(seed));

      results.forEach((deck) => {
        expect(deck).toEqual(results[0]);
      });
    });
  });

  describe("needsTwoDecks", () => {
    it("should return false when exactly 52 cards needed", () => {
      // 23 players × 2 cards (Hold'em) + 5 board = 51 cards
      expect(needsTwoDecks(23, 2, 5)).toBe(false);
    });

    it("should return true when exactly 53 cards needed", () => {
      // 24 players × 2 cards (Hold'em) + 5 board = 53 cards
      expect(needsTwoDecks(24, 2, 5)).toBe(true);
    });

    it("should return false for zero players", () => {
      expect(needsTwoDecks(0, 4, 10)).toBe(false);
    });

    describe("321 Mode (6 cards per player, 15 board cards)", () => {
      it("should return false for 6 players (51 cards)", () => {
        // 6 × 6 = 36 player cards + 15 board = 51 total
        expect(needsTwoDecks(6, 6, 15)).toBe(false);
      });

      it("should return true for 7 players (57 cards)", () => {
        // 7 × 6 = 42 player cards + 15 board = 57 total
        expect(needsTwoDecks(7, 6, 15)).toBe(true);
      });

      it("should return true for 9 players (69 cards)", () => {
        // 9 × 6 = 54 player cards + 15 board = 69 total
        expect(needsTwoDecks(9, 6, 15)).toBe(true);
      });
    });

    describe("PLO Double Board (4 cards per player, 10 board cards)", () => {
      it("should return false for 10 players (50 cards)", () => {
        // 10 × 4 = 40 player cards + 10 board = 50 total
        expect(needsTwoDecks(10, 4, 10)).toBe(false);
      });

      it("should return true for 11 players (54 cards)", () => {
        // 11 × 4 = 44 player cards + 10 board = 54 total
        expect(needsTwoDecks(11, 4, 10)).toBe(true);
      });
    });

    describe("Texas Hold'em (2 cards per player, 5 board cards)", () => {
      it("should return false for 23 players (51 cards)", () => {
        // 23 × 2 = 46 player cards + 5 board = 51 total
        expect(needsTwoDecks(23, 2, 5)).toBe(false);
      });

      it("should return true for 24 players (53 cards)", () => {
        // 24 × 2 = 48 player cards + 5 board = 53 total
        expect(needsTwoDecks(24, 2, 5)).toBe(true);
      });
    });

    describe("Indian Poker (1 card per player, 0 board cards)", () => {
      it("should return false for 52 players (52 cards)", () => {
        // 52 × 1 = 52 player cards + 0 board = 52 total
        expect(needsTwoDecks(52, 1, 0)).toBe(false);
      });

      it("should return true for 53 players (53 cards)", () => {
        // 53 × 1 = 53 player cards + 0 board = 53 total
        expect(needsTwoDecks(53, 1, 0)).toBe(true);
      });
    });
  });

  describe("shuffleDoubleDeck", () => {
    it("should return 104 cards", () => {
      const deck = shuffleDoubleDeck("test-seed");
      expect(deck).toHaveLength(104);
    });

    it("should contain exactly 2 of each card", () => {
      const deck = shuffleDoubleDeck("test-seed");
      const cardCounts = new Map<string, number>();

      deck.forEach((card) => {
        cardCounts.set(card, (cardCounts.get(card) || 0) + 1);
      });

      // Should have 52 unique cards, each appearing exactly twice
      expect(cardCounts.size).toBe(52);
      cardCounts.forEach((count) => {
        expect(count).toBe(2);
      });
    });

    it("should shuffle deterministically with same seed", () => {
      const deck1 = shuffleDoubleDeck("identical-seed");
      const deck2 = shuffleDoubleDeck("identical-seed");

      expect(deck1).toEqual(deck2);
    });

    it("should shuffle differently with different seeds", () => {
      const deck1 = shuffleDoubleDeck("seed-one");
      const deck2 = shuffleDoubleDeck("seed-two");

      expect(deck1).not.toEqual(deck2);
    });

    it("should contain all valid card strings", () => {
      const deck = shuffleDoubleDeck("validation-seed");

      deck.forEach((card) => {
        expect(typeof card).toBe("string");
        expect(card).toHaveLength(2);
        // Valid ranks: 2-9, T, J, Q, K, A
        // Valid suits: c, d, h, s
        expect(card).toMatch(/^[2-9TJQKA][cdhs]$/);
      });
    });

    it("should have different order than single deck", () => {
      const singleDeck = shuffleDeck("same-seed");
      const doubleDeck = shuffleDoubleDeck("same-seed");

      // First 52 cards of double deck should not match single deck
      // (because shuffling 104 cards produces different results than 52)
      const firstHalfDouble = doubleDeck.slice(0, 52);
      expect(firstHalfDouble).not.toEqual(singleDeck);
    });

    it("should be deterministic across multiple calls", () => {
      const seed = "double-deterministic-test";
      const results = Array.from({ length: 5 }, () => shuffleDoubleDeck(seed));

      results.forEach((deck) => {
        expect(deck).toEqual(results[0]);
      });
    });
  });
});
