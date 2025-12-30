import type { Room } from "../../src/types.js";

export const standardRoom: Room = {
  id: "test-room-1",
  game_mode: "double_board_bomb_pot_plo",
  max_players: 9,
  min_buy_in: 100,
  max_buy_in: 1000,
  small_blind: 0,
  big_blind: 5, // BB doubles as ante for PLO
  button_seat: null,
  current_hand_number: 0,
  inter_hand_delay: 3000,
  is_paused: false,
  pause_after_hand: false,
  is_active: true,
  last_activity_at: null,
  owner_auth_user_id: null,
  uses_two_decks: false,
};

export const room321Mode: Room = {
  ...standardRoom,
  id: "test-room-321",
  game_mode: "game_mode_321",
  uses_two_decks: false, // Will be updated during hand
};

export const roomHoldem: Room = {
  ...standardRoom,
  id: "test-room-holdem",
  game_mode: "texas_holdem",
  uses_two_decks: false,
};

export const roomIndianPoker: Room = {
  ...standardRoom,
  id: "test-room-indian",
  game_mode: "indian_poker",
  uses_two_decks: false,
};
