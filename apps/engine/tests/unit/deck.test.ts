import { describe, it, expect } from 'vitest';
import { freshDeck, shuffleDeck } from '../../src/deck.js';

describe('Deck Utilities', () => {
  describe('freshDeck', () => {
    it('should generate 52 unique cards', () => {
      const deck = freshDeck();
      expect(deck).toHaveLength(52);
      expect(new Set(deck).size).toBe(52);
    });

    it('should contain all ranks and suits', () => {
      const deck = freshDeck();
      const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
      const suits = ['c', 'd', 'h', 's'];

      ranks.forEach(rank => {
        suits.forEach(suit => {
          const card = `${rank}${suit}`;
          expect(deck).toContain(card);
        });
      });
    });

    it('should have cards in predictable order (ranks first, then suits)', () => {
      const deck = freshDeck();
      expect(deck[0]).toBe('2c');
      expect(deck[1]).toBe('2d');
      expect(deck[2]).toBe('2h');
      expect(deck[3]).toBe('2s');
      expect(deck[4]).toBe('3c');
    });

    it('should end with Ace of spades', () => {
      const deck = freshDeck();
      expect(deck[51]).toBe('As');
    });
  });

  describe('shuffleDeck', () => {
    it('should produce same shuffle with same seed', () => {
      const seed = 'test-seed-123';
      const deck1 = shuffleDeck(seed);
      const deck2 = shuffleDeck(seed);

      expect(deck1).toEqual(deck2);
    });

    it('should produce different shuffle with different seed', () => {
      const deck1 = shuffleDeck('seed-1');
      const deck2 = shuffleDeck('seed-2');

      expect(deck1).not.toEqual(deck2);
    });

    it('should still contain all 52 cards after shuffle', () => {
      const deck = shuffleDeck('random-seed');
      expect(deck).toHaveLength(52);
      expect(new Set(deck).size).toBe(52);
    });

    it('should contain same cards as fresh deck, just in different order', () => {
      const fresh = freshDeck();
      const shuffled = shuffleDeck('test-seed');

      const freshSorted = [...fresh].sort();
      const shuffledSorted = [...shuffled].sort();

      expect(shuffledSorted).toEqual(freshSorted);
    });

    it('should actually shuffle (not return original order)', () => {
      const fresh = freshDeck();
      const shuffled = shuffleDeck('test-seed');

      // Very unlikely to have the same order after shuffle
      expect(shuffled).not.toEqual(fresh);
    });

    it('should be deterministic across multiple calls', () => {
      const seed = 'deterministic-test';
      const results = Array.from({ length: 5 }, () => shuffleDeck(seed));

      results.forEach(deck => {
        expect(deck).toEqual(results[0]);
      });
    });
  });
});
