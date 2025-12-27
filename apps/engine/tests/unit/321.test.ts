import { describe, it, expect } from "vitest";
import {
  dealHand,
  applyAction,
  determine321Winners,
  endOfHandPayout321,
  type ActionContext,
} from "../../src/logic.js";
import { createPlayer } from "../fixtures/players.js";
import { standardRoom } from "../fixtures/rooms.js";
import type { Room, RoomPlayer, GameStateRow } from "../../src/types.js";

const room321: Room = {
  ...standardRoom,
  id: "room-321",
  game_mode: "game_mode_321",
  small_blind: 0,
  big_blind: 5,
};

describe("321 game mode", () => {
  describe("dealHand", () => {
    it("should deal 6 hole cards and 3 full boards", () => {
      const players: RoomPlayer[] = [
        createPlayer({ seat_number: 1 }),
        createPlayer({ seat_number: 2 }),
        createPlayer({ seat_number: 3 }),
      ];

      const result = dealHand(room321, players);

      expect(result.playerHands).toHaveLength(3);
      result.playerHands.forEach((hand) => {
        expect(hand.cards).toHaveLength(6);
      });

      expect(result.fullBoard1).toHaveLength(5);
      expect(result.fullBoard2).toHaveLength(5);
      expect(result.fullBoard3).toHaveLength(5);
    });

    it("should reveal 3 cards on each board at the start", () => {
      const players: RoomPlayer[] = [
        createPlayer({ seat_number: 1 }),
        createPlayer({ seat_number: 2 }),
      ];

      const result = dealHand(room321, players);
      const boardState = result.gameState.board_state as unknown as {
        board1?: string[];
        board2?: string[];
        board3?: string[];
      };

      expect(boardState.board1).toHaveLength(3);
      expect(boardState.board2).toHaveLength(3);
      expect(boardState.board3).toHaveLength(3);
    });

    it("should start on flop and collect antes", () => {
      const players: RoomPlayer[] = [
        createPlayer({ seat_number: 1, chip_stack: 500 }),
        createPlayer({ seat_number: 2, chip_stack: 500 }),
        createPlayer({ seat_number: 3, chip_stack: 500 }),
      ];

      const result = dealHand(room321, players);

      expect(result.gameState.phase).toBe("flop");
      expect(result.gameState.pot_size).toBe(15);
      result.updatedPlayers.forEach((player) => {
        expect(player.total_invested_this_hand).toBe(5);
        expect(player.current_bet).toBe(5);
      });
    });

    it("should use a single deck for 6 players and two decks for 7 players", () => {
      const sixPlayers: RoomPlayer[] = [
        createPlayer({ seat_number: 1 }),
        createPlayer({ seat_number: 2 }),
        createPlayer({ seat_number: 3 }),
        createPlayer({ seat_number: 4 }),
        createPlayer({ seat_number: 5 }),
        createPlayer({ seat_number: 6 }),
      ];
      const sevenPlayers: RoomPlayer[] = [
        createPlayer({ seat_number: 1 }),
        createPlayer({ seat_number: 2 }),
        createPlayer({ seat_number: 3 }),
        createPlayer({ seat_number: 4 }),
        createPlayer({ seat_number: 5 }),
        createPlayer({ seat_number: 6 }),
        createPlayer({ seat_number: 7 }),
      ];

      const sixResult = dealHand(room321, sixPlayers);
      const sevenResult = dealHand(room321, sevenPlayers);

      expect(sixResult.usesTwoDecks).toBe(false);
      expect(sevenResult.usesTwoDecks).toBe(true);
    });
  });

  describe("street transitions", () => {
    const fullBoard1 = ["Ah", "Kh", "Qh", "Jh", "Th"];
    const fullBoard2 = ["2c", "3c", "4c", "5c", "6c"];
    const fullBoard3 = ["7d", "8d", "9d", "Td", "Jd"];

    it("should advance from flop to turn and reveal 4 cards on all boards", () => {
      const players: RoomPlayer[] = [
        createPlayer({ seat_number: 1, chip_stack: 1000, current_bet: 0 }),
        createPlayer({ seat_number: 2, chip_stack: 1000, current_bet: 0 }),
      ];

      const gameState: GameStateRow = {
        id: "gs-321-flop",
        room_id: room321.id,
        hand_number: 1,
        deck_seed: "hidden",
        button_seat: 1,
        phase: "flop",
        pot_size: 10,
        current_bet: 0,
        min_raise: 5,
        current_actor_seat: 2,
        last_aggressor_seat: null,
        last_raise_amount: null,
        action_deadline_at: null,
        action_reopened_to: null,
        seats_to_act: [2],
        seats_acted: [1],
        burned_card_indices: [],
        board_state: {
          board1: fullBoard1.slice(0, 3),
          board2: fullBoard2.slice(0, 3),
          board3: fullBoard3.slice(0, 3),
        },
        side_pots: [],
        action_history: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const ctx: ActionContext = {
        room: room321,
        players,
        gameState,
        fullBoard1,
        fullBoard2,
        fullBoard3,
      };

      const result = applyAction(ctx, 2, "check");

      expect(result.handCompleted).toBe(false);
      expect(result.updatedGameState.phase).toBe("turn");

      const boardState = result.updatedGameState.board_state as unknown as {
        board1?: string[];
        board2?: string[];
        board3?: string[];
      };

      expect(boardState.board1).toEqual(fullBoard1.slice(0, 4));
      expect(boardState.board2).toEqual(fullBoard2.slice(0, 4));
      expect(boardState.board3).toEqual(fullBoard3.slice(0, 4));
    });

    it("should advance from turn to river and reveal 5 cards on all boards", () => {
      const players: RoomPlayer[] = [
        createPlayer({ seat_number: 1, chip_stack: 1000, current_bet: 0 }),
        createPlayer({ seat_number: 2, chip_stack: 1000, current_bet: 0 }),
      ];

      const gameState: GameStateRow = {
        id: "gs-321-turn",
        room_id: room321.id,
        hand_number: 1,
        deck_seed: "hidden",
        button_seat: 1,
        phase: "turn",
        pot_size: 10,
        current_bet: 0,
        min_raise: 5,
        current_actor_seat: 2,
        last_aggressor_seat: null,
        last_raise_amount: null,
        action_deadline_at: null,
        action_reopened_to: null,
        seats_to_act: [2],
        seats_acted: [1],
        burned_card_indices: [],
        board_state: {
          board1: fullBoard1.slice(0, 4),
          board2: fullBoard2.slice(0, 4),
          board3: fullBoard3.slice(0, 4),
        },
        side_pots: [],
        action_history: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const ctx: ActionContext = {
        room: room321,
        players,
        gameState,
        fullBoard1,
        fullBoard2,
        fullBoard3,
      };

      const result = applyAction(ctx, 2, "check");

      expect(result.handCompleted).toBe(false);
      expect(result.updatedGameState.phase).toBe("river");

      const boardState = result.updatedGameState.board_state as unknown as {
        board1?: string[];
        board2?: string[];
        board3?: string[];
      };

      expect(boardState.board1).toEqual(fullBoard1);
      expect(boardState.board2).toEqual(fullBoard2);
      expect(boardState.board3).toEqual(fullBoard3);
    });

    it("should advance from river to partition once betting is complete", () => {
      const players: RoomPlayer[] = [
        createPlayer({ seat_number: 1, chip_stack: 1000, current_bet: 0 }),
        createPlayer({ seat_number: 2, chip_stack: 1000, current_bet: 0 }),
      ];

      const gameState: GameStateRow = {
        id: "gs-321-river",
        room_id: room321.id,
        hand_number: 1,
        deck_seed: "hidden",
        button_seat: 1,
        phase: "river",
        pot_size: 10,
        current_bet: 0,
        min_raise: 5,
        current_actor_seat: 2,
        last_aggressor_seat: null,
        last_raise_amount: null,
        action_deadline_at: null,
        action_reopened_to: null,
        seats_to_act: [2],
        seats_acted: [1],
        burned_card_indices: [],
        board_state: {
          board1: fullBoard1,
          board2: fullBoard2,
          board3: fullBoard3,
        },
        side_pots: [],
        action_history: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const ctx: ActionContext = {
        room: room321,
        players,
        gameState,
        fullBoard1,
        fullBoard2,
        fullBoard3,
      };

      const result = applyAction(ctx, 2, "check");

      expect(result.handCompleted).toBe(false);
      expect(result.updatedGameState.phase).toBe("partition");
      expect(result.updatedGameState.current_actor_seat).toBeNull();
      expect(result.updatedGameState.seats_to_act).toEqual([]);

      const boardState = result.updatedGameState.board_state as unknown as {
        board1?: string[];
        board2?: string[];
        board3?: string[];
      };

      // SECURITY: At partition phase, all 5 cards are revealed in board1/2/3
      // fullBoard1/2/3 should NOT be present (security fix to prevent card leaks)
      expect(boardState.board1).toEqual(fullBoard1);
      expect(boardState.board2).toEqual(fullBoard2);
      expect(boardState.board3).toEqual(fullBoard3);
      expect((boardState as any).fullBoard1).toBeUndefined();
      expect((boardState as any).fullBoard2).toBeUndefined();
      expect((boardState as any).fullBoard3).toBeUndefined();
    });

    it("should fast-forward to partition when only one non-all-in player remains", () => {
      const players: RoomPlayer[] = [
        createPlayer({
          seat_number: 1,
          chip_stack: 0,
          current_bet: 0,
          is_all_in: true,
        }),
        createPlayer({ seat_number: 2, chip_stack: 1000, current_bet: 0 }),
      ];

      const gameState: GameStateRow = {
        id: "gs-321-allin",
        room_id: room321.id,
        hand_number: 1,
        deck_seed: "hidden",
        button_seat: 1,
        phase: "turn",
        pot_size: 10,
        current_bet: 0,
        min_raise: 5,
        current_actor_seat: 2,
        last_aggressor_seat: null,
        last_raise_amount: null,
        action_deadline_at: null,
        action_reopened_to: null,
        seats_to_act: [2],
        seats_acted: [1],
        burned_card_indices: [],
        board_state: {
          board1: fullBoard1.slice(0, 4),
          board2: fullBoard2.slice(0, 4),
          board3: fullBoard3.slice(0, 4),
        },
        side_pots: [],
        action_history: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const ctx: ActionContext = {
        room: room321,
        players,
        gameState,
        fullBoard1,
        fullBoard2,
        fullBoard3,
      };

      const result = applyAction(ctx, 2, "check");

      expect(result.handCompleted).toBe(false);
      expect(result.updatedGameState.phase).toBe("partition");

      const boardState = result.updatedGameState.board_state as unknown as {
        board1?: string[];
        board2?: string[];
        board3?: string[];
      };

      expect(boardState.board1).toEqual(fullBoard1);
      expect(boardState.board2).toEqual(fullBoard2);
      expect(boardState.board3).toEqual(fullBoard3);
    });
  });

  describe("determine321Winners", () => {
    it("should require the single hole card on the 1-card board", () => {
      const board1 = ["2c", "3d", "4h", "5s", "7c"];
      const board2 = ["Ah", "Ad", "9s", "8d", "7c"];
      const board3 = ["Ah", "Kh", "Qh", "Jh", "9h"];

      const partitions = [
        {
          seatNumber: 1,
          threeBoardCards: ["2d", "3h", "4s"],
          twoBoardCards: ["7h", "7d"],
          oneBoardCard: ["2h"],
        },
        {
          seatNumber: 2,
          threeBoardCards: ["2s", "3c", "4d"],
          twoBoardCards: ["Kc", "Qd"],
          oneBoardCard: ["2s"],
        },
      ];

      const winners = determine321Winners(partitions, board1, board2, board3);

      expect(winners.board3Winners).toEqual([1]);
    });

    it("should evaluate the 2-card board using both hole cards", () => {
      const board1 = ["2c", "3d", "4h", "5s", "7c"];
      const board2 = ["Ah", "Ad", "9s", "8d", "7c"];
      const board3 = ["2s", "4s", "6s", "8s", "Ts"];

      const partitions = [
        {
          seatNumber: 1,
          threeBoardCards: ["2d", "3h", "4s"],
          twoBoardCards: ["7h", "7d"],
          oneBoardCard: ["2h"],
        },
        {
          seatNumber: 2,
          threeBoardCards: ["2s", "3c", "4d"],
          twoBoardCards: ["Kc", "Qd"],
          oneBoardCard: ["2c"],
        },
      ];

      const winners = determine321Winners(partitions, board1, board2, board3);

      expect(winners.board2Winners).toEqual([1]);
    });

    it("should return empty winners when there are no partitions", () => {
      const board1 = ["2c", "3d", "4h", "5s", "7c"];
      const board2 = ["Ah", "Ad", "9s", "8d", "7c"];
      const board3 = ["2s", "4s", "6s", "8s", "Ts"];

      const winners = determine321Winners([], board1, board2, board3);

      expect(winners.board1Winners).toEqual([]);
      expect(winners.board2Winners).toEqual([]);
      expect(winners.board3Winners).toEqual([]);
    });
  });

  describe("endOfHandPayout321", () => {
    it("should split each pot into thirds and respect board ties", () => {
      const sidePots = [{ amount: 300, eligibleSeats: [1, 2, 3] }];
      const board1 = ["Ah", "Kh", "Qh", "Jh", "2c"];
      const board2 = ["2c", "3c", "4c", "5c", "9d"];
      const board3 = ["As", "Ks", "Qs", "Js", "9d"];

      const partitions = [
        {
          seatNumber: 1,
          threeBoardCards: ["Th", "9h", "8h"],
          twoBoardCards: ["2d", "3d"],
          oneBoardCard: ["2c"],
        },
        {
          seatNumber: 2,
          threeBoardCards: ["9d", "8d", "7d"],
          twoBoardCards: ["6c", "7c"],
          oneBoardCard: ["8d"],
        },
        {
          seatNumber: 3,
          threeBoardCards: ["9s", "8s", "7s"],
          twoBoardCards: ["6c", "7c"],
          oneBoardCard: ["Ts"],
        },
      ];

      const payouts = endOfHandPayout321(
        sidePots,
        partitions,
        board1,
        board2,
        board3,
      );

      expect(payouts).toContainEqual({ seat: 1, amount: 100 });
      expect(payouts).toContainEqual({ seat: 2, amount: 50 });
      expect(payouts).toContainEqual({ seat: 3, amount: 150 });
      expect(payouts.reduce((sum, p) => sum + p.amount, 0)).toBe(300);
    });

    it("should give the remainder to board3 winners and split it evenly", () => {
      const sidePots = [{ amount: 101, eligibleSeats: [1, 2] }];
      const board1 = ["Ah", "Kh", "Qh", "Jh", "2c"];
      const board2 = ["2c", "3c", "4c", "5c", "9d"];
      const board3 = ["As", "Ks", "Qs", "Js", "9d"];

      const partitions = [
        {
          seatNumber: 1,
          threeBoardCards: ["Th", "9h", "8h"],
          twoBoardCards: ["2d", "3d"],
          oneBoardCard: ["Ts"],
        },
        {
          seatNumber: 2,
          threeBoardCards: ["9d", "8d", "7d"],
          twoBoardCards: ["6c", "7c"],
          oneBoardCard: ["Ts"],
        },
      ];

      const payouts = endOfHandPayout321(
        sidePots,
        partitions,
        board1,
        board2,
        board3,
      );

      const seat1 = payouts.find((p) => p.seat === 1)?.amount ?? 0;
      const seat2 = payouts.find((p) => p.seat === 2)?.amount ?? 0;

      expect(seat1).toBe(51);
      expect(seat2).toBe(50);
      expect(seat1 + seat2).toBe(101);
    });

    it("should calculate winners within side pot eligibility", () => {
      const sidePots = [{ amount: 90, eligibleSeats: [1, 2] }];
      const board1 = ["9h", "Th", "Jh", "2c", "3d"];
      const board2 = ["2c", "3c", "4c", "5c", "9d"];
      const board3 = ["As", "Ks", "Qs", "Js", "9d"];

      const partitions = [
        {
          seatNumber: 1,
          threeBoardCards: ["9d", "8d", "7d"],
          twoBoardCards: ["2d", "3d"],
          oneBoardCard: ["Ts"],
        },
        {
          seatNumber: 2,
          threeBoardCards: ["8h", "7h", "6h"],
          twoBoardCards: ["6c", "7c"],
          oneBoardCard: ["8d"],
        },
        {
          seatNumber: 3,
          threeBoardCards: ["Qh", "Kh", "Ah"],
          twoBoardCards: ["2h", "3h"],
          oneBoardCard: ["2c"],
        },
      ];

      const payouts = endOfHandPayout321(
        sidePots,
        partitions,
        board1,
        board2,
        board3,
      );

      expect(payouts).toContainEqual({ seat: 1, amount: 30 });
      expect(payouts).toContainEqual({ seat: 2, amount: 60 });
      expect(payouts.reduce((sum, p) => sum + p.amount, 0)).toBe(90);
    });
  });
});
