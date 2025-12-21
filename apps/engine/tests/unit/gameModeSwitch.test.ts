import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GameStateRow, Room, RoomPlayer } from "../../src/types.js";

// Prevent the Express app from listening during tests
process.env.NODE_ENV = "test";

type MockState = {
  currentUserId: string;
  authError: Error | null;
  room: Room | null;
  roomSelectError: Error | null;
  roomUpdateError: Error | null;
  players: RoomPlayer[];
  latestGameState: GameStateRow | null;
  roomsUpdateCalls: Partial<Room>[];
  createdGameStates: GameStateRow[];
  createdSecrets: unknown[];
  createdPlayerHands: unknown[];
};

const mockState: MockState = {
  currentUserId: "user-1",
  authError: null,
  room: null,
  roomSelectError: null,
  roomUpdateError: null,
  players: [],
  latestGameState: null,
  roomsUpdateCalls: [],
  createdGameStates: [],
  createdSecrets: [],
  createdPlayerHands: [],
};

vi.mock("../../src/env.js", () => ({
  env: {
    SUPABASE_URL: "http://localhost:54321",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    ENGINE_PORT: "3001",
    NODE_ENV: "test",
    ENGINE_CORS_ORIGIN: "*",
  },
  port: 3001,
  isProduction: false,
  corsOrigin: "*",
}));

vi.mock("../../src/logic.js", () => ({
  dealHand: vi.fn((room: Room) => {
    const now = new Date().toISOString();
    return {
      gameState: {
        id: "gs-mock",
        room_id: room.id,
        hand_number: (room.current_hand_number ?? 0) + 1,
        deck_seed: "hidden",
        button_seat: 1,
        phase: "flop",
        pot_size: 0,
        current_bet: 0,
        min_raise: 0,
        current_actor_seat: null,
        last_aggressor_seat: null,
        last_raise_amount: null,
        action_deadline_at: null,
        action_reopened_to: null,
        seats_to_act: [],
        seats_acted: [],
        burned_card_indices: [],
        board_state: { board1: [], board2: [] },
        side_pots: [],
        action_history: [],
        created_at: now,
        updated_at: now,
      },
      playerHands: [],
      updatedPlayers: [],
      fullBoard1: [],
      fullBoard2: [],
      deckSeed: "seed-123",
    };
  }),
  applyAction: vi.fn(),
  endOfHandPayout: vi.fn(),
  determineDoubleBoardWinners: vi.fn(),
  determineSingleBoardWinners: vi.fn(),
  calculateSidePots: vi.fn(),
}));

vi.mock("../../src/supabase.js", () => {
  const buildRooms = () => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        single: vi.fn(async () => ({
          data: mockState.room,
          error: mockState.roomSelectError,
        })),
        maybeSingle: vi.fn(async () => ({
          data: mockState.room,
          error: mockState.roomSelectError,
        })),
      })),
    })),
    update: vi.fn((values: Partial<Room>) => {
      mockState.roomsUpdateCalls.push(values);
      const merged = mockState.room
        ? ({ ...mockState.room, ...values } as Room)
        : null;
      return {
        eq: vi.fn(() => ({
          error: mockState.roomUpdateError,
          data: mockState.roomUpdateError ? null : merged,
          select: vi.fn(() => ({
            single: vi.fn(async () => ({
              data: mockState.roomUpdateError ? null : merged,
              error: mockState.roomUpdateError,
            })),
          })),
        })),
      };
    }),
  });

  const buildRoomPlayers = () => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        order: vi.fn(async () => ({ data: mockState.players, error: null })),
      })),
    })),
    upsert: vi.fn(async (payload: RoomPlayer[]) => ({
      data: payload,
      error: null,
    })),
  });

  const buildGameStates = () => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        order: vi.fn(() => ({
          limit: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({
              data: mockState.latestGameState,
              error: null,
            })),
          })),
        })),
      })),
    })),
    insert: vi.fn((payload: GameStateRow) => {
      const withId: GameStateRow = {
        ...payload,
        id: payload.id ?? "gs-inserted",
      };
      mockState.createdGameStates.push(withId);
      return {
        select: vi.fn(() => ({
          single: vi.fn(async () => ({ data: withId, error: null })),
        })),
      };
    }),
    delete: vi.fn(() => ({
      eq: vi.fn(async () => ({ error: null })),
    })),
  });

  const buildGameStateSecrets = () => ({
    insert: vi.fn(async (payload: unknown) => {
      mockState.createdSecrets.push(payload);
      return { data: payload, error: null };
    }),
  });

  const buildPlayerHands = () => ({
    insert: vi.fn(async (payload: unknown) => {
      mockState.createdPlayerHands.push(payload);
      return { data: payload, error: null };
    }),
  });

  const buildHandResults = () => ({
    insert: vi.fn(async (payload) => ({ data: payload, error: null })),
  });

  const tables: Record<string, () => unknown> = {
    rooms: buildRooms,
    room_players: buildRoomPlayers,
    game_states: buildGameStates,
    game_state_secrets: buildGameStateSecrets,
    player_hands: buildPlayerHands,
    hand_results: buildHandResults,
  };

  return {
    supabase: {
      auth: {
        getUser: vi.fn(async () => {
          if (mockState.authError) {
            return { data: null, error: mockState.authError };
          }
          return {
            data: { user: { id: mockState.currentUserId } },
            error: null,
          };
        }),
      },
      from: vi.fn((table: string) => {
        const builder = tables[table];
        if (!builder) throw new Error(`Unhandled table ${table}`);
        return builder();
      }),
    },
  };
});

