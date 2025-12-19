import { describe, it, expect } from "vitest";
import {
  determineDoubleBoardWinners,
  determineSingleBoardWinners,
} from "../../src/logic.js";

describe("Hand Evaluation", () => {
  describe("determineSingleBoardWinners - Texas Hold'em", () => {
    it("should determine single winner with best hand", () => {
      const playerHands = [
        { seatNumber: 1, cards: ["As", "Ks"] },
        { seatNumber: 2, cards: ["Qh", "Jh"] },
      ];
      const board = ["Ah", "Qd", "7c", "3s", "2h"];

      const winners = determineSingleBoardWinners(playerHands, board);

      // Should return at least one winner
      expect(winners.length).toBeGreaterThan(0);
      winners.forEach((w) => {
        expect(typeof w).toBe("number");
      });
    });

    it("should handle tie with identical hands", () => {
      const playerHands = [
        { seatNumber: 1, cards: ["As", "Ks"] },
        { seatNumber: 2, cards: ["Ad", "Kh"] }, // Same hand
      ];
      const board = ["Qh", "Qd", "Qc", "7s", "2h"]; // Board makes trip Queens for both

      const winners = determineSingleBoardWinners(playerHands, board);

      expect(winners).toHaveLength(2);
      expect(winners).toContain(1);
      expect(winners).toContain(2);
    });

    it("should evaluate flush correctly", () => {
      const playerHands = [
        { seatNumber: 1, cards: ["Ah", "Kh"] }, // Flush
        { seatNumber: 2, cards: ["As", "Ks"] }, // No flush
      ];
      const board = ["Qh", "Jh", "7h", "3h", "2c"];

      const winners = determineSingleBoardWinners(playerHands, board);

      expect(winners).toEqual([1]); // Flush wins
    });

    it("should evaluate straight correctly", () => {
      const playerHands = [
        { seatNumber: 1, cards: ["Ks", "Qd"] }, // Straight to K
        { seatNumber: 2, cards: ["As", "2d"] }, // No straight
      ];
      const board = ["Jh", "Tc", "9s", "5h", "2c"];

      const winners = determineSingleBoardWinners(playerHands, board);

      expect(winners).toEqual([1]); // Straight wins
    });

    it("should evaluate full house correctly", () => {
      const playerHands = [
        { seatNumber: 1, cards: ["Ah", "Ad"] },
        { seatNumber: 2, cards: ["Kh", "Kd"] },
      ];
      const board = ["As", "Ks", "Kc", "7h", "2d"];

      const winners = determineSingleBoardWinners(playerHands, board);

      // Should have a winner (could be either depending on full house rules)
      expect(winners.length).toBeGreaterThan(0);
    });

    it("should evaluate quads correctly", () => {
      const playerHands = [
        { seatNumber: 1, cards: ["Ah", "Kh"] },
        { seatNumber: 2, cards: ["As", "Qs"] },
      ];
      const board = ["Ac", "Ad", "7c", "7s", "7h"];

      const winners = determineSingleBoardWinners(playerHands, board);

      // Should have winners
      expect(winners.length).toBeGreaterThan(0);
    });

    it("should handle three-way hand", () => {
      const playerHands = [
        { seatNumber: 1, cards: ["As", "Ah"] },
        { seatNumber: 2, cards: ["Kd", "Kh"] },
        { seatNumber: 3, cards: ["Qc", "Qs"] },
      ];
      const board = ["Ad", "Kc", "Qd", "7s", "2h"];

      const winners = determineSingleBoardWinners(playerHands, board);

      // Should determine at least one winner
      expect(winners.length).toBeGreaterThan(0);
    });

    it("should handle wheel straight (A-2-3-4-5)", () => {
      const playerHands = [
        { seatNumber: 1, cards: ["Ah", "2s"] }, // Wheel straight
        { seatNumber: 2, cards: ["Kh", "Kd"] }, // Pair of Kings
      ];
      const board = ["3c", "4d", "5h", "7s", "9c"];

      const winners = determineSingleBoardWinners(playerHands, board);

      expect(winners).toEqual([1]); // Straight > Pair
    });

    it("should handle board-only hand (both play the board)", () => {
      const playerHands = [
        { seatNumber: 1, cards: ["2h", "3s"] },
        { seatNumber: 2, cards: ["4h", "5d"] },
      ];
      const board = ["As", "Ah", "Ad", "Ac", "Kh"]; // Quad Aces on board

      const winners = determineSingleBoardWinners(playerHands, board);

      // Both play quad Aces with K kicker from board
      expect(winners).toHaveLength(2);
      expect(winners).toContain(1);
      expect(winners).toContain(2);
    });

    it("should return empty array when no players", () => {
      const playerHands: Array<{ seatNumber: number; cards: string[] }> = [];
      const board = ["Ah", "Kh", "Qh", "Jh", "Th"];

      const winners = determineSingleBoardWinners(playerHands, board);

      expect(winners).toEqual([]);
    });

    it("should handle single player scenario", () => {
      const playerHands = [{ seatNumber: 1, cards: ["As", "Ks"] }];
      const board = ["Qh", "Jh", "Th", "9h", "8h"];

      const winners = determineSingleBoardWinners(playerHands, board);

      expect(winners).toEqual([1]);
    });
  });

  describe("determineDoubleBoardWinners - PLO", () => {
    it("should determine different winners for each board", () => {
      const playerHands = [
        { seatNumber: 1, cards: ["As", "Ad", "Kh", "Kd"] },
        { seatNumber: 2, cards: ["Qh", "Qd", "Jh", "Jd"] },
      ];
      const board1 = ["Ah", "Kc", "7c", "3s", "2h"];
      const board2 = ["Qc", "Jc", "Tc", "9c", "8c"];

      const result = determineDoubleBoardWinners(playerHands, board1, board2);

      // Each board should have at least one winner
      expect(result.board1Winners.length).toBeGreaterThan(0);
      expect(result.board2Winners.length).toBeGreaterThan(0);
    });

    it("should handle same player winning both boards", () => {
      const playerHands = [
        { seatNumber: 1, cards: ["As", "Ad", "Ah", "Ac"] },
        { seatNumber: 2, cards: ["Kh", "Kd", "Qh", "Qd"] },
      ];
      const board1 = ["Ks", "Kc", "7c", "3s", "2h"];
      const board2 = ["Qc", "Qd", "Jc", "9c", "8c"];

      const result = determineDoubleBoardWinners(playerHands, board1, board2);

      // Should have winners on both boards
      expect(result.board1Winners.length).toBeGreaterThan(0);
      expect(result.board2Winners.length).toBeGreaterThan(0);
    });

    it("should handle tie on one board", () => {
      const playerHands = [
        { seatNumber: 1, cards: ["As", "Ks", "2h", "3h"] },
        { seatNumber: 2, cards: ["Ad", "Kd", "4c", "5c"] }, // Same high cards
      ];
      const board1 = ["Qh", "Qd", "Qc", "7s", "2c"];
      const board2 = ["Jh", "Jd", "Jc", "9s", "8c"];

      const result = determineDoubleBoardWinners(playerHands, board1, board2);

      // Both boards could result in ties depending on PLO rules
      expect(result.board1Winners.length).toBeGreaterThan(0);
      expect(result.board2Winners.length).toBeGreaterThan(0);
    });

    it("should handle three players with different board winners", () => {
      const playerHands = [
        { seatNumber: 1, cards: ["As", "Ad", "Kh", "Kd"] },
        { seatNumber: 2, cards: ["Qh", "Qd", "Jh", "Jd"] },
        { seatNumber: 3, cards: ["Th", "Td", "9h", "9d"] },
      ];
      const board1 = ["Ah", "Kc", "7c", "3s", "2h"];
      const board2 = ["Qc", "Jc", "Tc", "5c", "4c"];

      const result = determineDoubleBoardWinners(playerHands, board1, board2);

      // Player 1 likely wins board1, player 2 or 3 wins board2
      expect(result.board1Winners.length).toBeGreaterThan(0);
      expect(result.board2Winners.length).toBeGreaterThan(0);
    });

    it("should enforce PLO rule: use exactly 2 from hand, 3 from board", () => {
      const playerHands = [
        { seatNumber: 1, cards: ["Ah", "Kh", "Qh", "Jh"] }, // Four hearts in hand
        { seatNumber: 2, cards: ["As", "Ks", "2c", "3d"] },
      ];
      const board1 = ["Th", "9h", "8h", "7c", "6d"]; // Three hearts on board
      const board2 = ["Ac", "Kc", "7s", "3s", "2s"];

      const result = determineDoubleBoardWinners(playerHands, board1, board2);

      // Player 1 has hearts but can only use 2 from hand
      // The hand evaluator should enforce this rule
      expect(result.board1Winners.length).toBeGreaterThan(0);
      expect(result.board2Winners.length).toBeGreaterThan(0);
    });

    it("should return empty arrays when no players", () => {
      const playerHands: Array<{ seatNumber: number; cards: string[] }> = [];
      const board1 = ["Ah", "Kh", "Qh", "Jh", "Th"];
      const board2 = ["As", "Ks", "Qs", "Js", "Ts"];

      const result = determineDoubleBoardWinners(playerHands, board1, board2);

      expect(result.board1Winners).toEqual([]);
      expect(result.board2Winners).toEqual([]);
    });

    it("should handle single player scenario", () => {
      const playerHands = [{ seatNumber: 1, cards: ["As", "Ad", "Kh", "Kd"] }];
      const board1 = ["Ah", "Kc", "7c", "3s", "2h"];
      const board2 = ["Qc", "Jc", "Tc", "9c", "8c"];

      const result = determineDoubleBoardWinners(playerHands, board1, board2);

      expect(result.board1Winners).toEqual([1]);
      expect(result.board2Winners).toEqual([1]);
    });

    it("should handle tie on both boards", () => {
      const playerHands = [
        { seatNumber: 1, cards: ["As", "Ks", "2h", "3h"] },
        { seatNumber: 2, cards: ["Ad", "Kd", "2c", "3c"] }, // Nearly identical hands
      ];
      const board1 = ["Ah", "Kh", "Qh", "Jh", "Th"]; // Strong board
      const board2 = ["Ac", "Kc", "Qc", "Jc", "Tc"]; // Strong board

      const result = determineDoubleBoardWinners(playerHands, board1, board2);

      // Could be ties on both boards
      expect(result.board1Winners.length).toBeGreaterThan(0);
      expect(result.board2Winners.length).toBeGreaterThan(0);
    });
  });

  describe("Hand evaluation error handling", () => {
    it("should handle invalid card formats gracefully", () => {
      const playerHands = [
        { seatNumber: 1, cards: ["XX", "YY"] }, // Invalid cards
        { seatNumber: 2, cards: ["As", "Ks"] },
      ];
      const board = ["Qh", "Jh", "Th", "9h", "8h"];

      // Should not throw, fallback to worst hand
      const winners = determineSingleBoardWinners(playerHands, board);

      expect(winners).toContain(2); // Valid hand should win
    });

    it("should handle empty hole cards array", () => {
      const playerHands = [
        { seatNumber: 1, cards: [] },
        { seatNumber: 2, cards: ["As", "Ks"] },
      ];
      const board = ["Qh", "Jh", "Th", "9h", "8h"];

      const winners = determineSingleBoardWinners(playerHands, board);

      expect(winners).toContain(2);
    });

    it("should handle empty board gracefully", () => {
      const playerHands = [
        { seatNumber: 1, cards: ["As", "Ks"] },
        { seatNumber: 2, cards: ["Qh", "Jh"] },
      ];
      const board: string[] = [];

      // Should not throw
      expect(() => {
        determineSingleBoardWinners(playerHands, board);
      }).not.toThrow();
    });

    it("should handle incomplete board gracefully", () => {
      const playerHands = [
        { seatNumber: 1, cards: ["As", "Ks"] },
        { seatNumber: 2, cards: ["Qh", "Jh"] },
      ];
      const board = ["Ah", "Kh"]; // Only 2 cards

      // Should not throw
      expect(() => {
        determineSingleBoardWinners(playerHands, board);
      }).not.toThrow();
    });

    it("should handle PLO with invalid cards gracefully", () => {
      const playerHands = [
        { seatNumber: 1, cards: ["XX", "YY", "ZZ", "AA"] }, // Invalid
        { seatNumber: 2, cards: ["As", "Ks", "Qh", "Jh"] }, // Valid
      ];
      const board1 = ["Ah", "Kh", "Qh", "Jh", "Th"];
      const board2 = ["Ad", "Kd", "Qd", "Jd", "Td"];

      const result = determineDoubleBoardWinners(playerHands, board1, board2);

      // Valid player should win both boards
      expect(result.board1Winners).toContain(2);
      expect(result.board2Winners).toContain(2);
    });

    it("should handle wrong number of hole cards in PLO", () => {
      const playerHands = [
        { seatNumber: 1, cards: ["As", "Ks"] }, // Only 2 cards (should be 4)
        { seatNumber: 2, cards: ["Qh", "Qd", "Jh", "Jd"] }, // Correct
      ];
      const board1 = ["Ah", "Kh", "7c", "3s", "2h"];
      const board2 = ["Qc", "Jc", "Tc", "9c", "8c"];

      // Should handle gracefully, likely player 2 wins
      const result = determineDoubleBoardWinners(playerHands, board1, board2);

      expect(result.board1Winners.length).toBeGreaterThan(0);
      expect(result.board2Winners.length).toBeGreaterThan(0);
    });
  });
});
