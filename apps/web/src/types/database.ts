// Re-export auto-generated types from database.types.ts
import type { Database, Tables, Enums } from "./database.types";

export type { Database, Tables, Enums };

// Type aliases for convenience
export type GameMode = Enums<"game_mode">;
export type ActionType = Enums<"action_type">;
export type GamePhase = Enums<"game_phase">;

export type Room = Tables<"rooms">;
export type RoomPlayer = Tables<"room_players">;
export type GameState = Tables<"game_states">;
export type PlayerHand = Tables<"player_hands">;
export type PlayerAction = Tables<"player_actions">;
export type HandResult = Tables<"hand_results">;

// Custom types for JSON fields and application logic

// Board state structure (extended for 321 mode and holdem_flip)
export interface BoardState {
  board1?: string[]; // e.g., ["Ah", "Kh", "7d", "4c", "2s"]
  board2?: string[]; // e.g., ["2s", "9c", "Qd", "Jh", "3d"]
  board3?: string[]; // 3rd board for 321 mode
  visible_player_cards?: Record<string, string[]>; // For Indian Poker: seat number -> cards
  player_partitions?: Record<
    string,
    {
      threeBoardCards: string[];
      twoBoardCards: string[];
      oneBoardCard: string[];
    }
  >; // For 321 mode: seat number -> partition assignment
  revealed_partitions?: Record<
    string,
    {
      three_board_cards: string[];
      two_board_cards: string[];
      one_board_card: string[];
    }
  >; // For 321 mode showdown: revealed partitions from all players
  // For holdem_flip mode:
  all_player_cards?: Record<number, string[]>; // seat_number -> [card1, card2]
  flipped_community_cards?: number[]; // indices 0-4 of which community cards are flipped
  flipped_player_cards?: Record<number, number[]>; // seat_number -> [0, 1] for flipped card indices
}

export interface SidePot {
  amount: number;
  eligible_seats: number[];
}

export interface ActionHistoryItem {
  seat_number: number;
  action_type: ActionType;
  amount?: number;
  timestamp: string;
}

export interface Winner {
  seat: number;
  amount: number;
  board: "A" | "B";
  hand_rank: number;
  hand_description: string;
}
