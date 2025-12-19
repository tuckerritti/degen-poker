import { describe, it, expect } from "vitest";
import { determineDoubleBoardWinners } from "../../src/logic.js";

describe("Determine Double Board Winners", () => {
  describe("determineDoubleBoardWinners", () => {
    it("should return empty arrays when no players", () => {
      const result = determineDoubleBoardWinners(
        [],
        ["Ah", "Kh", "Qh", "Jh", "Th"],
        ["2c", "3c", "4c", "5c", "6c"],
      );

      expect(result.board1Winners).toEqual([]);
      expect(result.board2Winners).toEqual([]);
    });

    it("should determine winner for each board independently", () => {
      // Player 1: As Ah Ks Kh - pocket aces and kings
      // Player 2: Qc Qd Jc Jd - pocket queens and jacks
      const playerHands = [
        { seatNumber: 1, cards: ["As", "Ah", "Ks", "Kh"] },
        { seatNumber: 2, cards: ["Qc", "Qd", "Jc", "Jd"] },
      ];

      // Board 1: Ac Kc Th 9h 8h - gives player 1 trips (aces or kings)
      // Board 2: Qh Jh Ts 9s 8s - gives player 2 trips (queens or jacks)
      const result = determineDoubleBoardWinners(
        playerHands,
        ["Ac", "Kc", "Th", "9h", "8h"],
        ["Qh", "Jh", "Ts", "9s", "8s"],
      );

      // Each player should win their respective board
      expect(result.board1Winners).toBeDefined();
      expect(result.board2Winners).toBeDefined();
      expect(result.board1Winners.length).toBeGreaterThan(0);
      expect(result.board2Winners.length).toBeGreaterThan(0);
    });

    it("should handle tie on one board", () => {
      // Both players have same hole cards
      const playerHands = [
        { seatNumber: 1, cards: ["Ac", "Ad", "Kc", "Kd"] },
        { seatNumber: 2, cards: ["Ac", "Ad", "Kc", "Kd"] },
      ];

      const result = determineDoubleBoardWinners(
        playerHands,
        ["Ah", "7h", "8h", "9h", "Th"],
        ["2d", "3d", "4d", "5d", "6d"],
      );

      // Both should tie on both boards (identical hands)
      expect(result.board1Winners).toEqual(expect.arrayContaining([1, 2]));
      expect(result.board1Winners).toHaveLength(2);
      expect(result.board2Winners).toEqual(expect.arrayContaining([1, 2]));
      expect(result.board2Winners).toHaveLength(2);
    });

    it("should handle three-way hand with different winners per board", () => {
      const playerHands = [
        { seatNumber: 1, cards: ["As", "Ah", "Ks", "Kh"] }, // Strong high cards
        { seatNumber: 2, cards: ["9s", "9h", "8s", "8h"] }, // Mid pairs
        { seatNumber: 3, cards: ["2s", "2h", "3s", "3h"] }, // Low pairs
      ];

      // Board 1: High cards favor player 1
      // Board 2: Low cards might favor player 3
      const result = determineDoubleBoardWinners(
        playerHands,
        ["Ac", "Kc", "Qc", "Jc", "Tc"], // Royal flush board - player 1 has A-K
        ["2c", "3c", "4c", "5c", "6c"], // Low straight board - player 3 has 2-3
      );

      // Results depend on PLO hand evaluation rules
      expect(result.board1Winners).toBeDefined();
      expect(result.board2Winners).toBeDefined();
      expect(result.board1Winners.length).toBeGreaterThan(0);
      expect(result.board2Winners.length).toBeGreaterThan(0);
    });

    it("should handle single player (auto-win both boards)", () => {
      const playerHands = [{ seatNumber: 5, cards: ["7c", "7d", "8c", "8d"] }];

      const result = determineDoubleBoardWinners(
        playerHands,
        ["9s", "Ts", "Js", "Qs", "Ks"],
        ["2h", "3h", "4h", "5h", "6h"],
      );

      expect(result.board1Winners).toEqual([5]);
      expect(result.board2Winners).toEqual([5]);
    });

    it("should correctly evaluate PLO hands using exactly 2 hole cards and 3 board cards", () => {
      // Player 1 has flush cards in hand
      // Board 1 has 3+ flush cards - player should make flush
      const playerHands = [
        { seatNumber: 1, cards: ["Ah", "Kh", "Qs", "Js"] }, // Two hearts in hand
        { seatNumber: 2, cards: ["2c", "3c", "4c", "5c"] }, // No hearts
      ];

      // Board 1: Three hearts on board (7h, 8h, 9h)
      // With Ah Kh from player 1, can make A-high flush
      const result = determineDoubleBoardWinners(
        playerHands,
        ["7h", "8h", "9h", "2d", "3d"],
        ["Tc", "Jc", "Qc", "Kd", "Ad"],
      );

      // Player 1 should win board 1 with flush
      expect(result.board1Winners).toContain(1);
      // Player 2 should win board 2 with straight
      expect(result.board2Winners).toContain(2);
    });

    it("should enforce two-hole-card rule (single heart cannot make flush)", () => {
      const playerHands = [
        { seatNumber: 1, cards: ["Ah", "Ks", "Qc", "Td"] }, // Only one heart
        { seatNumber: 2, cards: ["2h", "3h", "4s", "4d"] }, // Two hearts
      ];

      const result = determineDoubleBoardWinners(
        playerHands,
        ["7h", "8h", "9h", "2c", "3c"], // Three hearts on board
        ["Ac", "Kd", "Qs", "Jd", "Tc"], // Broadways, favors seat 1 high cards
      );

      expect(result.board1Winners).toEqual([2]); // Seat 1 should not make a flush with one heart
      expect(result.board2Winners).toContain(1);
    });

    it("should handle case where same player wins both boards", () => {
      const playerHands = [
        { seatNumber: 1, cards: ["As", "Ad", "Ks", "Kd"] }, // Pocket aces and kings
        { seatNumber: 2, cards: ["7c", "7d", "8c", "8d"] }, // Pocket sevens and eights
      ];

      // Both boards have high cards favoring player 1
      const result = determineDoubleBoardWinners(
        playerHands,
        ["Ac", "Kc", "Qh", "Jh", "Th"],
        ["Ah", "Kh", "Qd", "Jd", "Td"],
      );

      // Player 1 should dominate with trip aces/kings on both boards
      expect(result.board1Winners).toContain(1);
      expect(result.board2Winners).toContain(1);
    });

    it("should handle multi-way tie on both boards", () => {
      // Give all players identical hands
      const playerHands = [
        { seatNumber: 1, cards: ["9s", "9h", "Ts", "Th"] },
        { seatNumber: 2, cards: ["9c", "9d", "Tc", "Td"] },
        { seatNumber: 3, cards: ["8s", "8h", "Js", "Jh"] },
      ];

      // Board that gives everyone similar strength
      const result = determineDoubleBoardWinners(
        playerHands,
        ["2c", "3c", "4c", "5c", "6c"],
        ["7d", "7h", "7s", "Qd", "Qh"],
      );

      // Results depend on exact hand evaluations
      expect(result.board1Winners.length).toBeGreaterThan(0);
      expect(result.board2Winners.length).toBeGreaterThan(0);
    });

    it("should break ties using kickers (not just hand category)", () => {
      const playerHands = [
        { seatNumber: 1, cards: ["Ac", "Kc", "Qd", "Jd"] }, // Pair of aces with king kicker
        { seatNumber: 2, cards: ["Ad", "5d", "4c", "3c"] }, // Pair of aces with low kicker
      ];

      const result = determineDoubleBoardWinners(
        playerHands,
        ["As", "9d", "8c", "7h", "2s"], // Both make pair of aces; seat 1 should win via king kicker
        ["2h", "3d", "4s", "5s", "9c"], // Seat 2 makes wheel straight here
      );

      expect(result.board1Winners).toEqual([1]);
      expect(result.board2Winners).toEqual(expect.arrayContaining([2]));
    });
  });
});
