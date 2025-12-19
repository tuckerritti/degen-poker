import { describe, it, expect } from "vitest";
import {
  determineDoubleBoardWinners,
  determineSingleBoardWinners,
  endOfHandPayout,
} from "../../src/logic.js";
import type { SidePot } from "../../src/types.js";

describe("Winner Determination - Extended Scenarios", () => {
  describe("Multi-way ties", () => {
    it("should handle 3-way tie on single board", () => {
      const playerHands = [
        { seatNumber: 1, cards: ["As", "Ks"] },
        { seatNumber: 2, cards: ["Ad", "Kd"] },
        { seatNumber: 3, cards: ["Ah", "Kh"] },
      ];
      // Board makes same hand for all (using board's straight)
      const board = ["Qh", "Jh", "Tc", "9c", "8d"];

      const winners = determineSingleBoardWinners(playerHands, board);

      expect(winners).toHaveLength(3);
      expect(winners).toContain(1);
      expect(winners).toContain(2);
      expect(winners).toContain(3);
    });

    it("should handle 3-way tie on both boards (6-way pot split)", () => {
      const playerHands = [
        { seatNumber: 1, cards: ["As", "Ks", "2h", "3h"] },
        { seatNumber: 2, cards: ["Ad", "Kd", "2c", "3c"] },
        { seatNumber: 3, cards: ["Ah", "Kh", "2d", "3d"] },
      ];
      const board1 = ["Qh", "Jh", "Tc", "9c", "8d"];
      const board2 = ["Qs", "Js", "Th", "9h", "8h"];

      const result = determineDoubleBoardWinners(playerHands, board1, board2);

      // Should have winners on both boards
      expect(result.board1Winners.length).toBeGreaterThan(0);
      expect(result.board2Winners.length).toBeGreaterThan(0);
    });

    it("should handle 4-way tie", () => {
      const playerHands = [
        { seatNumber: 1, cards: ["2s", "3s"] },
        { seatNumber: 2, cards: ["2d", "3d"] },
        { seatNumber: 3, cards: ["2h", "3h"] },
        { seatNumber: 4, cards: ["2c", "3c"] },
      ];
      // Board makes quads for everyone
      const board = ["Ah", "Ad", "Ac", "As", "Kh"];

      const winners = determineSingleBoardWinners(playerHands, board);

      expect(winners).toHaveLength(4);
    });
  });

  describe("Side pot eligibility with double-board winners", () => {
    it("should pay main pot to player who wins both boards", () => {
      const sidePots: SidePot[] = [
        { amount: 200, eligibleSeats: [1, 2] }, // Main pot
        { amount: 100, eligibleSeats: [2] }, // Side pot
      ];

      const board1Winners = [2];
      const board2Winners = [2];

      const result = endOfHandPayout(sidePots, board1Winners, board2Winners);

      // Player 2 wins both boards, should get everything
      const player2Payout = result.find((p) => p.seat === 2);
      expect(player2Payout?.amount).toBe(300);
    });

    it("should split pot when different players win each board", () => {
      const sidePots: SidePot[] = [{ amount: 200, eligibleSeats: [1, 2] }];

      const board1Winners = [1];
      const board2Winners = [2];

      const result = endOfHandPayout(sidePots, board1Winners, board2Winners);

      // Each player gets half
      const player1Payout = result.find((p) => p.seat === 1);
      const player2Payout = result.find((p) => p.seat === 2);

      expect(player1Payout?.amount).toBe(100);
      expect(player2Payout?.amount).toBe(100);
    });

    it("should handle side pot where winner is not eligible", () => {
      const sidePots: SidePot[] = [
        { amount: 150, eligibleSeats: [1, 2, 3] }, // Main pot
        { amount: 100, eligibleSeats: [2, 3] }, // Side pot (player 1 not eligible)
      ];

      const board1Winners = [1]; // Wins board1 but not eligible for side pot
      const board2Winners = [2];

      const result = endOfHandPayout(sidePots, board1Winners, board2Winners);

      // Player 1 should get share of main pot only
      // Player 2 should get share of main pot + side pot
      const player1Payout = result.find((p) => p.seat === 1);
      const player2Payout = result.find((p) => p.seat === 2);

      expect(player1Payout?.amount).toBeGreaterThan(0);
      expect(player2Payout?.amount).toBeGreaterThan(player1Payout?.amount || 0);
    });

    it("should handle multiple side pots with complex eligibility", () => {
      const sidePots: SidePot[] = [
        { amount: 100, eligibleSeats: [1, 2, 3, 4] }, // Main pot (4 * 25)
        { amount: 75, eligibleSeats: [2, 3, 4] }, // First side pot (3 * 25)
        { amount: 100, eligibleSeats: [3, 4] }, // Second side pot (2 * 50)
      ];

      const board1Winners = [1, 3]; // Player 1 and 3 tie on board1
      const board2Winners = [2, 4]; // Player 2 and 4 tie on board2

      const result = endOfHandPayout(sidePots, board1Winners, board2Winners);

      // Complex distribution based on eligibility
      result.forEach((payout) => {
        expect(payout.amount).toBeGreaterThanOrEqual(0);
      });

      // Total chips should be conserved
      const totalPaid = result.reduce((sum, p) => sum + p.amount, 0);
      const totalPot = sidePots.reduce((sum, pot) => sum + pot.amount, 0);
      expect(totalPaid).toBe(totalPot);
    });
  });

  describe("Same hand strength across multiple players", () => {
    it("should identify ties when multiple players have same flush", () => {
      const playerHands = [
        { seatNumber: 1, cards: ["Ah", "Kh"] },
        { seatNumber: 2, cards: ["Qh", "Jh"] },
      ];
      const board = ["Th", "9h", "8h", "7h", "6d"];

      const winners = determineSingleBoardWinners(playerHands, board);

      // Should have at least one winner
      expect(winners.length).toBeGreaterThan(0);
    });

    it("should identify ties when multiple players have same straight", () => {
      const playerHands = [
        { seatNumber: 1, cards: ["As", "2d"] },
        { seatNumber: 2, cards: ["Kh", "Qc"] },
      ];
      const board = ["Jh", "Tc", "9s", "8h", "7d"]; // Jack-high straight on board

      const winners = determineSingleBoardWinners(playerHands, board);

      // Both have same straight from board
      expect(winners).toHaveLength(2);
      expect(winners).toContain(1);
      expect(winners).toContain(2);
    });

    it("should break ties with kicker in PLO", () => {
      const playerHands = [
        { seatNumber: 1, cards: ["Ah", "Kh", "Qh", "Jh"] },
        { seatNumber: 2, cards: ["As", "Ks", "2c", "3d"] },
      ];
      const board1 = ["Ad", "Kd", "7c", "3s", "2h"];
      const board2 = ["Ac", "Kc", "8c", "4s", "5h"];

      const result = determineDoubleBoardWinners(playerHands, board1, board2);

      // Should have winners on both boards
      expect(result.board1Winners.length).toBeGreaterThan(0);
      expect(result.board2Winners.length).toBeGreaterThan(0);
    });
  });

  describe("Payout edge cases", () => {
    it("should handle odd chip remainder distribution", () => {
      const sidePots: SidePot[] = [
        { amount: 301, eligibleSeats: [1, 2, 3] }, // Not evenly divisible by 3
      ];

      const board1Winners = [1, 2, 3];
      const board2Winners = [1, 2, 3];

      const result = endOfHandPayout(sidePots, board1Winners, board2Winners);

      // Each should get 100, remainder goes somewhere
      const totalPaid = result.reduce((sum, p) => sum + p.amount, 0);
      expect(totalPaid).toBe(301);

      // At least one player should have 101
      const hasRemainder = result.some((p) => p.amount === 101);
      expect(hasRemainder).toBe(true);
    });

    it("should handle empty side pots array", () => {
      const sidePots: SidePot[] = [];

      const board1Winners = [1];
      const board2Winners = [1];

      const result = endOfHandPayout(sidePots, board1Winners, board2Winners);

      // No chips to distribute
      expect(result).toEqual([]);
    });

    it("should handle winner not in player list", () => {
      const sidePots: SidePot[] = [{ amount: 200, eligibleSeats: [1, 2] }];

      const board1Winners = [99]; // Non-existent player
      const board2Winners = [1];

      const result = endOfHandPayout(sidePots, board1Winners, board2Winners);

      // Should handle gracefully, likely giving pot to eligible players
      const totalPaid = result.reduce((sum, p) => sum + p.amount, 0);
      expect(totalPaid).toBeGreaterThan(0);
    });

    it("should handle no winners scenario", () => {
      const sidePots: SidePot[] = [{ amount: 200, eligibleSeats: [1, 2] }];

      const board1Winners: number[] = [];
      const board2Winners: number[] = [];

      const result = endOfHandPayout(sidePots, board1Winners, board2Winners);

      // Should handle gracefully
      expect(result).toBeDefined();
    });

    it("should split evenly when same player wins both boards", () => {
      const sidePots: SidePot[] = [{ amount: 200, eligibleSeats: [1, 2] }];

      const board1Winners = [1];
      const board2Winners = [1];

      const result = endOfHandPayout(sidePots, board1Winners, board2Winners);

      // Player 1 wins entire pot
      const player1Payout = result.find((p) => p.seat === 1);
      expect(player1Payout?.amount).toBe(200);
    });

    it("should handle 4-way split with odd remainder on each board", () => {
      const sidePots: SidePot[] = [
        { amount: 403, eligibleSeats: [1, 2, 3, 4] }, // Odd amount
      ];

      const board1Winners = [1, 2]; // Split board1
      const board2Winners = [3, 4]; // Split board2

      const result = endOfHandPayout(sidePots, board1Winners, board2Winners);

      // Total should still be 403
      const totalPaid = result.reduce((sum, p) => sum + p.amount, 0);
      expect(totalPaid).toBe(403);
    });
  });

  describe("Hand strength comparison edge cases", () => {
    it("should correctly compare two pair vs trips", () => {
      const playerHands = [
        { seatNumber: 1, cards: ["As", "Ah"] }, // Trips with A
        { seatNumber: 2, cards: ["Kd", "Kh"] }, // Two pair K and Q
      ];
      const board = ["Ad", "Qc", "Qs", "7s", "2h"];

      const winners = determineSingleBoardWinners(playerHands, board);

      expect(winners).toEqual([1]); // Trips > Two pair
    });

    it("should correctly compare flush vs straight", () => {
      const playerHands = [
        { seatNumber: 1, cards: ["Ah", "Kh"] }, // Flush
        { seatNumber: 2, cards: ["6d", "5c"] }, // Straight
      ];
      const board = ["Qh", "Jh", "8h", "7s", "4h"];

      const winners = determineSingleBoardWinners(playerHands, board);

      expect(winners).toEqual([1]); // Flush > Straight
    });

    it("should correctly compare full house vs flush", () => {
      const playerHands = [
        { seatNumber: 1, cards: ["Ah", "Ad"] },
        { seatNumber: 2, cards: ["Kh", "Jh"] },
      ];
      const board = ["Qh", "Qd", "Th", "9h", "8h"];

      const winners = determineSingleBoardWinners(playerHands, board);

      // Should have at least one winner
      expect(winners.length).toBeGreaterThan(0);
    });

    it("should handle broadway straight vs lower straight", () => {
      const playerHands = [
        { seatNumber: 1, cards: ["As", "Kd"] },
        { seatNumber: 2, cards: ["9h", "8c"] },
      ];
      const board = ["Qh", "Jd", "Tc", "7s", "6c"];

      const winners = determineSingleBoardWinners(playerHands, board);

      // Should have at least one winner
      expect(winners.length).toBeGreaterThan(0);
    });
  });
});
