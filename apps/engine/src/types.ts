import { ActionType, GameMode, GamePhase } from "@poker/shared";

export interface Room {
  id: string;
  game_mode: GameMode;
  max_players: number;
  min_buy_in: number;
  max_buy_in: number;
  small_blind: number;
  big_blind: number;
  button_seat: number | null;
  current_hand_number: number;
  inter_hand_delay: number;
  is_paused: boolean;
  pause_after_hand: boolean;
  is_active: boolean;
  last_activity_at: string | null;
  owner_auth_user_id: string | null;
  uses_two_decks: boolean;  // For 321 mode with many players
}

export interface RoomPlayer {
  id: string;
  room_id: string;
  seat_number: number;
  auth_user_id: string | null;
  display_name: string;
  chip_stack: number;
  total_buy_in: number;
  total_invested_this_hand: number;
  current_bet: number;
  has_folded: boolean;
  is_all_in: boolean;
  is_sitting_out: boolean;
  is_spectating: boolean;
  connected_at: string | null;
  last_action_at: string | null;
}

export interface SidePot {
  amount: number;
  eligibleSeats: number[];
}

export interface GameStateRow {
  id: string;
  room_id: string;
  hand_number: number;
  deck_seed: string;
  button_seat: number;
  phase: GamePhase;
  pot_size: number;
  current_bet: number | null;
  min_raise: number | null;
  current_actor_seat: number | null;
  last_aggressor_seat: number | null;
  last_raise_amount: number | null;
  action_deadline_at: string | null;
  action_reopened_to: number[] | null;
  seats_to_act: number[] | null;
  seats_acted: number[] | null;
  burned_card_indices: number[] | null;
  board_state: {
    board1?: string[];
    board2?: string[];
  } | null;
  side_pots: SidePot[] | null;
  action_history: unknown;
  created_at: string;
  updated_at: string;
}

export interface GameStateSecret {
  id: string;
  game_state_id: string;
  deck_seed: string;
  full_board1: string[];
  full_board2: string[];
  full_board3: string[] | null;  // For 321 mode
  created_at: string;
}

export interface PlayerHandRow {
  id: string;
  room_id: string;
  game_state_id: string;
  seat_number: number;
  cards: string[];
  auth_user_id: string | null;
  created_at: string;
}

export interface PlayerActionRow {
  id: string;
  room_id: string;
  game_state_id: string | null;
  seat_number: number;
  action_type: ActionType;
  amount: number | null;
  processed: boolean | null;
  processed_at: string | null;
  error_message: string | null;
  auth_user_id: string | null;
  created_at: string;
}

export interface HandResultRow {
  id: string;
  room_id: string;
  hand_number: number;
  final_pot: number;
  board_a: string[] | null;
  board_b: string[] | null;
  winners: unknown;
  shown_hands: unknown;
  action_history: unknown;
  created_at: string;
}
