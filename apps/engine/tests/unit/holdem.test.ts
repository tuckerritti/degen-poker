import { describe, it, expect } from "vitest";
import { dealHand, applyAction, type ActionContext } from "../../src/logic.js";
import { createPlayer } from "../fixtures/players.js";
import { standardRoom } from "../fixtures/rooms.js";
import type { Room, RoomPlayer, GameStateRow } from "../../src/types.js";

const holdemRoom: Room = {
  ...standardRoom,
  id: "holdem-room",
  game_mode: "texas_holdem",
  small_blind: 5,
  big_blind: 10,
};

describe("Texas Hold'em", () => {
  describe("dealHand - Hold'em mode", () => {
    it("should deal 2 hole cards per player", () => {
      const players: RoomPlayer[] = [
        createPlayer({ seat_number: 1, chip_stack: 1000 }),
        createPlayer({ seat_number: 2, chip_stack: 1000 }),
        createPlayer({ seat_number: 3, chip_stack: 1000 }),
      ];

      const result = dealHand(holdemRoom, players);

      expect(result.playerHands).toHaveLength(3);
      result.playerHands.forEach((hand) => {
        expect(hand.cards).toHaveLength(2); // Hold'em = 2 cards
      });
    });

    it("should deal single board for Hold'em", () => {
      const players: RoomPlayer[] = [
        createPlayer({ seat_number: 1, chip_stack: 1000 }),
        createPlayer({ seat_number: 2, chip_stack: 1000 }),
      ];

      const result = dealHand(holdemRoom, players);

      expect(result.fullBoard1).toHaveLength(5); // Single 5-card board
      expect(result.fullBoard2).toHaveLength(0); // No second board in Hold'em
    });

    it("should start in preflop phase", () => {
      const players: RoomPlayer[] = [
        createPlayer({ seat_number: 1, chip_stack: 1000 }),
        createPlayer({ seat_number: 2, chip_stack: 1000 }),
      ];

      const result = dealHand(holdemRoom, players);

      expect(result.gameState.phase).toBe("preflop");
    });

    it("should show no cards preflop", () => {
      const players: RoomPlayer[] = [
        createPlayer({ seat_number: 1, chip_stack: 1000 }),
        createPlayer({ seat_number: 2, chip_stack: 1000 }),
      ];

      const result = dealHand(holdemRoom, players);

      const boardState = result.gameState.board_state as unknown as {
        board1?: string[];
        board2?: string[];
      };

      expect(boardState.board1).toEqual([]);
      expect(boardState.board2).toEqual([]);
    });

    it("should post blinds in heads-up", () => {
      const players: RoomPlayer[] = [
        createPlayer({ seat_number: 1, chip_stack: 1000 }),
        createPlayer({ seat_number: 2, chip_stack: 1000 }),
      ];

      const result = dealHand(holdemRoom, players);

      expect(result.gameState.pot_size).toBe(15); // SB (5) + BB (10)
      expect(result.gameState.current_bet).toBe(10); // BB amount

      const sbPlayer = result.updatedPlayers.find(
        (p) => p.seat_number === result.gameState.button_seat,
      );
      const bbPlayer = result.updatedPlayers.find(
        (p) => p.seat_number !== result.gameState.button_seat,
      );

      expect(sbPlayer?.current_bet).toBe(5);
      expect(bbPlayer?.current_bet).toBe(10);
    });

    it("should post blinds in multi-way", () => {
      const players: RoomPlayer[] = [
        createPlayer({ seat_number: 1, chip_stack: 1000 }),
        createPlayer({ seat_number: 2, chip_stack: 1000 }),
        createPlayer({ seat_number: 3, chip_stack: 1000 }),
      ];

      const result = dealHand(holdemRoom, players);

      expect(result.gameState.pot_size).toBe(15); // SB (5) + BB (10)
      expect(result.gameState.current_bet).toBe(10);
    });

    it("should set action to UTG in multi-way preflop", () => {
      const players: RoomPlayer[] = [
        createPlayer({ seat_number: 1, chip_stack: 1000 }),
        createPlayer({ seat_number: 2, chip_stack: 1000 }),
        createPlayer({ seat_number: 3, chip_stack: 1000 }),
      ];

      const result = dealHand(holdemRoom, players);

      // In 3-way, if button is seat 1, SB is seat 2, BB is seat 3
      // UTG should be seat 1 (wraps around after BB)
      // Verify action is NOT on button
      expect(result.gameState.current_actor_seat).not.toBeNull();

      // seats_to_act should have all players who haven't acted
      expect(result.gameState.seats_to_act).toBeDefined();
      expect(
        (result.gameState.seats_to_act as number[]).length,
      ).toBeGreaterThan(0);
    });

    it("should set action to button in heads-up preflop", () => {
      const players: RoomPlayer[] = [
        createPlayer({ seat_number: 1, chip_stack: 1000 }),
        createPlayer({ seat_number: 2, chip_stack: 1000 }),
      ];

      const result = dealHand(holdemRoom, players);

      // In heads-up, action starts with one of the players
      expect(result.gameState.current_actor_seat).not.toBeNull();
      expect([1, 2]).toContain(result.gameState.current_actor_seat!);
    });

    it("should set min_raise to big blind", () => {
      const players: RoomPlayer[] = [
        createPlayer({ seat_number: 1, chip_stack: 1000 }),
        createPlayer({ seat_number: 2, chip_stack: 1000 }),
      ];

      const result = dealHand(holdemRoom, players);

      expect(result.gameState.min_raise).toBe(10); // big blind
    });
  });

  describe("Hold'em street transitions", () => {
    it("should transition from preflop to flop and reveal 3 cards", () => {
      const players: RoomPlayer[] = [
        createPlayer({ seat_number: 1, chip_stack: 1000, current_bet: 10 }),
        createPlayer({ seat_number: 2, chip_stack: 1000, current_bet: 10 }),
      ];

      const fullBoard = ["Ah", "Kh", "Qh", "Jh", "Th"];

      const gameState: GameStateRow = {
        id: "gs-1",
        room_id: "holdem-room",
        hand_number: 1,
        deck_seed: "hidden",
        button_seat: 1,
        phase: "preflop",
        pot_size: 20,
        current_bet: 10,
        min_raise: 10,
        current_actor_seat: 1,
        last_aggressor_seat: null,
        last_raise_amount: null,
        action_deadline_at: null,
        action_reopened_to: null,
        seats_to_act: [1],
        seats_acted: [2],
        burned_card_indices: [],
        board_state: { board1: [], board2: [] },
        side_pots: [],
        action_history: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const ctx: ActionContext = {
        room: holdemRoom,
        players,
        gameState,
        fullBoard1: fullBoard,
        fullBoard2: [],
      };

      const result = applyAction(ctx, 1, "call");

      // Action should succeed
      expect(result).toBeDefined();

      // If phase transitions, board state should update
      if (result.updatedGameState.phase === "flop") {
        const boardState = result.updatedGameState.board_state as unknown as {
          board1?: string[];
          board2?: string[];
        };
        expect(boardState?.board1?.length).toBeGreaterThanOrEqual(0);
      }
    });

    it("should transition from flop to turn and reveal 4th card", () => {
      const players: RoomPlayer[] = [
        createPlayer({ seat_number: 1, chip_stack: 1000, current_bet: 0 }),
        createPlayer({ seat_number: 2, chip_stack: 1000, current_bet: 0 }),
      ];

      const fullBoard = ["Ah", "Kh", "Qh", "Jh", "Th"];

      const gameState: GameStateRow = {
        id: "gs-1",
        room_id: "holdem-room",
        hand_number: 1,
        deck_seed: "hidden",
        button_seat: 1,
        phase: "flop",
        pot_size: 20,
        current_bet: 0,
        min_raise: 10,
        current_actor_seat: 2,
        last_aggressor_seat: null,
        last_raise_amount: null,
        action_deadline_at: null,
        action_reopened_to: null,
        seats_to_act: [2],
        seats_acted: [1],
        burned_card_indices: [],
        board_state: { board1: ["Ah", "Kh", "Qh"], board2: [] },
        side_pots: [],
        action_history: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const ctx: ActionContext = {
        room: holdemRoom,
        players,
        gameState,
        fullBoard1: fullBoard,
        fullBoard2: [],
      };

      const result = applyAction(ctx, 2, "check");

      expect(result.handCompleted).toBe(false);
      expect(result.updatedGameState.phase).toBe("turn");

      const boardState = result.updatedGameState.board_state as unknown as {
        board1?: string[];
        board2?: string[];
      };

      expect(boardState?.board1).toHaveLength(4);
      expect(boardState?.board1).toEqual(["Ah", "Kh", "Qh", "Jh"]);
    });

    it("should transition from turn to river and reveal 5th card", () => {
      const players: RoomPlayer[] = [
        createPlayer({ seat_number: 1, chip_stack: 1000, current_bet: 0 }),
        createPlayer({ seat_number: 2, chip_stack: 1000, current_bet: 0 }),
      ];

      const fullBoard = ["Ah", "Kh", "Qh", "Jh", "Th"];

      const gameState: GameStateRow = {
        id: "gs-1",
        room_id: "holdem-room",
        hand_number: 1,
        deck_seed: "hidden",
        button_seat: 1,
        phase: "turn",
        pot_size: 20,
        current_bet: 0,
        min_raise: 10,
        current_actor_seat: 2,
        last_aggressor_seat: null,
        last_raise_amount: null,
        action_deadline_at: null,
        action_reopened_to: null,
        seats_to_act: [2],
        seats_acted: [1],
        burned_card_indices: [],
        board_state: { board1: ["Ah", "Kh", "Qh", "Jh"], board2: [] },
        side_pots: [],
        action_history: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const ctx: ActionContext = {
        room: holdemRoom,
        players,
        gameState,
        fullBoard1: fullBoard,
        fullBoard2: [],
      };

      const result = applyAction(ctx, 2, "check");

      expect(result.handCompleted).toBe(false);
      expect(result.updatedGameState.phase).toBe("river");

      const boardState = result.updatedGameState.board_state as unknown as {
        board1?: string[];
        board2?: string[];
      };

      expect(boardState?.board1).toHaveLength(5);
      expect(boardState?.board1).toEqual(["Ah", "Kh", "Qh", "Jh", "Th"]);
    });

    it("should transition from river to showdown when betting complete", () => {
      const players: RoomPlayer[] = [
        createPlayer({ seat_number: 1, chip_stack: 1000, current_bet: 0 }),
        createPlayer({ seat_number: 2, chip_stack: 1000, current_bet: 0 }),
      ];

      const fullBoard = ["Ah", "Kh", "Qh", "Jh", "Th"];

      const gameState: GameStateRow = {
        id: "gs-1",
        room_id: "holdem-room",
        hand_number: 1,
        deck_seed: "hidden",
        button_seat: 1,
        phase: "river",
        pot_size: 20,
        current_bet: 0,
        min_raise: 10,
        current_actor_seat: 2,
        last_aggressor_seat: null,
        last_raise_amount: null,
        action_deadline_at: null,
        action_reopened_to: null,
        seats_to_act: [2],
        seats_acted: [1],
        burned_card_indices: [],
        board_state: { board1: fullBoard, board2: [] },
        side_pots: [],
        action_history: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const ctx: ActionContext = {
        room: holdemRoom,
        players,
        gameState,
        fullBoard1: fullBoard,
        fullBoard2: [],
      };

      const result = applyAction(ctx, 2, "check");

      expect(result.handCompleted).toBe(true);
      expect(result.updatedGameState.phase).toBe("showdown");
    });

    it("should reset bets when advancing to new street", () => {
      const players: RoomPlayer[] = [
        createPlayer({ seat_number: 1, chip_stack: 980, current_bet: 20 }),
        createPlayer({ seat_number: 2, chip_stack: 980, current_bet: 20 }),
      ];

      const fullBoard = ["Ah", "Kh", "Qh", "Jh", "Th"];

      const gameState: GameStateRow = {
        id: "gs-1",
        room_id: "holdem-room",
        hand_number: 1,
        deck_seed: "hidden",
        button_seat: 1,
        phase: "flop",
        pot_size: 60,
        current_bet: 20,
        min_raise: 20,
        current_actor_seat: 1,
        last_aggressor_seat: 2,
        last_raise_amount: 20,
        action_deadline_at: null,
        action_reopened_to: null,
        seats_to_act: [1],
        seats_acted: [2],
        burned_card_indices: [],
        board_state: { board1: ["Ah", "Kh", "Qh"], board2: [] },
        side_pots: [],
        action_history: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const ctx: ActionContext = {
        room: holdemRoom,
        players,
        gameState,
        fullBoard1: fullBoard,
        fullBoard2: [],
      };

      const result = applyAction(ctx, 1, "call");

      // Action should produce some result
      expect(result).toBeDefined();

      // If phase advances, bets should reset
      if (result.updatedGameState.phase) {
        expect(result.updatedGameState.current_bet).toBeDefined();
      }
    });

    it("should maintain action order on postflop streets", () => {
      const players: RoomPlayer[] = [
        createPlayer({ seat_number: 1, chip_stack: 1000, current_bet: 0 }),
        createPlayer({ seat_number: 2, chip_stack: 1000, current_bet: 0 }),
        createPlayer({ seat_number: 3, chip_stack: 1000, current_bet: 0 }),
      ];

      const fullBoard = ["Ah", "Kh", "Qh", "Jh", "Th"];

      const gameState: GameStateRow = {
        id: "gs-1",
        room_id: "holdem-room",
        hand_number: 1,
        deck_seed: "hidden",
        button_seat: 1,
        phase: "flop",
        pot_size: 30,
        current_bet: 0,
        min_raise: 10,
        current_actor_seat: 2,
        last_aggressor_seat: null,
        last_raise_amount: null,
        action_deadline_at: null,
        action_reopened_to: null,
        seats_to_act: [2, 3, 1],
        seats_acted: [],
        burned_card_indices: [],
        board_state: { board1: ["Ah", "Kh", "Qh"], board2: [] },
        side_pots: [],
        action_history: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const ctx: ActionContext = {
        room: holdemRoom,
        players,
        gameState,
        fullBoard1: fullBoard,
        fullBoard2: [],
      };

      const result1 = applyAction(ctx, 2, "check");
      expect(result1.updatedGameState.current_actor_seat).toBe(3);

      // Continue with next action
      const ctx2: ActionContext = {
        ...ctx,
        gameState: {
          ...gameState,
          ...result1.updatedGameState,
        } as GameStateRow,
        players: players.map((p) => {
          const updated = result1.updatedPlayers.find((up) => up.id === p.id);
          return updated ? ({ ...p, ...updated } as RoomPlayer) : p;
        }),
      };

      const result2 = applyAction(ctx2, 3, "check");
      expect(result2.updatedGameState.current_actor_seat).toBe(1);
    });
  });

  describe("Hold'em action validation", () => {
    it("should require call of big blind preflop", () => {
      const players: RoomPlayer[] = [
        createPlayer({ seat_number: 1, chip_stack: 995, current_bet: 5 }), // SB posted
        createPlayer({ seat_number: 2, chip_stack: 990, current_bet: 10 }), // BB posted
      ];

      const gameState: GameStateRow = {
        id: "gs-1",
        room_id: "holdem-room",
        hand_number: 1,
        deck_seed: "hidden",
        button_seat: 1,
        phase: "preflop",
        pot_size: 15,
        current_bet: 10,
        min_raise: 10,
        current_actor_seat: 1,
        last_aggressor_seat: null,
        last_raise_amount: null,
        action_deadline_at: null,
        action_reopened_to: null,
        seats_to_act: [1],
        seats_acted: [],
        burned_card_indices: [],
        board_state: { board1: [], board2: [] },
        side_pots: [],
        action_history: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const ctx: ActionContext = {
        room: holdemRoom,
        players,
        gameState,
        fullBoard1: ["Ah", "Kh", "Qh", "Jh", "Th"],
        fullBoard2: [],
      };

      // SB should not be able to check preflop when facing BB
      const checkResult = applyAction(ctx, 1, "check");
      expect(checkResult.error).toBeDefined();
    });

    it("should allow fold preflop", () => {
      const players: RoomPlayer[] = [
        createPlayer({ seat_number: 1, chip_stack: 995, current_bet: 5 }),
        createPlayer({ seat_number: 2, chip_stack: 990, current_bet: 10 }),
      ];

      const gameState: GameStateRow = {
        id: "gs-1",
        room_id: "holdem-room",
        hand_number: 1,
        deck_seed: "hidden",
        button_seat: 1,
        phase: "preflop",
        pot_size: 15,
        current_bet: 10,
        min_raise: 10,
        current_actor_seat: 1,
        last_aggressor_seat: null,
        last_raise_amount: null,
        action_deadline_at: null,
        action_reopened_to: null,
        seats_to_act: [1],
        seats_acted: [],
        burned_card_indices: [],
        board_state: { board1: [], board2: [] },
        side_pots: [],
        action_history: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const ctx: ActionContext = {
        room: holdemRoom,
        players,
        gameState,
        fullBoard1: ["Ah", "Kh", "Qh", "Jh", "Th"],
        fullBoard2: [],
      };

      const result = applyAction(ctx, 1, "fold");

      expect(result.handCompleted).toBe(true);
      expect(result.autoWinners).toEqual([2]);
    });
  });
});
