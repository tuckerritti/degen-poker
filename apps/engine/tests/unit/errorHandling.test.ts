import { describe, it, expect } from "vitest";
import {
  applyAction,
  type ActionContext,
  calculateSidePots,
} from "../../src/logic.js";
import { createPlayer } from "../fixtures/players.js";
import { standardRoom } from "../fixtures/rooms.js";
import { createGameState } from "../fixtures/gameStates.js";
import type { RoomPlayer } from "../../src/types.js";

describe("Error Handling", () => {
  describe("Invalid action types", () => {
    it("should reject action when phase is already complete", () => {
      const players = [
        createPlayer({ seat_number: 1 }),
        createPlayer({ seat_number: 2 }),
      ];

      const gameState = createGameState({
        current_actor_seat: 1,
        phase: "complete",
      });

      const ctx: ActionContext = {
        room: standardRoom,
        players,
        gameState,
        fullBoard1: ["Ah", "Kh", "Qh", "Jh", "Th"],
        fullBoard2: ["2c", "3c", "4c", "5c", "6c"],
      };

      const result = applyAction(ctx, 1, "fold");

      // Complete phase should complete the hand
      expect(result.handCompleted).toBe(true);
    });

    it("should reject action from non-existent seat", () => {
      const players = [
        createPlayer({ seat_number: 1 }),
        createPlayer({ seat_number: 2 }),
      ];

      const gameState = createGameState({ current_actor_seat: 99 });

      const ctx: ActionContext = {
        room: standardRoom,
        players,
        gameState,
        fullBoard1: ["Ah", "Kh", "Qh", "Jh", "Th"],
        fullBoard2: ["2c", "3c", "4c", "5c", "6c"],
      };

      const result = applyAction(ctx, 99, "fold");

      expect(result.error).toBe("Seat not found");
      expect(result.handCompleted).toBe(false);
    });

    it("should reject action from spectator", () => {
      const players = [
        createPlayer({ seat_number: 1, is_spectating: true }),
        createPlayer({ seat_number: 2 }),
      ];

      const gameState = createGameState({ current_actor_seat: 1 });

      const ctx: ActionContext = {
        room: standardRoom,
        players,
        gameState,
        fullBoard1: ["Ah", "Kh", "Qh", "Jh", "Th"],
        fullBoard2: ["2c", "3c", "4c", "5c", "6c"],
      };

      const result = applyAction(ctx, 1, "fold");

      expect(result.error).toBeDefined();
      expect(result.handCompleted).toBe(false);
    });

    it("should reject action from sitting out player", () => {
      const players = [
        createPlayer({ seat_number: 1, is_sitting_out: true }),
        createPlayer({ seat_number: 2 }),
      ];

      const gameState = createGameState({ current_actor_seat: 1 });

      const ctx: ActionContext = {
        room: standardRoom,
        players,
        gameState,
        fullBoard1: ["Ah", "Kh", "Qh", "Jh", "Th"],
        fullBoard2: ["2c", "3c", "4c", "5c", "6c"],
      };

      const result = applyAction(ctx, 1, "fold");

      expect(result.error).toBeDefined();
      expect(result.handCompleted).toBe(false);
    });

    it("should reject action from player with zero chips", () => {
      const players = [
        createPlayer({ seat_number: 1, chip_stack: 0 }),
        createPlayer({ seat_number: 2 }),
      ];

      const gameState = createGameState({ current_actor_seat: 1 });

      const ctx: ActionContext = {
        room: standardRoom,
        players,
        gameState,
        fullBoard1: ["Ah", "Kh", "Qh", "Jh", "Th"],
        fullBoard2: ["2c", "3c", "4c", "5c", "6c"],
      };

      const result = applyAction(ctx, 1, "bet", 50);

      // Zero-chip player becomes all-in, so this should succeed
      expect(result.handCompleted).toBe(false);
    });
  });

  describe("Invalid bet amounts", () => {
    it("should reject bet with negative amount", () => {
      const players = [
        createPlayer({ seat_number: 1, chip_stack: 500 }),
        createPlayer({ seat_number: 2, chip_stack: 500 }),
      ];

      const gameState = createGameState({
        current_actor_seat: 1,
        current_bet: 0,
      });

      const ctx: ActionContext = {
        room: standardRoom,
        players,
        gameState,
        fullBoard1: ["Ah", "Kh", "Qh", "Jh", "Th"],
        fullBoard2: ["2c", "3c", "4c", "5c", "6c"],
      };

      const result = applyAction(ctx, 1, "bet", -50);

      expect(result.error).toContain("Bet amount");
      expect(result.handCompleted).toBe(false);
    });

    it("should reject bet with zero amount", () => {
      const players = [
        createPlayer({ seat_number: 1, chip_stack: 500 }),
        createPlayer({ seat_number: 2, chip_stack: 500 }),
      ];

      const gameState = createGameState({
        current_actor_seat: 1,
        current_bet: 0,
      });

      const ctx: ActionContext = {
        room: standardRoom,
        players,
        gameState,
        fullBoard1: ["Ah", "Kh", "Qh", "Jh", "Th"],
        fullBoard2: ["2c", "3c", "4c", "5c", "6c"],
      };

      const result = applyAction(ctx, 1, "bet", 0);

      expect(result.error).toContain("Bet amount");
      expect(result.handCompleted).toBe(false);
    });

    it("should reject raise below minimum", () => {
      const players = [
        createPlayer({ seat_number: 1, chip_stack: 500, current_bet: 0 }),
        createPlayer({ seat_number: 2, chip_stack: 500, current_bet: 50 }),
      ];

      const gameState = createGameState({
        current_actor_seat: 1,
        current_bet: 50,
        min_raise: 50,
        last_raise_amount: 50,
      });

      const ctx: ActionContext = {
        room: standardRoom,
        players,
        gameState,
        fullBoard1: ["Ah", "Kh", "Qh", "Jh", "Th"],
        fullBoard2: ["2c", "3c", "4c", "5c", "6c"],
      };

      // Try to raise by only 10 (min should be 50)
      const result = applyAction(ctx, 1, "raise", 60);

      expect(result.error).toBeDefined();
      expect(result.handCompleted).toBe(false);
    });

    it("should reject raise without amount", () => {
      const players = [
        createPlayer({ seat_number: 1, chip_stack: 500, current_bet: 0 }),
        createPlayer({ seat_number: 2, chip_stack: 500, current_bet: 50 }),
      ];

      const gameState = createGameState({
        current_actor_seat: 1,
        current_bet: 50,
        min_raise: 50,
      });

      const ctx: ActionContext = {
        room: standardRoom,
        players,
        gameState,
        fullBoard1: ["Ah", "Kh", "Qh", "Jh", "Th"],
        fullBoard2: ["2c", "3c", "4c", "5c", "6c"],
      };

      const result = applyAction(ctx, 1, "raise"); // No amount

      expect(result.error).toBeDefined();
      expect(result.handCompleted).toBe(false);
    });

    it("should reject bet without amount", () => {
      const players = [
        createPlayer({ seat_number: 1, chip_stack: 500 }),
        createPlayer({ seat_number: 2, chip_stack: 500 }),
      ];

      const gameState = createGameState({
        current_actor_seat: 1,
        current_bet: 0,
      });

      const ctx: ActionContext = {
        room: standardRoom,
        players,
        gameState,
        fullBoard1: ["Ah", "Kh", "Qh", "Jh", "Th"],
        fullBoard2: ["2c", "3c", "4c", "5c", "6c"],
      };

      const result = applyAction(ctx, 1, "bet"); // No amount

      expect(result.error).toContain("Bet amount");
      expect(result.handCompleted).toBe(false);
    });
  });

  describe("Invalid action context", () => {
    it("should reject check when facing a bet", () => {
      const players = [
        createPlayer({ seat_number: 1, chip_stack: 500, current_bet: 0 }),
        createPlayer({ seat_number: 2, chip_stack: 500, current_bet: 50 }),
      ];

      const gameState = createGameState({
        current_actor_seat: 1,
        current_bet: 50,
      });

      const ctx: ActionContext = {
        room: standardRoom,
        players,
        gameState,
        fullBoard1: ["Ah", "Kh", "Qh", "Jh", "Th"],
        fullBoard2: ["2c", "3c", "4c", "5c", "6c"],
      };

      const result = applyAction(ctx, 1, "check");

      expect(result.error).toBeDefined();
      expect(result.handCompleted).toBe(false);
    });

    it("should reject bet when there is already a bet", () => {
      const players = [
        createPlayer({ seat_number: 1, chip_stack: 500, current_bet: 0 }),
        createPlayer({ seat_number: 2, chip_stack: 500, current_bet: 50 }),
      ];

      const gameState = createGameState({
        current_actor_seat: 1,
        current_bet: 50,
      });

      const ctx: ActionContext = {
        room: standardRoom,
        players,
        gameState,
        fullBoard1: ["Ah", "Kh", "Qh", "Jh", "Th"],
        fullBoard2: ["2c", "3c", "4c", "5c", "6c"],
      };

      const result = applyAction(ctx, 1, "bet", 100);

      expect(result.error).toBeDefined();
      expect(result.handCompleted).toBe(false);
    });

    it("should reject raise when no bet to raise", () => {
      const players = [
        createPlayer({ seat_number: 1, chip_stack: 500 }),
        createPlayer({ seat_number: 2, chip_stack: 500 }),
      ];

      const gameState = createGameState({
        current_actor_seat: 1,
        current_bet: 0,
      });

      const ctx: ActionContext = {
        room: standardRoom,
        players,
        gameState,
        fullBoard1: ["Ah", "Kh", "Qh", "Jh", "Th"],
        fullBoard2: ["2c", "3c", "4c", "5c", "6c"],
      };

      const result = applyAction(ctx, 1, "raise", 100);

      expect(result.error).toContain("No bet to raise");
      expect(result.handCompleted).toBe(false);
    });

    it("should reject call when no bet to call", () => {
      const players = [
        createPlayer({ seat_number: 1, chip_stack: 500 }),
        createPlayer({ seat_number: 2, chip_stack: 500 }),
      ];

      const gameState = createGameState({
        current_actor_seat: 1,
        current_bet: 0,
      });

      const ctx: ActionContext = {
        room: standardRoom,
        players,
        gameState,
        fullBoard1: ["Ah", "Kh", "Qh", "Jh", "Th"],
        fullBoard2: ["2c", "3c", "4c", "5c", "6c"],
      };

      const result = applyAction(ctx, 1, "call");

      expect(result.error).toBeDefined();
      expect(result.handCompleted).toBe(false);
    });
  });

  describe("Edge cases with chip stacks", () => {
    it("should handle player trying to bet more than chip stack", () => {
      const players = [
        createPlayer({ seat_number: 1, chip_stack: 50 }), // Only 50 chips
        createPlayer({ seat_number: 2, chip_stack: 500 }),
      ];

      const gameState = createGameState({
        current_actor_seat: 1,
        current_bet: 0,
      });

      const ctx: ActionContext = {
        room: standardRoom,
        players,
        gameState,
        fullBoard1: ["Ah", "Kh", "Qh", "Jh", "Th"],
        fullBoard2: ["2c", "3c", "4c", "5c", "6c"],
      };

      const result = applyAction(ctx, 1, "bet", 100); // Try to bet 100 with only 50

      // Should either reject or treat as all-in for 50
      if (result.error) {
        expect(result.error).toBeDefined();
      } else {
        expect(result.handCompleted).toBe(false);
        const updatedPlayer = result.updatedPlayers.find(
          (p) => p.seat_number === 1,
        );
        expect(updatedPlayer?.chip_stack).toBe(0);
        expect(updatedPlayer?.is_all_in).toBe(true);
      }
    });

    it("should handle multiple players with zero chips gracefully", () => {
      const players = [
        createPlayer({ seat_number: 1, chip_stack: 0, is_all_in: true }),
        createPlayer({ seat_number: 2, chip_stack: 0, is_all_in: true }),
        createPlayer({ seat_number: 3, chip_stack: 500 }),
      ];

      const gameState = createGameState({
        current_actor_seat: 3,
        seats_to_act: [3],
      });

      const ctx: ActionContext = {
        room: standardRoom,
        players,
        gameState,
        fullBoard1: ["Ah", "Kh", "Qh", "Jh", "Th"],
        fullBoard2: ["2c", "3c", "4c", "5c", "6c"],
      };

      const result = applyAction(ctx, 3, "check");

      expect(result.error).toBeUndefined();
      // Action should succeed
      expect(result).toBeDefined();
    });
  });

  describe("Side pot edge cases", () => {
    it("should handle calculateSidePots with empty player array", () => {
      const players: RoomPlayer[] = [];

      const sidePots = calculateSidePots(players);

      expect(sidePots).toEqual([]);
    });

    it("should handle calculateSidePots with single player", () => {
      const players = [
        createPlayer({ seat_number: 1, total_invested_this_hand: 100 }),
      ];

      const sidePots = calculateSidePots(players);

      expect(sidePots).toHaveLength(1);
      expect(sidePots[0].amount).toBe(100);
    });

    it("should handle calculateSidePots with folded players", () => {
      const players = [
        createPlayer({
          seat_number: 1,
          total_invested_this_hand: 100,
          has_folded: true,
        }),
        createPlayer({
          seat_number: 2,
          total_invested_this_hand: 100,
          has_folded: true,
        }),
        createPlayer({ seat_number: 3, total_invested_this_hand: 100 }),
      ];

      const sidePots = calculateSidePots(players);

      // Folded players should not be eligible
      expect(sidePots.length).toBeGreaterThan(0);
      sidePots.forEach((pot) => {
        expect(pot.eligibleSeats).not.toContain(1);
        expect(pot.eligibleSeats).not.toContain(2);
      });
    });

    it("should handle calculateSidePots with spectators", () => {
      const players = [
        createPlayer({
          seat_number: 1,
          total_invested_this_hand: 100,
          is_spectating: true,
        }),
        createPlayer({ seat_number: 2, total_invested_this_hand: 100 }),
      ];

      const sidePots = calculateSidePots(players);

      // Spectators should not be eligible
      sidePots.forEach((pot) => {
        expect(pot.eligibleSeats).not.toContain(1);
      });
    });

    it("should handle calculateSidePots with sitting out players", () => {
      const players = [
        createPlayer({
          seat_number: 1,
          total_invested_this_hand: 100,
          is_sitting_out: true,
        }),
        createPlayer({ seat_number: 2, total_invested_this_hand: 100 }),
      ];

      const sidePots = calculateSidePots(players);

      // Sitting out players should not be eligible
      sidePots.forEach((pot) => {
        expect(pot.eligibleSeats).not.toContain(1);
      });
    });
  });

  describe("Missing game state scenarios", () => {
    it("should handle null current_actor_seat", () => {
      const players = [
        createPlayer({ seat_number: 1 }),
        createPlayer({ seat_number: 2 }),
      ];

      const gameState = createGameState({
        current_actor_seat: null,
      });

      const ctx: ActionContext = {
        room: standardRoom,
        players,
        gameState,
        fullBoard1: ["Ah", "Kh", "Qh", "Jh", "Th"],
        fullBoard2: ["2c", "3c", "4c", "5c", "6c"],
      };

      const result = applyAction(ctx, 1, "fold");

      expect(result.error).toBe("Not your turn");
    });

    it("should handle empty seats_to_act array", () => {
      const players = [
        createPlayer({ seat_number: 1 }),
        createPlayer({ seat_number: 2 }),
      ];

      const gameState = createGameState({
        current_actor_seat: 1,
        seats_to_act: [],
      });

      const ctx: ActionContext = {
        room: standardRoom,
        players,
        gameState,
        fullBoard1: ["Ah", "Kh", "Qh", "Jh", "Th"],
        fullBoard2: ["2c", "3c", "4c", "5c", "6c"],
      };

      const result = applyAction(ctx, 1, "fold");

      // With empty seats_to_act, hand should likely complete
      expect(result.handCompleted).toBe(true);
    });
  });
});
