import { describe, it, expect } from 'vitest';
import { calculateSidePots } from '../../src/logic.js';
import { createPlayer } from '../fixtures/players.js';

describe('Side Pot Calculation', () => {
  describe('calculateSidePots', () => {
    it('should return empty array when no contributions', () => {
      const players = [
        createPlayer({ seat_number: 1, total_invested_this_hand: 0 }),
        createPlayer({ seat_number: 2, total_invested_this_hand: 0 })
      ];

      expect(calculateSidePots(players)).toEqual([]);
    });

    it('should return empty array when all players folded', () => {
      const players = [
        createPlayer({ seat_number: 1, total_invested_this_hand: 100, has_folded: true }),
        createPlayer({ seat_number: 2, total_invested_this_hand: 100, has_folded: true })
      ];

      expect(calculateSidePots(players)).toEqual([]);
    });

    it('should create single pot when all invest equally', () => {
      const players = [
        createPlayer({ seat_number: 1, total_invested_this_hand: 100 }),
        createPlayer({ seat_number: 2, total_invested_this_hand: 100 }),
        createPlayer({ seat_number: 3, total_invested_this_hand: 100 })
      ];

      const pots = calculateSidePots(players);
      expect(pots).toEqual([
        { amount: 300, eligibleSeats: [1, 2, 3] }
      ]);
    });

    it('should create side pots for different all-in amounts', () => {
      const players = [
        createPlayer({ seat_number: 1, total_invested_this_hand: 50, is_all_in: true }),
        createPlayer({ seat_number: 2, total_invested_this_hand: 100, is_all_in: true }),
        createPlayer({ seat_number: 3, total_invested_this_hand: 200 })
      ];

      const pots = calculateSidePots(players);

      // Main pot: 50 * 3 = 150 (all eligible)
      // Side pot 1: 50 * 2 = 100 (seats 2, 3)
      // Side pot 2: 100 * 1 = 100 (seat 3 only)
      expect(pots).toEqual([
        { amount: 150, eligibleSeats: [1, 2, 3] },
        { amount: 100, eligibleSeats: [2, 3] },
        { amount: 100, eligibleSeats: [3] }
      ]);
    });

    it('should exclude folded players from pots', () => {
      const players = [
        createPlayer({ seat_number: 1, total_invested_this_hand: 50, has_folded: true }),
        createPlayer({ seat_number: 2, total_invested_this_hand: 100 }),
        createPlayer({ seat_number: 3, total_invested_this_hand: 100 })
      ];

      const pots = calculateSidePots(players);
      // Folded player's chips go to pot but they're not eligible
      expect(pots).toEqual([
        { amount: 200, eligibleSeats: [2, 3] }
      ]);
    });

    it('should exclude spectators', () => {
      const players = [
        createPlayer({ seat_number: 1, total_invested_this_hand: 100, is_spectating: true }),
        createPlayer({ seat_number: 2, total_invested_this_hand: 100 }),
        createPlayer({ seat_number: 3, total_invested_this_hand: 100 })
      ];

      const pots = calculateSidePots(players);
      expect(pots).toEqual([
        { amount: 200, eligibleSeats: [2, 3] }
      ]);
    });

    it('should exclude sitting out players', () => {
      const players = [
        createPlayer({ seat_number: 1, total_invested_this_hand: 100, is_sitting_out: true }),
        createPlayer({ seat_number: 2, total_invested_this_hand: 100 }),
        createPlayer({ seat_number: 3, total_invested_this_hand: 100 })
      ];

      const pots = calculateSidePots(players);
      expect(pots).toEqual([
        { amount: 200, eligibleSeats: [2, 3] }
      ]);
    });

    it('should handle three different all-in levels', () => {
      const players = [
        createPlayer({ seat_number: 1, total_invested_this_hand: 25 }),
        createPlayer({ seat_number: 2, total_invested_this_hand: 50 }),
        createPlayer({ seat_number: 3, total_invested_this_hand: 100 }),
        createPlayer({ seat_number: 4, total_invested_this_hand: 200 })
      ];

      const pots = calculateSidePots(players);

      expect(pots).toEqual([
        { amount: 100, eligibleSeats: [1, 2, 3, 4] },  // 25 * 4
        { amount: 75, eligibleSeats: [2, 3, 4] },      // 25 * 3
        { amount: 100, eligibleSeats: [3, 4] },        // 50 * 2
        { amount: 100, eligibleSeats: [4] }            // 100 * 1
      ]);
    });

    it('should handle heads-up pot', () => {
      const players = [
        createPlayer({ seat_number: 1, total_invested_this_hand: 100 }),
        createPlayer({ seat_number: 2, total_invested_this_hand: 100 })
      ];

      const pots = calculateSidePots(players);
      expect(pots).toEqual([
        { amount: 200, eligibleSeats: [1, 2] }
      ]);
    });

    it('should handle single player remaining (everyone else folded)', () => {
      const players = [
        createPlayer({ seat_number: 1, total_invested_this_hand: 50, has_folded: true }),
        createPlayer({ seat_number: 2, total_invested_this_hand: 100, has_folded: true }),
        createPlayer({ seat_number: 3, total_invested_this_hand: 100 })
      ];

      const pots = calculateSidePots(players);
      expect(pots).toEqual([
        { amount: 100, eligibleSeats: [3] }
      ]);
    });

    it('should handle identical investments from multiple all-ins', () => {
      const players = [
        createPlayer({ seat_number: 1, total_invested_this_hand: 50, is_all_in: true }),
        createPlayer({ seat_number: 2, total_invested_this_hand: 50, is_all_in: true }),
        createPlayer({ seat_number: 3, total_invested_this_hand: 50, is_all_in: true }),
        createPlayer({ seat_number: 4, total_invested_this_hand: 100 })
      ];

      const pots = calculateSidePots(players);
      expect(pots).toEqual([
        { amount: 200, eligibleSeats: [1, 2, 3, 4] },  // 50 * 4
        { amount: 50, eligibleSeats: [4] }             // 50 * 1
      ]);
    });

    it('should handle complex multi-player scenario', () => {
      const players = [
        createPlayer({ seat_number: 1, total_invested_this_hand: 10 }),
        createPlayer({ seat_number: 2, total_invested_this_hand: 20, has_folded: true }),
        createPlayer({ seat_number: 3, total_invested_this_hand: 30 }),
        createPlayer({ seat_number: 4, total_invested_this_hand: 40 }),
        createPlayer({ seat_number: 5, total_invested_this_hand: 50 })
      ];

      const pots = calculateSidePots(players);

      // Only seats 1, 3, 4, 5 are eligible (seat 2 folded)
      expect(pots).toEqual([
        { amount: 40, eligibleSeats: [1, 3, 4, 5] },   // 10 * 4
        { amount: 60, eligibleSeats: [3, 4, 5] },      // 20 * 3
        { amount: 20, eligibleSeats: [4, 5] },         // 10 * 2
        { amount: 10, eligibleSeats: [5] }             // 10 * 1
      ]);
    });
  });
});
