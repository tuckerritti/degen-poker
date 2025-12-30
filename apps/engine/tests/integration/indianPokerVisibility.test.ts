import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

process.env.NODE_ENV = "test";

const supabaseMock = {
  auth: {
    getUser: vi.fn(),
  },
  from: vi.fn(),
  rpc: vi.fn(),
};

vi.mock("../../src/supabase.js", () => ({
  supabase: supabaseMock,
}));

const { app } = await import("../../src/index.js");

type QueryResult<T> = { data: T | null; error: null | Error };

const makeQuery = <T>(result: QueryResult<T>) => ({
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn().mockResolvedValue(result),
});

const setSupabaseResponses = (
  responses: Record<string, QueryResult<unknown>>,
) => {
  supabaseMock.from.mockImplementation((table: string) => {
    const result = responses[table];
    if (!result) {
      throw new Error(`No mock response for table: ${table}`);
    }
    return makeQuery(result);
  });
};

describe("GET /rooms/:roomId/game-states/:gameStateId/indian-poker-cards", () => {
  const basePath = "/rooms/room-1/game-states/state-1/indian-poker-cards";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    const response = await request(app).get(basePath);
    expect(response.status).toBe(401);
  });

  it("rejects spectators", async () => {
    supabaseMock.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });

    setSupabaseResponses({
      rooms: { data: { id: "room-1", game_mode: "indian_poker" }, error: null },
      room_players: {
        data: { seat_number: 1, is_spectating: true },
        error: null,
      },
    });

    const response = await request(app)
      .get(basePath)
      .set("Authorization", "Bearer token");

    expect(response.status).toBe(403);
  });

  it("rejects seat mismatch", async () => {
    supabaseMock.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });

    setSupabaseResponses({
      rooms: { data: { id: "room-1", game_mode: "indian_poker" }, error: null },
      room_players: {
        data: { seat_number: 1, is_spectating: false },
        error: null,
      },
    });

    const response = await request(app)
      .get(`${basePath}?seat=2`)
      .set("Authorization", "Bearer token");

    expect(response.status).toBe(403);
  });

  it("rejects players not in the hand", async () => {
    supabaseMock.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });

    setSupabaseResponses({
      rooms: { data: { id: "room-1", game_mode: "indian_poker" }, error: null },
      room_players: {
        data: { seat_number: 1, is_spectating: false },
        error: null,
      },
      game_states: {
        data: { id: "state-1", room_id: "room-1" },
        error: null,
      },
      player_hands: {
        data: null,
        error: null,
      },
    });

    const response = await request(app)
      .get(basePath)
      .set("Authorization", "Bearer token");

    expect(response.status).toBe(403);
  });

  it("returns visible cards for seated players", async () => {
    supabaseMock.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });

    setSupabaseResponses({
      rooms: { data: { id: "room-1", game_mode: "indian_poker" }, error: null },
      room_players: {
        data: { seat_number: 1, is_spectating: false },
        error: null,
      },
      game_states: {
        data: { id: "state-1", room_id: "room-1" },
        error: null,
      },
      player_hands: {
        data: { id: "hand-1" },
        error: null,
      },
    });

    supabaseMock.rpc.mockResolvedValue({
      data: [
        { seat_number: 0, visible_card: "AS" },
        { seat_number: 2, visible_card: "KH" },
      ],
      error: null,
    });

    const response = await request(app)
      .get(basePath)
      .set("Authorization", "Bearer token");

    expect(response.status).toBe(200);
    expect(response.body.visibleCards).toEqual({
      "0": ["AS"],
      "2": ["KH"],
    });
  });
});
