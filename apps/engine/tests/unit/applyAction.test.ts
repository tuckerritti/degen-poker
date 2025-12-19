import { describe, it, expect } from "vitest";
import { applyAction, type ActionContext } from "../../src/logic.js";
import type { RoomPlayer } from "../../src/types.js";
import { standardRoom } from "../fixtures/rooms.js";
import { createPlayer } from "../fixtures/players.js";
import { createGameState } from "../fixtures/gameStates.js";

const mergePlayers = (players: RoomPlayer[], updates: Partial<RoomPlayer>[]) =>
  players.map((p) => {
    const found = updates.find((u) => u.id === p.id);
    return found ? ({ ...p, ...found } as RoomPlayer) : p;
  });

describe("Apply Action", () => {
  describe("Turn validation", () => {
    it("should reject action when not player turn", () => {
      const players = [
        createPlayer({ seat_number: 1 }),
        createPlayer({ seat_number: 2 }),
        createPlayer({ seat_number: 3 }),
      ];

      const gameState = createGameState({ current_actor_seat: 2 });

      const ctx: ActionContext = {
        room: standardRoom,
        players,
        gameState,
        fullBoard1: ["Ah", "Kh", "Qh", "Jh", "Th"],
        fullBoard2: ["2c", "3c", "4c", "5c", "6c"],
      };

      const result = applyAction(ctx, 1, "fold");
      expect(result.error).toBe("Not your turn");
      expect(result.handCompleted).toBe(false);
    });

    it("should reject action from folded player", () => {
      const players = [
        createPlayer({ seat_number: 1, has_folded: true }),
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

      const result = applyAction(ctx, 1, "check");
      expect(result.error).toBe("Player cannot act");
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

      const result = applyAction(ctx, 1, "check");
      expect(result.error).toBe("Player cannot act");
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

      const result = applyAction(ctx, 1, "check");
      expect(result.error).toBe("Player cannot act");
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

      const result = applyAction(ctx, 99, "check");
      expect(result.error).toBe("Seat not found");
    });
  });

  describe("Fold action", () => {
    it("should mark player as folded", () => {
      const players = [
        createPlayer({ seat_number: 1 }),
        createPlayer({ seat_number: 2 }),
        createPlayer({ seat_number: 3 }),
      ];

      const gameState = createGameState({
        current_actor_seat: 2,
        seats_to_act: [2, 3],
        seats_acted: [1],
      });

      const ctx: ActionContext = {
        room: standardRoom,
        players,
        gameState,
        fullBoard1: ["Ah", "Kh", "Qh", "Jh", "Th"],
        fullBoard2: ["2c", "3c", "4c", "5c", "6c"],
      };

      const result = applyAction(ctx, 2, "fold");

      expect(result.error).toBeUndefined();
      expect(result.handCompleted).toBe(false);

      const foldedPlayer = result.updatedPlayers.find(
        (p) => p.seat_number === 2,
      );
      expect(foldedPlayer?.has_folded).toBe(true);
    });

    it("should remove folded player from seats to act", () => {
      const players = [
        createPlayer({ seat_number: 1 }),
        createPlayer({ seat_number: 2 }),
        createPlayer({ seat_number: 3 }),
      ];

      const gameState = createGameState({
        current_actor_seat: 2,
        seats_to_act: [2, 3],
        seats_acted: [1],
      });

      const ctx: ActionContext = {
        room: standardRoom,
        players,
        gameState,
        fullBoard1: ["Ah", "Kh", "Qh", "Jh", "Th"],
        fullBoard2: ["2c", "3c", "4c", "5c", "6c"],
      };

      const result = applyAction(ctx, 2, "fold");

      expect(result.updatedGameState.seats_to_act).toEqual([3]);
      expect(result.updatedGameState.seats_acted).toContain(2);
    });

    it("should end hand when only one player remains after fold", () => {
      const players = [
        createPlayer({ seat_number: 1 }),
        createPlayer({ seat_number: 2 }),
      ];

      const gameState = createGameState({
        current_actor_seat: 2,
        pot_size: 100,
        seats_to_act: [2],
        seats_acted: [1],
      });

      const ctx: ActionContext = {
        room: standardRoom,
        players,
        gameState,
        fullBoard1: ["Ah", "Kh", "Qh", "Jh", "Th"],
        fullBoard2: ["2c", "3c", "4c", "5c", "6c"],
      };

      const result = applyAction(ctx, 2, "fold");

      expect(result.handCompleted).toBe(true);
      expect(result.autoWinners).toEqual([1]);
      expect(result.potAwarded).toBe(100);
      expect(result.updatedGameState.phase).toBe("complete");
    });

    it("should not preserve chip stack when folding", () => {
      const players = [
        createPlayer({ seat_number: 1, chip_stack: 500 }),
        createPlayer({ seat_number: 2, chip_stack: 450 }),
        createPlayer({ seat_number: 3, chip_stack: 400 }),
      ];

      const gameState = createGameState({ current_actor_seat: 2 });

      const ctx: ActionContext = {
        room: standardRoom,
        players,
        gameState,
        fullBoard1: ["Ah", "Kh", "Qh", "Jh", "Th"],
        fullBoard2: ["2c", "3c", "4c", "5c", "6c"],
      };

      const result = applyAction(ctx, 2, "fold");

      const foldedPlayer = result.updatedPlayers.find(
        (p) => p.seat_number === 2,
      );
      expect(foldedPlayer?.chip_stack).toBe(450); // Should remain unchanged
    });
  });

  describe("Check action", () => {
    it("should allow check when no bet to face", () => {
      const players = [
        createPlayer({ seat_number: 1, current_bet: 0 }),
        createPlayer({ seat_number: 2, current_bet: 0 }),
      ];

      const gameState = createGameState({
        current_actor_seat: 1,
        current_bet: 0,
        seats_to_act: [1, 2],
        seats_acted: [],
      });

      const ctx: ActionContext = {
        room: standardRoom,
        players,
        gameState,
        fullBoard1: ["Ah", "Kh", "Qh", "Jh", "Th"],
        fullBoard2: ["2c", "3c", "4c", "5c", "6c"],
      };

      const result = applyAction(ctx, 1, "check");

      expect(result.error).toBeUndefined();
      expect(result.handCompleted).toBe(false);
    });

    it("should reject check when facing a bet", () => {
      const players = [
        createPlayer({ seat_number: 1, current_bet: 0 }),
        createPlayer({ seat_number: 2, current_bet: 10 }),
      ];

      const gameState = createGameState({
        current_actor_seat: 1,
        current_bet: 10,
        seats_to_act: [1],
        seats_acted: [2],
      });

      const ctx: ActionContext = {
        room: standardRoom,
        players,
        gameState,
        fullBoard1: ["Ah", "Kh", "Qh", "Jh", "Th"],
        fullBoard2: ["2c", "3c", "4c", "5c", "6c"],
      };

      const result = applyAction(ctx, 1, "check");

      expect(result.error).toBe("Cannot check facing bet");
      expect(result.handCompleted).toBe(false);
    });

    it("should remove player from seats to act after check", () => {
      const players = [
        createPlayer({ seat_number: 1 }),
        createPlayer({ seat_number: 2 }),
      ];

      const gameState = createGameState({
        current_actor_seat: 1,
        current_bet: 0,
        seats_to_act: [1, 2],
        seats_acted: [],
      });

      const ctx: ActionContext = {
        room: standardRoom,
        players,
        gameState,
        fullBoard1: ["Ah", "Kh", "Qh", "Jh", "Th"],
        fullBoard2: ["2c", "3c", "4c", "5c", "6c"],
      };

      const result = applyAction(ctx, 1, "check");

      expect(result.updatedGameState.seats_to_act).toEqual([2]);
      expect(result.updatedGameState.seats_acted).toContain(1);
    });

    it("should not change chip stack or pot when checking", () => {
      const players = [
        createPlayer({ seat_number: 1, chip_stack: 500 }),
        createPlayer({ seat_number: 2, chip_stack: 500 }),
      ];

      const gameState = createGameState({
        current_actor_seat: 1,
        current_bet: 0,
        pot_size: 50,
        seats_to_act: [1, 2],
      });

      const ctx: ActionContext = {
        room: standardRoom,
        players,
        gameState,
        fullBoard1: ["Ah", "Kh", "Qh", "Jh", "Th"],
        fullBoard2: ["2c", "3c", "4c", "5c", "6c"],
      };

      const result = applyAction(ctx, 1, "check");

      expect(result.updatedPlayers).toHaveLength(0); // No chip stack updates
      // Pot is always returned in result, even if unchanged
      expect(result.updatedGameState.pot_size).toBe(50);
    });
  });

  describe("Call action", () => {
    it("should match current bet", () => {
      const players = [
        createPlayer({ seat_number: 1, current_bet: 0, chip_stack: 500 }),
        createPlayer({ seat_number: 2, current_bet: 10, chip_stack: 490 }),
      ];

      const gameState = createGameState({
        current_actor_seat: 1,
        current_bet: 10,
        pot_size: 10,
        seats_to_act: [1],
        seats_acted: [2],
      });

      const ctx: ActionContext = {
        room: standardRoom,
        players,
        gameState,
        fullBoard1: ["Ah", "Kh", "Qh", "Jh", "Th"],
        fullBoard2: ["2c", "3c", "4c", "5c", "6c"],
      };

      const result = applyAction(ctx, 1, "call");

      expect(result.error).toBeUndefined();

      const callingPlayer = result.updatedPlayers.find(
        (p) => p.seat_number === 1,
      );
      expect(callingPlayer?.chip_stack).toBe(490); // 500 - 10
      expect(callingPlayer?.current_bet).toBe(10);
      expect(callingPlayer?.total_invested_this_hand).toBe(10);
    });

    it("should increase pot by call amount", () => {
      const players = [
        createPlayer({ seat_number: 1, current_bet: 0, chip_stack: 500 }),
        createPlayer({ seat_number: 2, current_bet: 10, chip_stack: 490 }),
      ];

      const gameState = createGameState({
        current_actor_seat: 1,
        current_bet: 10,
        pot_size: 10,
        seats_to_act: [1],
      });

      const ctx: ActionContext = {
        room: standardRoom,
        players,
        gameState,
        fullBoard1: ["Ah", "Kh", "Qh", "Jh", "Th"],
        fullBoard2: ["2c", "3c", "4c", "5c", "6c"],
      };

      const result = applyAction(ctx, 1, "call");

      expect(result.updatedGameState.pot_size).toBe(20); // 10 + 10
    });

    it("should reject call when nothing to call", () => {
      const players = [
        createPlayer({ seat_number: 1, current_bet: 10 }),
        createPlayer({ seat_number: 2, current_bet: 10 }),
      ];

      const gameState = createGameState({
        current_actor_seat: 1,
        current_bet: 10,
      });

      const ctx: ActionContext = {
        room: standardRoom,
        players,
        gameState,
        fullBoard1: ["Ah", "Kh", "Qh", "Jh", "Th"],
        fullBoard2: ["2c", "3c", "4c", "5c", "6c"],
      };

      const result = applyAction(ctx, 1, "call");

      expect(result.error).toBe("Nothing to call");
    });

    it("should handle call when player already has partial bet", () => {
      const players = [
        createPlayer({
          seat_number: 1,
          current_bet: 5,
          chip_stack: 495,
          total_invested_this_hand: 5,
        }),
        createPlayer({
          seat_number: 2,
          current_bet: 15,
          chip_stack: 485,
          total_invested_this_hand: 15,
        }),
      ];

      const gameState = createGameState({
        current_actor_seat: 1,
        current_bet: 15,
        pot_size: 20,
      });

      const ctx: ActionContext = {
        room: standardRoom,
        players,
        gameState,
        fullBoard1: ["Ah", "Kh", "Qh", "Jh", "Th"],
        fullBoard2: ["2c", "3c", "4c", "5c", "6c"],
      };

      const result = applyAction(ctx, 1, "call");

      const callingPlayer = result.updatedPlayers.find(
        (p) => p.seat_number === 1,
      );
      expect(callingPlayer?.chip_stack).toBe(485); // 495 - 10 more
      expect(callingPlayer?.current_bet).toBe(15);
      expect(callingPlayer?.total_invested_this_hand).toBe(15); // 5 + 10
      expect(result.updatedGameState.pot_size).toBe(30); // 20 + 10
    });

    it("should not change last aggressor or raise amount on a call", () => {
      const players = [
        createPlayer({ seat_number: 1, current_bet: 20, chip_stack: 480 }),
        createPlayer({ seat_number: 2, current_bet: 10, chip_stack: 490 }),
      ];

      const gameState = createGameState({
        current_actor_seat: 2,
        current_bet: 20,
        last_aggressor_seat: 1,
        last_raise_amount: 20,
      });

      const ctx: ActionContext = {
        room: standardRoom,
        players,
        gameState,
        fullBoard1: ["Ah", "Kh", "Qh", "Jh", "Th"],
        fullBoard2: ["2c", "3c", "4c", "5c", "6c"],
      };

      const result = applyAction(ctx, 2, "call");

      expect(result.updatedGameState.last_aggressor_seat).toBe(1);
      expect(result.updatedGameState.last_raise_amount).toBe(20);
    });

    it("should mark player as all-in when call uses all chips", () => {
      const players = [
        createPlayer({ seat_number: 1, current_bet: 0, chip_stack: 10 }),
        createPlayer({ seat_number: 2, current_bet: 20, chip_stack: 480 }),
      ];

      const gameState = createGameState({
        current_actor_seat: 1,
        current_bet: 20,
        pot_size: 20,
      });

      const ctx: ActionContext = {
        room: standardRoom,
        players,
        gameState,
        fullBoard1: ["Ah", "Kh", "Qh", "Jh", "Th"],
        fullBoard2: ["2c", "3c", "4c", "5c", "6c"],
      };

      const result = applyAction(ctx, 1, "call");

      const callingPlayer = result.updatedPlayers.find(
        (p) => p.seat_number === 1,
      );
      expect(callingPlayer?.chip_stack).toBe(0);
      expect(callingPlayer?.current_bet).toBe(10); // Can only call for 10
      expect(callingPlayer?.is_all_in).toBe(true);
      expect(result.updatedGameState.pot_size).toBe(30); // 20 + 10
    });

    it("should advance phase when call completes betting round", () => {
      const players = [
        createPlayer({ seat_number: 1, current_bet: 0, chip_stack: 500 }),
        createPlayer({ seat_number: 2, current_bet: 10, chip_stack: 490 }),
      ];

      const gameState = createGameState({
        phase: "flop",
        current_actor_seat: 1,
        current_bet: 10,
        seats_to_act: [1],
        seats_acted: [2],
      });

      const ctx: ActionContext = {
        room: standardRoom,
        players,
        gameState,
        fullBoard1: ["Ah", "Kh", "Qh", "Jh", "Th"],
        fullBoard2: ["2c", "3c", "4c", "5c", "6c"],
      };

      const result = applyAction(ctx, 1, "call");

      // After call, all bets are matched (both at 10)
      // Street is complete, so phase advances from flop to turn
      expect(result.updatedGameState.phase).toBe("turn");
      // New street starts, action order resets
      expect(result.updatedGameState.seats_to_act).toEqual([2, 1]);
      expect(result.updatedGameState.seats_acted).toEqual([]);
    });
  });

  describe("Bet action", () => {
    it("should open betting when no current bet", () => {
      const players = [
        createPlayer({ seat_number: 1, current_bet: 0, chip_stack: 500 }),
        createPlayer({ seat_number: 2, current_bet: 0, chip_stack: 500 }),
        createPlayer({ seat_number: 3, current_bet: 0, chip_stack: 500 }),
      ];

      const gameState = createGameState({
        current_actor_seat: 1,
        current_bet: 0,
        pot_size: 0,
        seats_to_act: [1, 2, 3],
        seats_acted: [],
      });

      const ctx: ActionContext = {
        room: standardRoom,
        players,
        gameState,
        fullBoard1: ["Ah", "Kh", "Qh", "Jh", "Th"],
        fullBoard2: ["2c", "3c", "4c", "5c", "6c"],
      };

      const result = applyAction(ctx, 1, "bet", 20);

      expect(result.error).toBeUndefined();
      expect(result.updatedGameState.current_bet).toBe(20);
      expect(result.updatedGameState.min_raise).toBe(20);
      expect(result.updatedGameState.pot_size).toBe(20);

      const bettor = result.updatedPlayers.find((p) => p.seat_number === 1);
      expect(bettor?.chip_stack).toBe(480);
      expect(bettor?.current_bet).toBe(20);
      expect(bettor?.total_invested_this_hand).toBe(20);
    });

    it("should record aggressor, raise amount, and action history on bet", () => {
      const players = [
        createPlayer({ seat_number: 1, current_bet: 0, chip_stack: 500 }),
        createPlayer({ seat_number: 2, current_bet: 0, chip_stack: 500 }),
      ];

      const gameState = createGameState({
        current_actor_seat: 1,
        current_bet: 0,
        pot_size: 0,
        seats_to_act: [1, 2],
        seats_acted: [],
      });

      const ctx: ActionContext = {
        room: standardRoom,
        players,
        gameState,
        fullBoard1: ["Ah", "Kh", "Qh", "Jh", "Th"],
        fullBoard2: ["2c", "3c", "4c", "5c", "6c"],
      };

      const result = applyAction(ctx, 1, "bet", 20);

      expect(result.updatedGameState.last_aggressor_seat).toBe(1);
      expect(result.updatedGameState.last_raise_amount).toBe(20);
      const history = result.updatedGameState.action_history as
        | Array<{ seat_number: number; action_type: string; amount?: number }>
        | undefined;
      expect(history).toHaveLength(1);
      const entry = history?.[0] as {
        seat_number: number;
        action_type: string;
        amount?: number;
      };
      expect(entry.seat_number).toBe(1);
      expect(entry.action_type).toBe("bet");
      expect(entry.amount).toBe(20);
    });

    it("should reject bet when bet already exists", () => {
      const players = [
        createPlayer({ seat_number: 1, current_bet: 0, chip_stack: 500 }),
        createPlayer({ seat_number: 2, current_bet: 10, chip_stack: 490 }),
      ];

      const gameState = createGameState({
        current_actor_seat: 1,
        current_bet: 10,
        pot_size: 10,
      });

      const ctx: ActionContext = {
        room: standardRoom,
        players,
        gameState,
        fullBoard1: ["Ah", "Kh", "Qh", "Jh", "Th"],
        fullBoard2: ["2c", "3c", "4c", "5c", "6c"],
      };

      const result = applyAction(ctx, 1, "bet", 20);

      expect(result.error).toBe("Bet not allowed after bet");
    });

    it("should reject bet without amount", () => {
      const players = [
        createPlayer({ seat_number: 1, current_bet: 0, chip_stack: 500 }),
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

      const result = applyAction(ctx, 1, "bet");

      expect(result.error).toBe("Bet amount required");
    });

    it("should reject bet with zero or negative amount", () => {
      const players = [
        createPlayer({ seat_number: 1, current_bet: 0, chip_stack: 500 }),
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
      expect(result.error).toBe("Bet amount required");

      const result2 = applyAction(ctx, 1, "bet", -10);
      expect(result2.error).toBe("Bet amount required");
    });

    it("should reopen action for all players after bet", () => {
      const players = [
        createPlayer({ seat_number: 1, current_bet: 0, chip_stack: 500 }),
        createPlayer({ seat_number: 2, current_bet: 0, chip_stack: 500 }),
        createPlayer({ seat_number: 3, current_bet: 0, chip_stack: 500 }),
      ];

      const gameState = createGameState({
        current_actor_seat: 1,
        current_bet: 0,
        button_seat: 3,
        seats_to_act: [1, 2, 3],
        seats_acted: [],
      });

      const ctx: ActionContext = {
        room: standardRoom,
        players,
        gameState,
        fullBoard1: ["Ah", "Kh", "Qh", "Jh", "Th"],
        fullBoard2: ["2c", "3c", "4c", "5c", "6c"],
      };

      const result = applyAction(ctx, 1, "bet", 20);

      // Action reopens: seats after bettor (2, 3), then wraps around but excludes bettor
      expect(result.updatedGameState.seats_to_act).toEqual([2, 3]);
      expect(result.updatedGameState.seats_acted).toEqual([]);
    });
  });

  describe("Raise action", () => {
    it("should increase current bet", () => {
      const players = [
        createPlayer({ seat_number: 1, current_bet: 10, chip_stack: 490 }),
        createPlayer({ seat_number: 2, current_bet: 0, chip_stack: 500 }),
      ];

      const gameState = createGameState({
        current_actor_seat: 2,
        current_bet: 10,
        min_raise: 10,
        pot_size: 10,
      });

      const ctx: ActionContext = {
        room: standardRoom,
        players,
        gameState,
        fullBoard1: ["Ah", "Kh", "Qh", "Jh", "Th"],
        fullBoard2: ["2c", "3c", "4c", "5c", "6c"],
      };

      const result = applyAction(ctx, 2, "raise", 30);

      expect(result.error).toBeUndefined();
      expect(result.updatedGameState.current_bet).toBe(30);
      expect(result.updatedGameState.min_raise).toBe(20); // 30 - 10
      expect(result.updatedGameState.pot_size).toBe(40); // 10 + 30

      const raiser = result.updatedPlayers.find((p) => p.seat_number === 2);
      expect(raiser?.chip_stack).toBe(470); // 500 - 30
      expect(raiser?.current_bet).toBe(30);
    });

    it("should reject raise when no bet to raise", () => {
      const players = [
        createPlayer({ seat_number: 1, current_bet: 0, chip_stack: 500 }),
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

      const result = applyAction(ctx, 1, "raise", 20);

      expect(result.error).toBe("No bet to raise");
    });

    it("should reject raise that does not exceed current bet", () => {
      const players = [
        createPlayer({ seat_number: 1, current_bet: 20, chip_stack: 480 }),
        createPlayer({ seat_number: 2, current_bet: 0, chip_stack: 500 }),
      ];

      const gameState = createGameState({
        current_actor_seat: 2,
        current_bet: 20,
        min_raise: 10,
      });

      const ctx: ActionContext = {
        room: standardRoom,
        players,
        gameState,
        fullBoard1: ["Ah", "Kh", "Qh", "Jh", "Th"],
        fullBoard2: ["2c", "3c", "4c", "5c", "6c"],
      };

      const result = applyAction(ctx, 2, "raise", 20);

      expect(result.error).toBe("Raise must exceed current bet");
    });

    it("should reject raise below minimum raise amount", () => {
      const players = [
        createPlayer({ seat_number: 1, current_bet: 20, chip_stack: 480 }),
        createPlayer({ seat_number: 2, current_bet: 0, chip_stack: 500 }),
      ];

      const gameState = createGameState({
        current_actor_seat: 2,
        current_bet: 20,
        min_raise: 20,
      });

      const ctx: ActionContext = {
        room: standardRoom,
        players,
        gameState,
        fullBoard1: ["Ah", "Kh", "Qh", "Jh", "Th"],
        fullBoard2: ["2c", "3c", "4c", "5c", "6c"],
      };

      // Trying to raise to 30 (only 10 more), but min raise is 20
      const result = applyAction(ctx, 2, "raise", 30);

      expect(result.error).toBe("Raise below minimum");
    });

    it("should handle raise when player already has partial bet", () => {
      const players = [
        createPlayer({
          seat_number: 1,
          current_bet: 50,
          chip_stack: 450,
          total_invested_this_hand: 50,
        }),
        createPlayer({
          seat_number: 2,
          current_bet: 10,
          chip_stack: 490,
          total_invested_this_hand: 10,
        }),
      ];

      const gameState = createGameState({
        current_actor_seat: 2,
        current_bet: 50,
        min_raise: 20,
        pot_size: 60,
      });

      const ctx: ActionContext = {
        room: standardRoom,
        players,
        gameState,
        fullBoard1: ["Ah", "Kh", "Qh", "Jh", "Th"],
        fullBoard2: ["2c", "3c", "4c", "5c", "6c"],
      };

      const result = applyAction(ctx, 2, "raise", 80);

      expect(result.error).toBeUndefined();

      const raiser = result.updatedPlayers.find((p) => p.seat_number === 2);
      expect(raiser?.chip_stack).toBe(420); // 490 - 70 (to go from 10 to 80)
      expect(raiser?.current_bet).toBe(80);
      expect(raiser?.total_invested_this_hand).toBe(80);
      expect(result.updatedGameState.pot_size).toBe(130); // 60 + 70
    });

    it("should reopen action for all players after raise", () => {
      const players = [
        createPlayer({ seat_number: 1, current_bet: 10, chip_stack: 490 }),
        createPlayer({ seat_number: 2, current_bet: 0, chip_stack: 500 }),
        createPlayer({ seat_number: 3, current_bet: 0, chip_stack: 500 }),
      ];

      const gameState = createGameState({
        current_actor_seat: 2,
        current_bet: 10,
        button_seat: 3,
        seats_to_act: [2, 3],
        seats_acted: [1],
      });

      const ctx: ActionContext = {
        room: standardRoom,
        players,
        gameState,
        fullBoard1: ["Ah", "Kh", "Qh", "Jh", "Th"],
        fullBoard2: ["2c", "3c", "4c", "5c", "6c"],
      };

      const result = applyAction(ctx, 2, "raise", 30);

      // Action reopens: seats after raiser (3), then wraps to 1, but excludes raiser (2)
      expect(result.updatedGameState.seats_to_act).toEqual([3, 1]);
      expect(result.updatedGameState.seats_acted).toEqual([]);
    });
  });

  describe("All-in action", () => {
    it("should bet all remaining chips", () => {
      const players = [
        createPlayer({ seat_number: 1, current_bet: 0, chip_stack: 75 }),
        createPlayer({ seat_number: 2, current_bet: 0, chip_stack: 500 }),
      ];

      const gameState = createGameState({
        current_actor_seat: 1,
        current_bet: 0,
        pot_size: 0,
      });

      const ctx: ActionContext = {
        room: standardRoom,
        players,
        gameState,
        fullBoard1: ["Ah", "Kh", "Qh", "Jh", "Th"],
        fullBoard2: ["2c", "3c", "4c", "5c", "6c"],
      };

      const result = applyAction(ctx, 1, "all_in");

      expect(result.error).toBeUndefined();

      const allInPlayer = result.updatedPlayers.find(
        (p) => p.seat_number === 1,
      );
      expect(allInPlayer?.chip_stack).toBe(0);
      expect(allInPlayer?.current_bet).toBe(75);
      expect(allInPlayer?.is_all_in).toBe(true);
      expect(result.updatedGameState.pot_size).toBe(75);
    });

    it("should mark player as all-in when raising all chips", () => {
      const players = [
        createPlayer({ seat_number: 1, current_bet: 20, chip_stack: 480 }),
        createPlayer({ seat_number: 2, current_bet: 0, chip_stack: 50 }),
        createPlayer({ seat_number: 3, current_bet: 20, chip_stack: 480 }),
      ];

      const gameState = createGameState({
        current_actor_seat: 2,
        current_bet: 20,
        pot_size: 40,
        button_seat: 1,
        seats_to_act: [2, 3],
      });

      const ctx: ActionContext = {
        room: standardRoom,
        players,
        gameState,
        fullBoard1: ["Ah", "Kh", "Qh", "Jh", "Th"],
        fullBoard2: ["2c", "3c", "4c", "5c", "6c"],
      };

      const result = applyAction(ctx, 2, "all_in");

      expect(result.error).toBeUndefined();

      const allInPlayer = result.updatedPlayers.find(
        (p) => p.seat_number === 2,
      );
      expect(allInPlayer?.chip_stack).toBe(0);
      expect(allInPlayer?.current_bet).toBe(50);
      expect(allInPlayer?.is_all_in).toBe(true);
      expect(result.updatedGameState.current_bet).toBe(50);
      expect(result.updatedGameState.pot_size).toBe(90); // 40 + 50
    });

    it("should treat short-stack all-in as call when below current bet", () => {
      const players = [
        createPlayer({ seat_number: 1, current_bet: 50, chip_stack: 450 }),
        createPlayer({ seat_number: 2, current_bet: 0, chip_stack: 30 }),
        createPlayer({ seat_number: 3, current_bet: 50, chip_stack: 450 }),
      ];

      const gameState = createGameState({
        current_actor_seat: 2,
        current_bet: 50,
        pot_size: 100,
        button_seat: 1,
        seats_to_act: [2, 3],
      });

      const ctx: ActionContext = {
        room: standardRoom,
        players,
        gameState,
        fullBoard1: ["Ah", "Kh", "Qh", "Jh", "Th"],
        fullBoard2: ["2c", "3c", "4c", "5c", "6c"],
      };

      const result = applyAction(ctx, 2, "all_in");

      expect(result.error).toBeUndefined();

      const allInPlayer = result.updatedPlayers.find(
        (p) => p.seat_number === 2,
      );
      expect(allInPlayer?.chip_stack).toBe(0);
      expect(allInPlayer?.current_bet).toBe(30);
      expect(allInPlayer?.is_all_in).toBe(true);

      // Current bet stays at 50 (not raised), pot continues
      expect(result.updatedGameState.pot_size).toBe(130); // 100 + 30
    });

    it("should not reopen action when all-in is below current bet", () => {
      const players = [
        createPlayer({ seat_number: 1, current_bet: 50, chip_stack: 450 }),
        createPlayer({ seat_number: 2, current_bet: 0, chip_stack: 30 }),
        createPlayer({ seat_number: 3, current_bet: 0, chip_stack: 500 }),
      ];

      const gameState = createGameState({
        current_actor_seat: 2,
        current_bet: 50,
        button_seat: 1,
        seats_to_act: [2, 3],
        seats_acted: [1],
      });

      const ctx: ActionContext = {
        room: standardRoom,
        players,
        gameState,
        fullBoard1: ["Ah", "Kh", "Qh", "Jh", "Th"],
        fullBoard2: ["2c", "3c", "4c", "5c", "6c"],
      };

      const result = applyAction(ctx, 2, "all_in");

      // Treated as call, so just removes seat 2 from seats_to_act
      expect(result.updatedGameState.seats_to_act).toEqual([3]);
      expect(result.updatedGameState.seats_acted).toContain(2);
    });

    it("should reopen action when all-in exceeds current bet", () => {
      const players = [
        createPlayer({ seat_number: 1, current_bet: 20, chip_stack: 480 }),
        createPlayer({ seat_number: 2, current_bet: 0, chip_stack: 100 }),
        createPlayer({ seat_number: 3, current_bet: 0, chip_stack: 500 }),
      ];

      const gameState = createGameState({
        current_actor_seat: 2,
        current_bet: 20,
        button_seat: 3,
        seats_to_act: [2, 3],
        seats_acted: [1],
      });

      const ctx: ActionContext = {
        room: standardRoom,
        players,
        gameState,
        fullBoard1: ["Ah", "Kh", "Qh", "Jh", "Th"],
        fullBoard2: ["2c", "3c", "4c", "5c", "6c"],
      };

      const result = applyAction(ctx, 2, "all_in");

      expect(result.updatedGameState.current_bet).toBe(100);
      // Action reopens for remaining players (seat 2 excluded due to chip_stack = 0)
      // actionOrder filters chip_stack > 0, so [1, 3] in button order
      expect(result.updatedGameState.seats_to_act).toEqual([1, 3]);
      expect(result.updatedGameState.seats_acted).toEqual([]);
    });

    it("should build correct side pots across all-in and calls during a street", () => {
      let players = [
        createPlayer({ seat_number: 1, chip_stack: 100 }),
        createPlayer({ seat_number: 2, chip_stack: 50 }),
        createPlayer({ seat_number: 3, chip_stack: 200 }),
      ];

      let gameState = createGameState({
        phase: "flop",
        current_actor_seat: 1,
        current_bet: 0,
        min_raise: 2,
        pot_size: 0,
        button_seat: 3,
        seats_to_act: [1, 2, 3],
        seats_acted: [],
      });

      const fullBoard1 = ["Ah", "Kh", "Qh", "Jh", "Th"];
      const fullBoard2 = ["2c", "3c", "4c", "5c", "6c"];

      // Seat 1 open-shoves for 100
      let ctx: ActionContext = {
        room: standardRoom,
        players,
        gameState,
        fullBoard1,
        fullBoard2,
      };
      let result = applyAction(ctx, 1, "all_in");
      players = mergePlayers(players, result.updatedPlayers);
      gameState = { ...gameState, ...result.updatedGameState };

      // Seat 2 short-stack calls all-in for 50
      ctx = { room: standardRoom, players, gameState, fullBoard1, fullBoard2 };
      result = applyAction(ctx, 2, "all_in");
      players = mergePlayers(players, result.updatedPlayers);
      gameState = { ...gameState, ...result.updatedGameState };

      // Seat 3 calls full amount
      // Since players 1 and 2 are all-in, only player 3 has chips left
      // The hand should fast-forward to complete (no more betting possible)
      ctx = { room: standardRoom, players, gameState, fullBoard1, fullBoard2 };
      result = applyAction(ctx, 3, "call");

      expect(result.handCompleted).toBe(true);
      expect(result.updatedGameState.phase).toBe("complete");
      expect(result.updatedGameState.pot_size).toBe(250); // 100 + 50 + 100
      expect(result.updatedGameState.side_pots).toEqual([
        { amount: 150, eligibleSeats: [1, 2, 3] },
        { amount: 100, eligibleSeats: [1, 3] },
      ]);
    });
  });
});
