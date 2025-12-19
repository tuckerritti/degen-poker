import { describe, it, expect } from "vitest";
import { applyAction, type ActionContext } from "../../src/logic.js";
import { standardRoom } from "../fixtures/rooms.js";
import { createPlayer } from "../fixtures/players.js";
import { createGameState } from "../fixtures/gameStates.js";

describe("Phase Transitions", () => {
  describe("Flop to Turn", () => {
    it("should advance to turn when all players check on flop", () => {
      const players = [
        createPlayer({ seat_number: 1, current_bet: 5, chip_stack: 495 }),
        createPlayer({ seat_number: 2, current_bet: 5, chip_stack: 495 }),
      ];

      const gameState = createGameState({
        phase: "flop",
        current_actor_seat: 2,
        current_bet: 5,
        pot_size: 10,
        button_seat: 1,
        seats_to_act: [2],
        seats_acted: [1],
        board_state: {
          board1: ["Ah", "Kh", "Qh"],
          board2: ["2c", "3c", "4c"],
        },
      });

      const ctx: ActionContext = {
        room: standardRoom,
        players,
        gameState,
        fullBoard1: ["Ah", "Kh", "Qh", "Jh", "Th"],
        fullBoard2: ["2c", "3c", "4c", "5c", "6c"],
      };

      const result = applyAction(ctx, 2, "check");

      expect(result.error).toBeUndefined();
      expect(result.updatedGameState.phase).toBe("turn");
      // Turn should show 4 cards
      expect(result.updatedGameState.board_state?.board1).toHaveLength(4);
      expect(result.updatedGameState.board_state?.board2).toHaveLength(4);
      expect(result.updatedGameState.board_state?.board1).toEqual([
        "Ah",
        "Kh",
        "Qh",
        "Jh",
      ]);
      expect(result.updatedGameState.board_state?.board2).toEqual([
        "2c",
        "3c",
        "4c",
        "5c",
      ]);
    });

    it("should reset bets when advancing to turn", () => {
      const players = [
        createPlayer({ seat_number: 1, current_bet: 20, chip_stack: 480 }),
        createPlayer({ seat_number: 2, current_bet: 20, chip_stack: 480 }),
      ];

      const gameState = createGameState({
        phase: "flop",
        current_actor_seat: 2,
        current_bet: 20,
        pot_size: 40,
        button_seat: 1,
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

      // Player 2 checks (bets already equal), which completes the street
      const result = applyAction(ctx, 2, "check");

      expect(result.updatedGameState.phase).toBe("turn");
      expect(result.updatedGameState.current_bet).toBe(0);
      // Players should have their bets reset
      const updatedPlayer1 = result.updatedPlayers.find(
        (p) => p.seat_number === 1,
      );
      const updatedPlayer2 = result.updatedPlayers.find(
        (p) => p.seat_number === 2,
      );
      expect(updatedPlayer1?.current_bet).toBe(0);
      expect(updatedPlayer2?.current_bet).toBe(0);
    });

    it("should reset minimum raise to big blind on a new street", () => {
      const players = [
        createPlayer({ seat_number: 1, current_bet: 50, chip_stack: 450 }),
        createPlayer({ seat_number: 2, current_bet: 50, chip_stack: 450 }),
      ];

      const gameState = createGameState({
        phase: "flop",
        current_actor_seat: 2,
        current_bet: 50,
        min_raise: 50,
        pot_size: 100,
        button_seat: 1,
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

      const result = applyAction(ctx, 2, "check");

      expect(result.updatedGameState.phase).toBe("turn");
      expect(result.updatedGameState.min_raise).toBe(standardRoom.big_blind);
    });

    it("should reset action order when advancing to turn", () => {
      const players = [
        createPlayer({ seat_number: 1, current_bet: 10, chip_stack: 490 }),
        createPlayer({ seat_number: 2, current_bet: 10, chip_stack: 490 }),
        createPlayer({ seat_number: 3, current_bet: 10, chip_stack: 490 }),
      ];

      const gameState = createGameState({
        phase: "flop",
        current_actor_seat: 3,
        current_bet: 10,
        button_seat: 1,
        seats_to_act: [3],
        seats_acted: [2],
      });

      const ctx: ActionContext = {
        room: standardRoom,
        players,
        gameState,
        fullBoard1: ["Ah", "Kh", "Qh", "Jh", "Th"],
        fullBoard2: ["2c", "3c", "4c", "5c", "6c"],
      };

      // Player 3 checks (bets already equal), completing the street
      const result = applyAction(ctx, 3, "check");

      expect(result.updatedGameState.phase).toBe("turn");
      // New action order starts after button
      expect(result.updatedGameState.seats_to_act).toEqual([2, 3, 1]);
      expect(result.updatedGameState.seats_acted).toEqual([]);
      expect(result.updatedGameState.current_actor_seat).toBe(2);
    });
  });

  describe("Turn to River", () => {
    it("should advance to river when betting round completes", () => {
      const players = [
        createPlayer({ seat_number: 1, current_bet: 0, chip_stack: 500 }),
        createPlayer({ seat_number: 2, current_bet: 0, chip_stack: 500 }),
      ];

      const gameState = createGameState({
        phase: "turn",
        current_actor_seat: 2,
        current_bet: 0,
        pot_size: 40,
        button_seat: 1,
        seats_to_act: [2],
        seats_acted: [1],
        board_state: {
          board1: ["Ah", "Kh", "Qh", "Jh"],
          board2: ["2c", "3c", "4c", "5c"],
        },
      });

      const ctx: ActionContext = {
        room: standardRoom,
        players,
        gameState,
        fullBoard1: ["Ah", "Kh", "Qh", "Jh", "Th"],
        fullBoard2: ["2c", "3c", "4c", "5c", "6c"],
      };

      const result = applyAction(ctx, 2, "check");

      expect(result.updatedGameState.phase).toBe("river");
      // River should show all 5 cards
      expect(result.updatedGameState.board_state?.board1).toHaveLength(5);
      expect(result.updatedGameState.board_state?.board2).toHaveLength(5);
      expect(result.updatedGameState.board_state?.board1).toEqual([
        "Ah",
        "Kh",
        "Qh",
        "Jh",
        "Th",
      ]);
      expect(result.updatedGameState.board_state?.board2).toEqual([
        "2c",
        "3c",
        "4c",
        "5c",
        "6c",
      ]);
    });
  });

  describe("River to Showdown", () => {
    it("should advance to showdown when river betting completes", () => {
      const players = [
        createPlayer({ seat_number: 1, current_bet: 0, chip_stack: 500 }),
        createPlayer({ seat_number: 2, current_bet: 0, chip_stack: 500 }),
      ];

      const gameState = createGameState({
        phase: "river",
        current_actor_seat: 2,
        current_bet: 0,
        pot_size: 100,
        button_seat: 1,
        seats_to_act: [2],
        seats_acted: [1],
        board_state: {
          board1: ["Ah", "Kh", "Qh", "Jh", "Th"],
          board2: ["2c", "3c", "4c", "5c", "6c"],
        },
      });

      const ctx: ActionContext = {
        room: standardRoom,
        players,
        gameState,
        fullBoard1: ["Ah", "Kh", "Qh", "Jh", "Th"],
        fullBoard2: ["2c", "3c", "4c", "5c", "6c"],
      };

      const result = applyAction(ctx, 2, "check");

      expect(result.updatedGameState.phase).toBe("showdown");
      expect(result.handCompleted).toBe(true);
      expect(result.autoWinners).toBeDefined();
      expect(result.potAwarded).toBe(100);
    });

    it("should calculate side pots at showdown", () => {
      const players = [
        createPlayer({
          seat_number: 1,
          current_bet: 0,
          chip_stack: 0,
          total_invested_this_hand: 50,
          is_all_in: true,
        }),
        createPlayer({
          seat_number: 2,
          current_bet: 0,
          chip_stack: 450,
          total_invested_this_hand: 50,
        }),
        createPlayer({
          seat_number: 3,
          current_bet: 0,
          chip_stack: 300,
          total_invested_this_hand: 200,
        }),
      ];

      const gameState = createGameState({
        phase: "river",
        current_actor_seat: 3,
        current_bet: 0,
        pot_size: 300,
        button_seat: 1,
        seats_to_act: [3],
        seats_acted: [2],
      });

      const ctx: ActionContext = {
        room: standardRoom,
        players,
        gameState,
        fullBoard1: ["Ah", "Kh", "Qh", "Jh", "Th"],
        fullBoard2: ["2c", "3c", "4c", "5c", "6c"],
      };

      const result = applyAction(ctx, 3, "check");

      expect(result.updatedGameState.phase).toBe("showdown");
      expect(result.updatedGameState.side_pots).toBeDefined();
      expect(result.updatedGameState.side_pots).toHaveLength(2);
    });
  });

  describe("All-in scenarios ending hand early", () => {
    it("should advance directly to showdown when only all-in players remain", () => {
      const players = [
        createPlayer({
          seat_number: 1,
          current_bet: 50,
          chip_stack: 0,
          is_all_in: true,
        }),
        createPlayer({
          seat_number: 2,
          current_bet: 50,
          chip_stack: 0,
          is_all_in: true,
        }),
        createPlayer({ seat_number: 3, current_bet: 0, chip_stack: 500 }),
      ];

      const gameState = createGameState({
        phase: "flop",
        current_actor_seat: 3,
        current_bet: 50,
        pot_size: 100,
        button_seat: 1,
        seats_to_act: [3],
        seats_acted: [],
      });

      const ctx: ActionContext = {
        room: standardRoom,
        players,
        gameState,
        fullBoard1: ["Ah", "Kh", "Qh", "Jh", "Th"],
        fullBoard2: ["2c", "3c", "4c", "5c", "6c"],
      };

      const result = applyAction(ctx, 3, "call");

      // When all players are either all-in or have acted, hand completes
      expect(result.handCompleted).toBe(true);
      expect(result.updatedGameState.phase).toBe("complete");
    });

    it("should complete hand immediately when everyone folds to last player", () => {
      const players = [
        createPlayer({
          seat_number: 1,
          current_bet: 0,
          chip_stack: 500,
          has_folded: true,
        }),
        createPlayer({
          seat_number: 2,
          current_bet: 0,
          chip_stack: 500,
          has_folded: false,
        }),
        createPlayer({ seat_number: 3, current_bet: 10, chip_stack: 490 }),
      ];

      const gameState = createGameState({
        phase: "flop",
        current_actor_seat: 2,
        current_bet: 10,
        pot_size: 20,
        button_seat: 1,
        seats_to_act: [2],
        seats_acted: [3],
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
      expect(result.updatedGameState.phase).toBe("complete");
      expect(result.autoWinners).toEqual([3]);
      expect(result.potAwarded).toBe(20);
    });
  });

  describe("Multi-street progression", () => {
    it("should skip all-in players from new street action", () => {
      const players = [
        createPlayer({
          seat_number: 1,
          current_bet: 100,
          chip_stack: 0,
          is_all_in: true,
        }),
        createPlayer({ seat_number: 2, current_bet: 100, chip_stack: 400 }),
        createPlayer({ seat_number: 3, current_bet: 100, chip_stack: 400 }),
      ];

      const gameState = createGameState({
        phase: "flop",
        current_actor_seat: 3,
        current_bet: 100,
        pot_size: 300,
        button_seat: 1,
        seats_to_act: [3],
        seats_acted: [2],
      });

      const ctx: ActionContext = {
        room: standardRoom,
        players,
        gameState,
        fullBoard1: ["Ah", "Kh", "Qh", "Jh", "Th"],
        fullBoard2: ["2c", "3c", "4c", "5c", "6c"],
      };

      // Player 3 checks (bets already equal), completing street
      const result = applyAction(ctx, 3, "check");

      expect(result.updatedGameState.phase).toBe("turn");
      // All-in player (seat 1) should not be in seats_to_act
      expect(result.updatedGameState.seats_to_act).toEqual([2, 3]);
      expect(result.updatedGameState.seats_to_act).not.toContain(1);
    });
  });
});
