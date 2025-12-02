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

// Board state structure for double board PLO
export interface BoardState {
  board1?: string[]; // e.g., ["Ah", "Kh", "7d", "4c", "2s"]
  board2?: string[]; // e.g., ["2s", "9c", "Qd", "Jh", "3d"]
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