// Import after mocks are defined
import { app } from "../../src/index.js";

const baseRoom: Room = {
  id: "room-1",
  game_mode: "double_board_bomb_pot_plo",
  next_game_mode: null,
  max_players: 9,
  min_buy_in: 100,
  max_buy_in: 1000,
  small_blind: 0,
  big_blind: 5,
  button_seat: null,
  current_hand_number: 0,
  inter_hand_delay: 3000,
  is_paused: false,
  pause_after_hand: false,
  is_active: true,
  last_activity_at: null,
  owner_auth_user_id: "user-1",
};

const basePlayers: RoomPlayer[] = [
  {
    id: "p1",
    room_id: "room-1",
    seat_number: 1,
    auth_user_id: "user-1",
    display_name: "Alice",
    chip_stack: 500,
    total_buy_in: 500,
    total_invested_this_hand: 0,
    current_bet: 0,
    has_folded: false,
    is_all_in: false,
    is_sitting_out: false,
    is_spectating: false,
    connected_at: null,
    last_action_at: null,
  },
  {
    id: "p2",
    room_id: "room-1",
    seat_number: 2,
    auth_user_id: "user-2",
    display_name: "Bob",
    chip_stack: 500,
    total_buy_in: 500,
    total_invested_this_hand: 0,
    current_bet: 0,
    has_folded: false,
    is_all_in: false,
    is_sitting_out: false,
    is_spectating: false,
    connected_at: null,
    last_action_at: null,
  },
];

beforeEach(() => {
  mockState.currentUserId = "user-1";
  mockState.authError = null;
  mockState.room = { ...baseRoom };
  mockState.roomSelectError = null;
  mockState.roomUpdateError = null;
  mockState.players = basePlayers.map((p) => ({ ...p }));
  mockState.latestGameState = null;
  mockState.roomsUpdateCalls = [];
  mockState.createdGameStates = [];
  mockState.createdSecrets = [];
  mockState.createdPlayerHands = [];
});

describe("Game mode switching", () => {
  it("schedules a new game mode for the next hand when requested by the owner", async () => {
    const response = await request(app)
      .patch("/rooms/room-1/game-mode")
      .set("Authorization", "Bearer token")
      .send({ nextGameMode: "texas_holdem" });

    expect(response.status).toBe(200);
    expect(response.body.nextGameMode).toBe("texas_holdem");
    expect(
      mockState.roomsUpdateCalls.some(
        (call) => call.next_game_mode === "texas_holdem",
      ),
    ).toBe(true);
  });

  it("clears pending switch when the requested mode matches the current mode", async () => {
    mockState.room = { ...baseRoom, next_game_mode: "texas_holdem" };

    const response = await request(app)
      .patch("/rooms/room-1/game-mode")
      .set("Authorization", "Bearer token")
      .send({ nextGameMode: "double_board_bomb_pot_plo" });

    expect(response.status).toBe(200);
    expect(response.body.nextGameMode).toBeNull();
    expect(
      mockState.roomsUpdateCalls.some((call) => call.next_game_mode === null),
    ).toBe(true);
  });

  it("rejects non-owners attempting to schedule a mode switch", async () => {
    mockState.room = { ...baseRoom, owner_auth_user_id: "owner-123" };
    mockState.currentUserId = "user-9";

    const response = await request(app)
      .patch("/rooms/room-1/game-mode")
      .set("Authorization", "Bearer token")
      .send({ nextGameMode: "texas_holdem" });

    expect(response.status).toBe(403);
    expect(mockState.roomsUpdateCalls.length).toBe(0);
  });

  it("applies a pending game mode switch at the start of the next hand", async () => {
    mockState.room = {
      ...baseRoom,
      game_mode: "double_board_bomb_pot_plo",
      next_game_mode: "texas_holdem",
    };

    const response = await request(app)
      .post("/rooms/room-1/start-hand")
      .set("Authorization", "Bearer token")
      .send({});

    // Starting a hand should succeed and apply the mode switch
    expect(response.status).toBeGreaterThanOrEqual(200);
    expect(response.status).toBeLessThan(300);
    expect(
      mockState.roomsUpdateCalls.some(
        (call) =>
          call.game_mode === "texas_holdem" && call.next_game_mode === null,
      ),
    ).toBe(true);
  });
});
