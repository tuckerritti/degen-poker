import type { RoomPlayer } from "../../src/types.js";

export function createPlayer(overrides: Partial<RoomPlayer> = {}): RoomPlayer {
  const seatNumber = overrides.seat_number ?? 1;
  return {
    id: `player-${seatNumber}`,
    room_id: "test-room-1",
    seat_number: seatNumber,
    auth_user_id: null,
    display_name: `Player ${seatNumber}`,
    chip_stack: 500,
    total_buy_in: 500,
    total_invested_this_hand: 0,
    current_bet: 0,
    has_folded: false,
    is_all_in: false,
    is_sitting_out: false,
    is_spectating: false,
    waiting_for_next_hand: false,
    connected_at: null,
    last_action_at: null,
    ...overrides,
  };
}

export const threePlayers: RoomPlayer[] = [
  createPlayer({ seat_number: 1, display_name: "Alice" }),
  createPlayer({ seat_number: 3, display_name: "Bob" }),
  createPlayer({ seat_number: 5, display_name: "Charlie" }),
];

export const sixPlayers: RoomPlayer[] = [
  createPlayer({ seat_number: 1, display_name: "Alice" }),
  createPlayer({ seat_number: 2, display_name: "Bob" }),
  createPlayer({ seat_number: 3, display_name: "Charlie" }),
  createPlayer({ seat_number: 4, display_name: "David" }),
  createPlayer({ seat_number: 5, display_name: "Eve" }),
  createPlayer({ seat_number: 6, display_name: "Frank" }),
];

export const sevenPlayers: RoomPlayer[] = [
  createPlayer({ seat_number: 1, display_name: "Alice" }),
  createPlayer({ seat_number: 2, display_name: "Bob" }),
  createPlayer({ seat_number: 3, display_name: "Charlie" }),
  createPlayer({ seat_number: 4, display_name: "David" }),
  createPlayer({ seat_number: 5, display_name: "Eve" }),
  createPlayer({ seat_number: 6, display_name: "Frank" }),
  createPlayer({ seat_number: 7, display_name: "Grace" }),
];

export const ninePlayers: RoomPlayer[] = [
  ...sevenPlayers,
  createPlayer({ seat_number: 8, display_name: "Hank" }),
  createPlayer({ seat_number: 9, display_name: "Ivy" }),
];
