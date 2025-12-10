import type { GameStateRow } from '../../src/types.js';

export function createGameState(overrides: Partial<GameStateRow> = {}): GameStateRow {
  return {
    id: 'game-state-1',
    room_id: 'test-room-1',
    hand_number: 1,
    deck_seed: 'hidden',
    button_seat: 1,
    phase: 'flop',
    pot_size: 15,
    current_bet: 0,
    min_raise: 2,
    current_actor_seat: 3,
    last_aggressor_seat: null,
    last_raise_amount: null,
    action_deadline_at: null,
    action_reopened_to: null,
    seats_to_act: [3, 5],
    seats_acted: [1],
    burned_card_indices: [],
    board_state: {
      board1: ['Ah', 'Kh', 'Qh'],
      board2: ['2c', '3c', '4c']
    },
    side_pots: [],
    action_history: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides
  };
}
