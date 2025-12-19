import { describe, it, expect } from "vitest";
import { nextButtonSeat, actionOrder } from "../../src/logic.js";
import { createPlayer } from "../fixtures/players.js";
import type { RoomPlayer } from "../../src/types.js";

describe("Button Rotation - Extended Tests", () => {
  describe("nextButtonSeat edge cases", () => {
    it("should handle empty player array", () => {
      const players: RoomPlayer[] = [];
      const button = nextButtonSeat(players, null);

      expect(button).toBe(1); // Default to seat 1
    });

    it("should return first seat when button is null", () => {
      const players = [
        createPlayer({ seat_number: 3 }),
        createPlayer({ seat_number: 5 }),
        createPlayer({ seat_number: 7 }),
      ];

      const button = nextButtonSeat(players, null);

      expect(button).toBe(3); // First seat in sorted order
    });

    it("should rotate to next seat", () => {
      const players = [
        createPlayer({ seat_number: 1 }),
        createPlayer({ seat_number: 2 }),
        createPlayer({ seat_number: 3 }),
      ];

      const button = nextButtonSeat(players, 1);

      expect(button).toBe(2);
    });

    it("should wrap around to first seat after last seat", () => {
      const players = [
        createPlayer({ seat_number: 1 }),
        createPlayer({ seat_number: 2 }),
        createPlayer({ seat_number: 3 }),
      ];

      const button = nextButtonSeat(players, 3);

      expect(button).toBe(1); // Wraps around
    });

    it("should handle non-sequential seat numbers", () => {
      const players = [
        createPlayer({ seat_number: 2 }),
        createPlayer({ seat_number: 5 }),
        createPlayer({ seat_number: 8 }),
      ];

      const button = nextButtonSeat(players, 2);

      expect(button).toBe(5);
    });

    it("should wrap around with non-sequential seats", () => {
      const players = [
        createPlayer({ seat_number: 2 }),
        createPlayer({ seat_number: 5 }),
        createPlayer({ seat_number: 8 }),
      ];

      const button = nextButtonSeat(players, 8);

      expect(button).toBe(2); // Wraps to first
    });

    it("should handle single player", () => {
      const players = [createPlayer({ seat_number: 5 })];

      const button = nextButtonSeat(players, null);

      expect(button).toBe(5);
    });

    it("should keep button on same player when only one player", () => {
      const players = [createPlayer({ seat_number: 5 })];

      const button = nextButtonSeat(players, 5);

      expect(button).toBe(5); // Stays on same player
    });

    it("should handle button on seat that no longer exists", () => {
      const players = [
        createPlayer({ seat_number: 1 }),
        createPlayer({ seat_number: 3 }),
        createPlayer({ seat_number: 5 }),
      ];

      // Button was on seat 2, but player left
      const button = nextButtonSeat(players, 2);

      expect(button).toBe(3); // Moves to next available seat
    });

    it("should handle spectators in player list", () => {
      const players = [
        createPlayer({ seat_number: 1, is_spectating: true }),
        createPlayer({ seat_number: 2 }),
        createPlayer({ seat_number: 3 }),
      ];

      const button = nextButtonSeat(players, 2);

      // nextButtonSeat doesn't filter spectators, just rotates seats
      expect(button).toBe(3);
    });

    it("should handle sitting out players in player list", () => {
      const players = [
        createPlayer({ seat_number: 1 }),
        createPlayer({ seat_number: 2, is_sitting_out: true }),
        createPlayer({ seat_number: 3 }),
      ];

      const button = nextButtonSeat(players, 1);

      // nextButtonSeat doesn't filter sitting out, just rotates
      expect(button).toBe(2);
    });

    it("should handle zero-chip players in player list", () => {
      const players = [
        createPlayer({ seat_number: 1, chip_stack: 0 }),
        createPlayer({ seat_number: 2 }),
        createPlayer({ seat_number: 3 }),
      ];

      const button = nextButtonSeat(players, 3);

      // nextButtonSeat doesn't filter by chips, just rotates
      expect(button).toBe(1);
    });
  });

  describe("actionOrder edge cases", () => {
    it("should return empty array for empty player list", () => {
      const players: RoomPlayer[] = [];
      const order = actionOrder(players, 1);

      expect(order).toEqual([]);
    });

    it("should filter out spectators", () => {
      const players = [
        createPlayer({ seat_number: 1, is_spectating: true }),
        createPlayer({ seat_number: 2 }),
        createPlayer({ seat_number: 3 }),
      ];

      const order = actionOrder(players, 1);

      expect(order).not.toContain(1);
      expect(order).toContain(2);
      expect(order).toContain(3);
    });

    it("should filter out sitting out players", () => {
      const players = [
        createPlayer({ seat_number: 1 }),
        createPlayer({ seat_number: 2, is_sitting_out: true }),
        createPlayer({ seat_number: 3 }),
      ];

      const order = actionOrder(players, 1);

      expect(order).not.toContain(2);
      expect(order).toContain(1);
      expect(order).toContain(3);
    });

    it("should filter out zero-chip players", () => {
      const players = [
        createPlayer({ seat_number: 1 }),
        createPlayer({ seat_number: 2, chip_stack: 0 }),
        createPlayer({ seat_number: 3 }),
      ];

      const order = actionOrder(players, 1);

      expect(order).not.toContain(2);
      expect(order).toContain(1);
      expect(order).toContain(3);
    });

    it("should start after button and wrap around", () => {
      const players = [
        createPlayer({ seat_number: 1 }),
        createPlayer({ seat_number: 2 }),
        createPlayer({ seat_number: 3 }),
      ];

      const order = actionOrder(players, 2);

      expect(order).toEqual([3, 1, 2]);
    });

    it("should handle button on last seat", () => {
      const players = [
        createPlayer({ seat_number: 1 }),
        createPlayer({ seat_number: 2 }),
        createPlayer({ seat_number: 3 }),
      ];

      const order = actionOrder(players, 3);

      expect(order).toEqual([1, 2, 3]);
    });

    it("should handle non-sequential seats", () => {
      const players = [
        createPlayer({ seat_number: 2 }),
        createPlayer({ seat_number: 5 }),
        createPlayer({ seat_number: 8 }),
      ];

      const order = actionOrder(players, 5);

      expect(order).toEqual([8, 2, 5]);
    });

    it("should handle single active player", () => {
      const players = [createPlayer({ seat_number: 1 })];

      const order = actionOrder(players, 1);

      expect(order).toEqual([1]);
    });

    it("should filter multiple inactive player types", () => {
      const players = [
        createPlayer({ seat_number: 1, is_spectating: true }),
        createPlayer({ seat_number: 2, is_sitting_out: true }),
        createPlayer({ seat_number: 3, chip_stack: 0 }),
        createPlayer({ seat_number: 4 }),
        createPlayer({ seat_number: 5 }),
      ];

      const order = actionOrder(players, 4);

      expect(order).toEqual([5, 4]);
      expect(order).not.toContain(1);
      expect(order).not.toContain(2);
      expect(order).not.toContain(3);
    });

    it("should return empty when all players are inactive", () => {
      const players = [
        createPlayer({ seat_number: 1, is_spectating: true }),
        createPlayer({ seat_number: 2, chip_stack: 0 }),
        createPlayer({ seat_number: 3, is_sitting_out: true }),
      ];

      const order = actionOrder(players, 1);

      expect(order).toEqual([]);
    });

    it("should handle button on inactive player seat", () => {
      const players = [
        createPlayer({ seat_number: 1 }),
        createPlayer({ seat_number: 2, is_spectating: true }),
        createPlayer({ seat_number: 3 }),
      ];

      const order = actionOrder(players, 2);

      expect(order).toEqual([3, 1]); // Skips seat 2 even though it's button
    });

    it("should handle heads-up with button", () => {
      const players = [
        createPlayer({ seat_number: 1 }),
        createPlayer({ seat_number: 3 }),
      ];

      const order = actionOrder(players, 1);

      expect(order).toEqual([3, 1]);
    });

    it("should maintain seat order with gaps", () => {
      const players = [
        createPlayer({ seat_number: 1 }),
        createPlayer({ seat_number: 4 }),
        createPlayer({ seat_number: 7 }),
        createPlayer({ seat_number: 9 }),
      ];

      const order = actionOrder(players, 4);

      expect(order).toEqual([7, 9, 1, 4]);
    });

    it("should handle all players after button", () => {
      const players = [
        createPlayer({ seat_number: 1 }),
        createPlayer({ seat_number: 2 }),
        createPlayer({ seat_number: 3 }),
      ];

      const order = actionOrder(players, 1);

      expect(order).toEqual([2, 3, 1]);
    });

    it("should handle button before all players", () => {
      const players = [
        createPlayer({ seat_number: 5 }),
        createPlayer({ seat_number: 6 }),
        createPlayer({ seat_number: 7 }),
      ];

      const order = actionOrder(players, 3); // Button before all seats

      expect(order).toEqual([5, 6, 7]);
    });

    it("should handle button after all players", () => {
      const players = [
        createPlayer({ seat_number: 1 }),
        createPlayer({ seat_number: 2 }),
        createPlayer({ seat_number: 3 }),
      ];

      const order = actionOrder(players, 9); // Button after all seats

      expect(order).toEqual([1, 2, 3]);
    });
  });

  describe("Combined button and action order scenarios", () => {
    it("should handle player leaving between hands", () => {
      // Hand 1: 3 players, button on 1
      let players = [
        createPlayer({ seat_number: 1 }),
        createPlayer({ seat_number: 2 }),
        createPlayer({ seat_number: 3 }),
      ];

      let order = actionOrder(players, 1);
      expect(order).toEqual([2, 3, 1]);

      // Hand 2: player 2 left, button should advance
      players = [
        createPlayer({ seat_number: 1 }),
        createPlayer({ seat_number: 3 }),
      ];

      const newButton = nextButtonSeat(players, 1);
      expect(newButton).toBe(3); // Skips missing seat 2

      order = actionOrder(players, newButton);
      expect(order).toEqual([1, 3]);
    });

    it("should handle new player joining after button", () => {
      const players = [
        createPlayer({ seat_number: 1 }),
        createPlayer({ seat_number: 2 }),
        createPlayer({ seat_number: 5 }), // New player joined at seat 5
      ];

      const order = actionOrder(players, 2);

      expect(order).toEqual([5, 1, 2]); // Includes new player
    });

    it("should handle player returning from sitting out", () => {
      const players = [
        createPlayer({ seat_number: 1 }),
        createPlayer({ seat_number: 2 }), // Was sitting out, now active
        createPlayer({ seat_number: 3 }),
      ];

      const order = actionOrder(players, 3);

      expect(order).toEqual([1, 2, 3]); // Player 2 now included
    });

    it("should handle player going all-in and having zero chips next hand", () => {
      const players = [
        createPlayer({ seat_number: 1, chip_stack: 0 }), // Went all-in previous hand
        createPlayer({ seat_number: 2 }),
        createPlayer({ seat_number: 3 }),
      ];

      const button = nextButtonSeat(players, 3);
      expect(button).toBe(1); // Button still rotates to seat 1

      const order = actionOrder(players, button);
      expect(order).not.toContain(1); // But player 1 not in action order (no chips)
      expect(order).toEqual([2, 3]);
    });
  });
});
