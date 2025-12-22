import { describe, it, expect } from "vitest";
import {
  nextButtonSeat,
  actionOrder,
  advancePhase,
  dealHand,
  applyAction,
} from "../../src/logic.js";
import type { GameStateRow, Room } from "../../src/types.js";
import { createPlayer } from "../fixtures/players.js";

describe("Button and Action Order Logic", () => {
  const createRoom = (overrides: Partial<Room> = {}): Room => ({
    id: "room-1",
    game_mode: "texas_holdem",
    max_players: 9,
    min_buy_in: 10,
    max_buy_in: 1000,
    small_blind: 1,
    big_blind: 2,
    button_seat: 1,
    current_hand_number: 1,
    inter_hand_delay: 0,
    is_paused: false,
    pause_after_hand: false,
    is_active: true,
    last_activity_at: null,
    owner_auth_user_id: null,
    uses_two_decks: false,
    ...overrides,
  });

  describe("nextButtonSeat", () => {
    it("should return first seat when button is null", () => {
      const players = [
        createPlayer({ seat_number: 2 }),
        createPlayer({ seat_number: 5 }),
        createPlayer({ seat_number: 8 }),
      ];

      expect(nextButtonSeat(players, null)).toBe(2);
    });

    it("should return first seat for empty player list", () => {
      expect(nextButtonSeat([], null)).toBe(1);
    });

    it("should rotate to next higher seat", () => {
      const players = [
        createPlayer({ seat_number: 2 }),
        createPlayer({ seat_number: 5 }),
        createPlayer({ seat_number: 8 }),
      ];

      expect(nextButtonSeat(players, 2)).toBe(5);
      expect(nextButtonSeat(players, 5)).toBe(8);
    });

    it("should wrap around to first seat", () => {
      const players = [
        createPlayer({ seat_number: 2 }),
        createPlayer({ seat_number: 5 }),
        createPlayer({ seat_number: 8 }),
      ];

      expect(nextButtonSeat(players, 8)).toBe(2);
    });

    it("should return only seat for single player", () => {
      const players = [createPlayer({ seat_number: 3 })];
      expect(nextButtonSeat(players, null)).toBe(3);
      expect(nextButtonSeat(players, 3)).toBe(3);
    });

    it("should handle non-sequential seat numbers", () => {
      const players = [
        createPlayer({ seat_number: 1 }),
        createPlayer({ seat_number: 4 }),
        createPlayer({ seat_number: 7 }),
        createPlayer({ seat_number: 9 }),
      ];

      expect(nextButtonSeat(players, 1)).toBe(4);
      expect(nextButtonSeat(players, 4)).toBe(7);
      expect(nextButtonSeat(players, 7)).toBe(9);
      expect(nextButtonSeat(players, 9)).toBe(1);
    });

    it("should work with unsorted players", () => {
      const players = [
        createPlayer({ seat_number: 8 }),
        createPlayer({ seat_number: 2 }),
        createPlayer({ seat_number: 5 }),
      ];

      expect(nextButtonSeat(players, 2)).toBe(5);
      expect(nextButtonSeat(players, 5)).toBe(8);
      expect(nextButtonSeat(players, 8)).toBe(2);
    });
  });

  describe("actionOrder", () => {
    it("should start with seat after button, then wrap to include button last", () => {
      const players = [
        createPlayer({ seat_number: 1 }),
        createPlayer({ seat_number: 2 }),
        createPlayer({ seat_number: 3 }),
      ];

      const order = actionOrder(players, 1);
      expect(order).toEqual([2, 3, 1]);
    });

    it("should wrap around correctly", () => {
      const players = [
        createPlayer({ seat_number: 1 }),
        createPlayer({ seat_number: 3 }),
        createPlayer({ seat_number: 5 }),
      ];

      const order = actionOrder(players, 5);
      expect(order).toEqual([1, 3, 5]);
    });

    it("should exclude spectators", () => {
      const players = [
        createPlayer({ seat_number: 1 }),
        createPlayer({ seat_number: 2, is_spectating: true }),
        createPlayer({ seat_number: 3 }),
        createPlayer({ seat_number: 4 }),
      ];

      const order = actionOrder(players, 1);
      expect(order).toEqual([3, 4, 1]);
      expect(order).not.toContain(2);
    });

    it("should exclude sitting out players", () => {
      const players = [
        createPlayer({ seat_number: 1 }),
        createPlayer({ seat_number: 2 }),
        createPlayer({ seat_number: 3, is_sitting_out: true }),
        createPlayer({ seat_number: 4 }),
      ];

      const order = actionOrder(players, 1);
      expect(order).toEqual([2, 4, 1]);
      expect(order).not.toContain(3);
    });

    it("should exclude players with zero chips", () => {
      const players = [
        createPlayer({ seat_number: 1 }),
        createPlayer({ seat_number: 2, chip_stack: 0 }),
        createPlayer({ seat_number: 3 }),
        createPlayer({ seat_number: 4 }),
      ];

      const order = actionOrder(players, 1);
      expect(order).toEqual([3, 4, 1]);
      expect(order).not.toContain(2);
    });

    it("should return empty array when no active players", () => {
      const players = [
        createPlayer({ seat_number: 1, is_spectating: true }),
        createPlayer({ seat_number: 2, is_sitting_out: true }),
        createPlayer({ seat_number: 3, chip_stack: 0 }),
      ];

      const order = actionOrder(players, 1);
      expect(order).toEqual([]);
    });

    it("should return empty array for empty player list", () => {
      const order = actionOrder([], 1);
      expect(order).toEqual([]);
    });

    it("should handle button at highest seat", () => {
      const players = [
        createPlayer({ seat_number: 1 }),
        createPlayer({ seat_number: 5 }),
        createPlayer({ seat_number: 9 }),
      ];

      const order = actionOrder(players, 9);
      expect(order).toEqual([1, 5, 9]);
    });

    it("should handle button at lowest seat", () => {
      const players = [
        createPlayer({ seat_number: 1 }),
        createPlayer({ seat_number: 5 }),
        createPlayer({ seat_number: 9 }),
      ];

      const order = actionOrder(players, 1);
      expect(order).toEqual([5, 9, 1]);
    });

    it("should handle all players except spectators and sitting out", () => {
      const players = [
        createPlayer({ seat_number: 1 }),
        createPlayer({ seat_number: 2, is_spectating: true }),
        createPlayer({ seat_number: 3 }),
        createPlayer({ seat_number: 4, is_sitting_out: true }),
        createPlayer({ seat_number: 5 }),
        createPlayer({ seat_number: 6, chip_stack: 0 }),
      ];

      const order = actionOrder(players, 1);
      expect(order).toEqual([3, 5, 1]);
    });

    it("should exclude players waiting for next hand", () => {
      const players = [
        createPlayer({ seat_number: 1 }),
        createPlayer({ seat_number: 2, waiting_for_next_hand: true }),
        createPlayer({ seat_number: 3 }),
      ];

      const order = actionOrder(players, 1);
      expect(order).toEqual([3, 1]);
      expect(order).not.toContain(2);
    });
  });

  describe("waiting_for_next_hand", () => {
    it("should activate waiting players when a new hand is dealt", () => {
      const room = createRoom({ button_seat: 1 });
      const players = [
        createPlayer({ seat_number: 1 }),
        createPlayer({ seat_number: 2, waiting_for_next_hand: true }),
        createPlayer({ seat_number: 3 }),
      ];

      const { updatedPlayers } = dealHand(room, players);
      const waitingUpdate = updatedPlayers.find(
        (player) => player.id === players[1].id,
      );

      expect(waitingUpdate?.waiting_for_next_hand).toBe(false);
    });

    it("should prevent waiting players from acting", () => {
      const room = createRoom();
      const players = [
        createPlayer({ seat_number: 1, waiting_for_next_hand: true }),
        createPlayer({ seat_number: 2 }),
      ];
      const gameState: GameStateRow = {
        id: "game-1",
        room_id: room.id,
        hand_number: 1,
        deck_seed: "hidden",
        button_seat: 1,
        phase: "flop",
        pot_size: 0,
        current_bet: 0,
        min_raise: room.big_blind,
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
        created_at: "2020-01-01T00:00:00.000Z",
        updated_at: "2020-01-01T00:00:00.000Z",
      };

      const outcome = applyAction(
        { room, players, gameState, fullBoard1: [], fullBoard2: [] },
        1,
        "check",
      );

      expect(outcome.error).toBe("Player cannot act");
    });
  });

  describe("advancePhase", () => {
    it("should advance from flop to turn (PLO)", () => {
      expect(advancePhase("flop", "double_board_bomb_pot_plo")).toBe("turn");
    });

    it("should advance from turn to river (PLO)", () => {
      expect(advancePhase("turn", "double_board_bomb_pot_plo")).toBe("river");
    });

    it("should advance from river to showdown (PLO)", () => {
      expect(advancePhase("river", "double_board_bomb_pot_plo")).toBe(
        "showdown",
      );
    });

    it("should advance from showdown to complete (PLO)", () => {
      expect(advancePhase("showdown", "double_board_bomb_pot_plo")).toBe(
        "complete",
      );
    });

    it("should stay at complete (PLO)", () => {
      expect(advancePhase("complete", "double_board_bomb_pot_plo")).toBe(
        "complete",
      );
    });

    it("should advance from river to partition (321)", () => {
      expect(advancePhase("river", "game_mode_321")).toBe("partition");
    });

    it("should advance from partition to showdown (321)", () => {
      expect(advancePhase("partition", "game_mode_321")).toBe("showdown");
    });

    it("should handle invalid phase by returning complete", () => {
      // @ts-expect-error - testing invalid input
      expect(advancePhase("invalid")).toBe("complete");
    });
  });
});
