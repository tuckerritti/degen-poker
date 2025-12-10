import type { Room } from '../../src/types.js';

export const standardRoom: Room = {
  id: 'test-room-1',
  game_mode: 'double_board_bomb_pot_plo',
  max_players: 9,
  min_buy_in: 100,
  max_buy_in: 1000,
  small_blind: 1,
  big_blind: 2,
  bomb_pot_ante: 5,
  button_seat: null,
  current_hand_number: 0,
  inter_hand_delay: 3000,
  is_paused: false,
  pause_after_hand: false,
  is_active: true,
  last_activity_at: null,
  owner_auth_user_id: null
};

export const noAnteRoom: Room = {
  ...standardRoom,
  id: 'no-ante-room',
  bomb_pot_ante: 0
};
