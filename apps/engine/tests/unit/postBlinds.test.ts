import { describe, it, expect } from "vitest";
import { postBlinds } from "../../src/logic.js";
import { createPlayer } from "../fixtures/players.js";
import type { RoomPlayer } from "../../src/types.js";

describe("postBlinds", () => {
  describe("Heads-up (2 players)", () => {
    it("should post button as small blind and other player as big blind", () => {
      const players: RoomPlayer[] = [
        createPlayer({ seat_number: 1, chip_stack: 1000 }),
        createPlayer({ seat_number: 3, chip_stack: 1000 }),
      ];

      const result = postBlinds(players, 1, 5, 10);

      expect(result.sbSeat).toBe(1); // Button is SB in heads-up
      expect(result.bbSeat).toBe(3); // Other player is BB
      expect(result.currentBet).toBe(10);
      expect(result.totalPosted).toBe(15);

      const sbPlayer = result.updatedPlayers.find((p) => p.seat_number === 1);
      const bbPlayer = result.updatedPlayers.find((p) => p.seat_number === 3);

      expect(sbPlayer?.chip_stack).toBe(995);
      expect(sbPlayer?.current_bet).toBe(5);
      expect(sbPlayer?.total_invested_this_hand).toBe(5);
      expect(sbPlayer?.is_all_in).toBe(false);

      expect(bbPlayer?.chip_stack).toBe(990);
      expect(bbPlayer?.current_bet).toBe(10);
      expect(bbPlayer?.total_invested_this_hand).toBe(10);
      expect(bbPlayer?.is_all_in).toBe(false);
    });

    it("should handle short-stack SB all-in in heads-up", () => {
      const players: RoomPlayer[] = [
        createPlayer({ seat_number: 1, chip_stack: 3 }), // Button, only 3 chips
        createPlayer({ seat_number: 2, chip_stack: 1000 }),
      ];

      const result = postBlinds(players, 1, 5, 10);

      expect(result.sbSeat).toBe(1);
      expect(result.bbSeat).toBe(2);
      expect(result.totalPosted).toBe(13); // 3 + 10

      const sbPlayer = result.updatedPlayers.find((p) => p.seat_number === 1);
      expect(sbPlayer?.chip_stack).toBe(0);
      expect(sbPlayer?.current_bet).toBe(3); // All-in for 3
      expect(sbPlayer?.is_all_in).toBe(true);
    });

    it("should handle short-stack BB all-in in heads-up", () => {
      const players: RoomPlayer[] = [
        createPlayer({ seat_number: 1, chip_stack: 1000 }), // Button
        createPlayer({ seat_number: 2, chip_stack: 7 }), // Only 7 chips
      ];

      const result = postBlinds(players, 1, 5, 10);

      expect(result.sbSeat).toBe(1);
      expect(result.bbSeat).toBe(2);
      expect(result.totalPosted).toBe(12); // 5 + 7

      const bbPlayer = result.updatedPlayers.find((p) => p.seat_number === 2);
      expect(bbPlayer?.chip_stack).toBe(0);
      expect(bbPlayer?.current_bet).toBe(7); // All-in for 7
      expect(bbPlayer?.is_all_in).toBe(true);
    });
  });

  describe("Multi-way (3+ players)", () => {
    it("should post first after button as SB, second as BB", () => {
      const players: RoomPlayer[] = [
        createPlayer({ seat_number: 1, chip_stack: 1000 }),
        createPlayer({ seat_number: 2, chip_stack: 1000 }),
        createPlayer({ seat_number: 3, chip_stack: 1000 }),
      ];

      const result = postBlinds(players, 3, 5, 10);

      expect(result.sbSeat).toBe(1); // First after button (seat 3)
      expect(result.bbSeat).toBe(2); // Second after button
      expect(result.currentBet).toBe(10);
      expect(result.totalPosted).toBe(15);
    });

    it("should handle button at end of seat order", () => {
      const players: RoomPlayer[] = [
        createPlayer({ seat_number: 2, chip_stack: 1000 }),
        createPlayer({ seat_number: 4, chip_stack: 1000 }),
        createPlayer({ seat_number: 6, chip_stack: 1000 }),
        createPlayer({ seat_number: 8, chip_stack: 1000 }),
      ];

      const result = postBlinds(players, 8, 5, 10);

      expect(result.sbSeat).toBe(2); // First after button wraps around
      expect(result.bbSeat).toBe(4); // Second after button
    });

    it("should skip spectators when posting blinds", () => {
      const players: RoomPlayer[] = [
        createPlayer({ seat_number: 1, chip_stack: 1000, is_spectating: true }),
        createPlayer({ seat_number: 2, chip_stack: 1000 }),
        createPlayer({ seat_number: 3, chip_stack: 1000 }),
        createPlayer({ seat_number: 4, chip_stack: 1000 }),
      ];

      const result = postBlinds(players, 4, 5, 10);

      // Should skip spectator at seat 1
      expect(result.sbSeat).toBe(2); // First active after button
      expect(result.bbSeat).toBe(3); // Second active after button
    });

    it("should skip sitting out players when posting blinds", () => {
      const players: RoomPlayer[] = [
        createPlayer({ seat_number: 1, chip_stack: 1000 }),
        createPlayer({
          seat_number: 2,
          chip_stack: 1000,
          is_sitting_out: true,
        }),
        createPlayer({ seat_number: 3, chip_stack: 1000 }),
        createPlayer({ seat_number: 4, chip_stack: 1000 }),
      ];

      const result = postBlinds(players, 1, 5, 10);

      // Should skip sitting out player at seat 2
      expect(result.sbSeat).toBe(3); // First active after button (skips 2)
      expect(result.bbSeat).toBe(4); // Second active after button
    });

    it("should skip zero-chip players when posting blinds", () => {
      const players: RoomPlayer[] = [
        createPlayer({ seat_number: 1, chip_stack: 0 }),
        createPlayer({ seat_number: 2, chip_stack: 1000 }),
        createPlayer({ seat_number: 3, chip_stack: 1000 }),
        createPlayer({ seat_number: 4, chip_stack: 1000 }),
      ];

      const result = postBlinds(players, 4, 5, 10);

      // Should skip zero-chip player at seat 1
      expect(result.sbSeat).toBe(2); // First active with chips
      expect(result.bbSeat).toBe(3); // Second active with chips
    });

    it("should handle short-stack SB all-in with multiple players", () => {
      const players: RoomPlayer[] = [
        createPlayer({ seat_number: 1, chip_stack: 2 }), // Short stack
        createPlayer({ seat_number: 2, chip_stack: 1000 }),
        createPlayer({ seat_number: 3, chip_stack: 1000 }),
      ];

      const result = postBlinds(players, 3, 5, 10);

      expect(result.sbSeat).toBe(1);
      expect(result.totalPosted).toBe(12); // 2 + 10

      const sbPlayer = result.updatedPlayers.find((p) => p.seat_number === 1);
      expect(sbPlayer?.chip_stack).toBe(0);
      expect(sbPlayer?.current_bet).toBe(2);
      expect(sbPlayer?.is_all_in).toBe(true);
    });

    it("should handle short-stack BB all-in with multiple players", () => {
      const players: RoomPlayer[] = [
        createPlayer({ seat_number: 1, chip_stack: 1000 }),
        createPlayer({ seat_number: 2, chip_stack: 6 }), // Short stack
        createPlayer({ seat_number: 3, chip_stack: 1000 }),
      ];

      const result = postBlinds(players, 3, 5, 10);

      expect(result.bbSeat).toBe(2);
      expect(result.totalPosted).toBe(11); // 5 + 6

      const bbPlayer = result.updatedPlayers.find((p) => p.seat_number === 2);
      expect(bbPlayer?.chip_stack).toBe(0);
      expect(bbPlayer?.current_bet).toBe(6);
      expect(bbPlayer?.is_all_in).toBe(true);
    });

    it("should handle both blinds all-in", () => {
      const players: RoomPlayer[] = [
        createPlayer({ seat_number: 1, chip_stack: 3 }), // Short SB
        createPlayer({ seat_number: 2, chip_stack: 7 }), // Short BB
        createPlayer({ seat_number: 3, chip_stack: 1000 }),
      ];

      const result = postBlinds(players, 3, 5, 10);

      expect(result.totalPosted).toBe(10); // 3 + 7

      const sbPlayer = result.updatedPlayers.find((p) => p.seat_number === 1);
      const bbPlayer = result.updatedPlayers.find((p) => p.seat_number === 2);

      expect(sbPlayer?.chip_stack).toBe(0);
      expect(sbPlayer?.is_all_in).toBe(true);
      expect(bbPlayer?.chip_stack).toBe(0);
      expect(bbPlayer?.is_all_in).toBe(true);
    });
  });

  describe("Edge cases", () => {
    it("should handle six-handed game", () => {
      const players: RoomPlayer[] = [
        createPlayer({ seat_number: 1, chip_stack: 1000 }),
        createPlayer({ seat_number: 2, chip_stack: 1000 }),
        createPlayer({ seat_number: 3, chip_stack: 1000 }),
        createPlayer({ seat_number: 4, chip_stack: 1000 }),
        createPlayer({ seat_number: 5, chip_stack: 1000 }),
        createPlayer({ seat_number: 6, chip_stack: 1000 }),
      ];

      const result = postBlinds(players, 6, 10, 20);

      expect(result.sbSeat).toBe(1); // First after seat 6
      expect(result.bbSeat).toBe(2); // Second after seat 6
      expect(result.totalPosted).toBe(30);
    });

    it("should handle non-sequential seat numbers", () => {
      const players: RoomPlayer[] = [
        createPlayer({ seat_number: 2, chip_stack: 1000 }),
        createPlayer({ seat_number: 5, chip_stack: 1000 }),
        createPlayer({ seat_number: 8, chip_stack: 1000 }),
      ];

      const result = postBlinds(players, 5, 5, 10);

      expect(result.sbSeat).toBe(8); // First after seat 5
      expect(result.bbSeat).toBe(2); // Second after seat 5 (wraps around)
    });

    it("should maintain player immutability (original players not modified)", () => {
      const originalPlayers: RoomPlayer[] = [
        createPlayer({ seat_number: 1, chip_stack: 1000 }),
        createPlayer({ seat_number: 2, chip_stack: 1000 }),
      ];

      const playersCopy = originalPlayers.map((p) => ({ ...p }));

      postBlinds(playersCopy, 1, 5, 10);

      // Original players should not be modified
      expect(originalPlayers[0].chip_stack).toBe(1000);
      expect(originalPlayers[0].current_bet).toBe(0);
      expect(originalPlayers[1].chip_stack).toBe(1000);
      expect(originalPlayers[1].current_bet).toBe(0);
    });

    it("should set has_folded to false for blind posters", () => {
      const players: RoomPlayer[] = [
        createPlayer({ seat_number: 1, chip_stack: 1000, has_folded: true }), // Previously folded
        createPlayer({ seat_number: 2, chip_stack: 1000, has_folded: true }),
      ];

      const result = postBlinds(players, 1, 5, 10);

      const sbPlayer = result.updatedPlayers.find((p) => p.seat_number === 1);
      const bbPlayer = result.updatedPlayers.find((p) => p.seat_number === 2);

      expect(sbPlayer?.has_folded).toBe(false);
      expect(bbPlayer?.has_folded).toBe(false);
    });

    it("should handle large blind amounts", () => {
      const players: RoomPlayer[] = [
        createPlayer({ seat_number: 1, chip_stack: 10000 }),
        createPlayer({ seat_number: 2, chip_stack: 10000 }),
      ];

      const result = postBlinds(players, 1, 500, 1000);

      expect(result.totalPosted).toBe(1500);
      expect(result.currentBet).toBe(1000);
    });

    it("should handle minimum blind amounts", () => {
      const players: RoomPlayer[] = [
        createPlayer({ seat_number: 1, chip_stack: 100 }),
        createPlayer({ seat_number: 2, chip_stack: 100 }),
      ];

      const result = postBlinds(players, 1, 1, 2);

      expect(result.totalPosted).toBe(3);
      expect(result.currentBet).toBe(2);

      const sbPlayer = result.updatedPlayers.find((p) => p.seat_number === 1);
      const bbPlayer = result.updatedPlayers.find((p) => p.seat_number === 2);

      expect(sbPlayer?.chip_stack).toBe(99);
      expect(bbPlayer?.chip_stack).toBe(98);
    });
  });
});
