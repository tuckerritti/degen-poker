import express, { type Request, type Response } from "express";
import cors from "cors";
import { z } from "zod";
import { port, corsOrigin } from "./env.js";
import { logger } from "./logger.js";
import { supabase } from "./supabase.js";
import { dealHand, applyAction, endOfHandPayout, determineDoubleBoardWinners } from "./logic.js";
import type { GameStateRow, Room, RoomPlayer } from "./types.js";
import { ActionType } from "@poker/shared";
import { fetchGameStateSecret } from "./secrets.js";

const app = express();
app.use(
  cors({
    origin: corsOrigin === "*" ? true : corsOrigin,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);
app.use(express.json());

const createRoomSchema = z.object({
  smallBlind: z.number().int().positive(),
  bigBlind: z.number().int().positive(),
  minBuyIn: z.number().int().positive(),
  maxBuyIn: z.number().int().positive(),
  maxPlayers: z.number().int().min(2).max(10).optional(),
  bombPotAnte: z.number().int().min(0).optional(),
  interHandDelay: z.number().int().min(0).optional(),
  pauseAfterHand: z.boolean().optional(),
  ownerAuthUserId: z.string().uuid().nullable().optional(),
});

const joinRoomSchema = z.object({
  // UI currently sends zero-based seats; allow 0+
  seatNumber: z.number().int().min(0),
  displayName: z.string().min(1),
  buyIn: z.number().int().positive(),
  authUserId: z.string().uuid().nullable().optional(),
});

const startHandSchema = z.object({
  deckSeed: z.string().optional(),
});

const ACTIONS = [
  "fold",
  "check",
  "call",
  "bet",
  "raise",
  "all_in",
] as const satisfies ActionType[];

const actionSchema = z.object({
  seatNumber: z.number().int(),
  actionType: z.enum(ACTIONS),
  amount: z.number().int().positive().optional(),
  authUserId: z.string().uuid().nullable().optional(),
  idempotencyKey: z.string().optional(),
});

app.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true, now: new Date().toISOString() });
});

app.post("/rooms", async (req: Request, res: Response) => {
  try {
    const payload = createRoomSchema.parse(req.body);
    if (payload.bigBlind <= payload.smallBlind) {
      return res.status(400).json({ error: "bigBlind must be greater than smallBlind" });
    }
    if (payload.maxBuyIn < payload.minBuyIn) {
      return res.status(400).json({ error: "maxBuyIn must be >= minBuyIn" });
    }

    const { data, error } = await supabase
      .from("rooms")
      .insert({
        small_blind: payload.smallBlind,
        big_blind: payload.bigBlind,
        min_buy_in: payload.minBuyIn,
        max_buy_in: payload.maxBuyIn,
        max_players: payload.maxPlayers ?? 9,
        bomb_pot_ante: payload.bombPotAnte ?? 0,
        inter_hand_delay: payload.interHandDelay ?? 5,
        pause_after_hand: payload.pauseAfterHand ?? false,
        owner_auth_user_id: payload.ownerAuthUserId ?? null,
        last_activity_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ room: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error({ err }, "failed to create room");
    res.status(400).json({ error: message });
  }
});

app.post("/rooms/:roomId/join", async (req: Request, res: Response) => {
  try {
    const roomId = req.params.roomId;
    const payload = joinRoomSchema.parse(req.body);

    const { data: room, error: roomErr } = await supabase
      .from("rooms")
      .select("*")
      .eq("id", roomId)
      .single();
    if (roomErr || !room) return res.status(404).json({ error: "Room not found" });

    if (payload.buyIn < room.min_buy_in || payload.buyIn > room.max_buy_in) {
      return res.status(400).json({ error: "Buy-in out of range" });
    }

    const { data: existing } = await supabase
      .from("room_players")
      .select("*")
      .eq("room_id", roomId)
      .eq("seat_number", payload.seatNumber)
      .maybeSingle();
    if (existing) {
      return res.status(400).json({ error: "Seat already taken" });
    }

    const { data, error } = await supabase
      .from("room_players")
      .insert({
        room_id: roomId,
        seat_number: payload.seatNumber,
        display_name: payload.displayName,
        chip_stack: payload.buyIn,
        total_buy_in: payload.buyIn,
        auth_user_id: payload.authUserId ?? null,
        connected_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (error) throw error;

    await supabase
      .from("rooms")
      .update({ last_activity_at: new Date().toISOString() })
      .eq("id", roomId);

    res.status(201).json({ player: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error({ err }, "failed to join room");
    res.status(400).json({ error: message });
  }
});

app.post("/rooms/:roomId/start-hand", async (req: Request, res: Response) => {
  const roomId = req.params.roomId;
  const { deckSeed } = startHandSchema.parse(req.body ?? {});

  const room = await fetchRoom(roomId);
  if (!room) return res.status(404).json({ error: "Room not found" });
  if (!room.is_active || room.is_paused) {
    return res.status(400).json({ error: "Room not active" });
  }

  const players = await fetchPlayers(roomId);
  if (players.length < 2) {
    return res.status(400).json({ error: "Need at least two players to start" });
  }

  const { gameState, playerHands, updatedPlayers, deckSeed: usedSeed, fullBoard1, fullBoard2 } = dealHand(
    room as Room,
    players as RoomPlayer[],
    deckSeed,
  );

  let createdGameStateId: string | null = null;
  try {
    const { data: gs, error: gsErr } = await supabase
      .from("game_states")
      .insert(gameState)
      .select()
      .single();
    if (gsErr) throw gsErr;
    createdGameStateId = gs.id;

    const { error: secretErr } = await supabase.from("game_state_secrets").insert({
      game_state_id: gs.id,
      deck_seed: usedSeed,
      full_board1: fullBoard1,
      full_board2: fullBoard2,
    });
    if (secretErr) throw secretErr;

    if (playerHands.length) {
      const { error: phErr } = await supabase.from("player_hands").insert(
        playerHands.map((h) => ({
          room_id: roomId,
          game_state_id: gs.id,
          seat_number: h.seat_number,
          cards: h.cards,
          auth_user_id: h.auth_user_id ?? null,
        })),
      );
      if (phErr) throw phErr;
    }

    if (updatedPlayers.length) {
      const { error: upErr } = await supabase.from("room_players").upsert(updatedPlayers);
      if (upErr) throw upErr;
    }

    await supabase
      .from("rooms")
      .update({
        current_hand_number: gameState.hand_number,
        button_seat: gameState.button_seat,
        last_activity_at: new Date().toISOString(),
      })
      .eq("id", roomId);

    res.status(201).json({ gameState: gs, deckSeed: usedSeed });
  } catch (err) {
    if (createdGameStateId) {
      await supabase.from("player_hands").delete().eq("game_state_id", createdGameStateId);
      await supabase.from("game_state_secrets").delete().eq("game_state_id", createdGameStateId);
      await supabase.from("game_states").delete().eq("id", createdGameStateId);
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error({ err }, "failed to start hand");
    res.status(400).json({ error: message });
  }
});

app.post("/rooms/:roomId/actions", async (req: Request, res: Response) => {
  const roomId = req.params.roomId;
  const payloadResult = actionSchema.safeParse(req.body);
  if (!payloadResult.success) {
    return res.status(400).json({ error: payloadResult.error.message });
  }
  const payload = payloadResult.data;

  try {
    const room = await fetchRoom(roomId);
    if (!room) return res.status(404).json({ error: "Room not found" });

    const gameState = await fetchLatestGameState(roomId);
    if (!gameState) return res.status(400).json({ error: "No active hand" });

    const secret = await fetchGameStateSecret(gameState.id);
    if (!secret) return res.status(500).json({ error: "Missing game secrets" });

    const players = await fetchPlayers(roomId);

    const outcome = applyAction(
      {
        room: room as Room,
        players: players as RoomPlayer[],
        gameState: gameState as GameStateRow,
        fullBoard1: secret.full_board1,
        fullBoard2: secret.full_board2,
      },
      payload.seatNumber,
      payload.actionType as ActionType,
      payload.amount,
    );

    await supabase
      .from("player_actions")
      .insert({
        room_id: roomId,
        game_state_id: gameState.id,
        seat_number: payload.seatNumber,
        action_type: payload.actionType,
        amount: payload.amount ?? null,
        processed: outcome.error ? false : true,
        processed_at: outcome.error ? null : new Date().toISOString(),
        error_message: outcome.error ?? null,
        auth_user_id: payload.authUserId ?? null,
      });

    if (outcome.error) {
      return res.status(400).json({ error: outcome.error });
    }

    if (outcome.updatedPlayers.length) {
      // Deduplicate updatedPlayers by player ID, keeping the last occurrence (most recent state)
      // This prevents PostgreSQL error 21000 when the same player is added to the array multiple times
      // (e.g., when a bet action completes a street and triggers bet reset for all players)
      const playerMap = new Map<string, Partial<RoomPlayer>>();
      outcome.updatedPlayers.forEach((player) => {
        if (player.id) {
          playerMap.set(player.id, player);
        }
      });
      const deduplicatedPlayers = Array.from(playerMap.values());

      const { error: upErr } = await supabase.from("room_players").upsert(deduplicatedPlayers);
      if (upErr) throw upErr;
    }

    const { error: gsErr } = await supabase
      .from("game_states")
      .update(outcome.updatedGameState)
      .eq("id", gameState.id);
    if (gsErr) throw gsErr;

    // If hand completed, write results and payouts
    if (outcome.handCompleted) {
      if (outcome.autoWinners && outcome.potAwarded) {
        // Fetch player hands for showdown evaluation
        const { data: playerHands, error: handsErr } = await supabase
          .from("player_hands")
          .select("seat_number, cards")
          .eq("game_state_id", gameState.id);

        if (handsErr) throw handsErr;

        // merge updated player snapshots to reflect latest chip/bet state before payouts
        const mergedPlayers = players.map((p) => {
          const updated = outcome.updatedPlayers.find((u) => u.id === p.id);
          return updated ? { ...p, ...updated } : p;
        });

        // Determine winners using hand evaluation for double board PLO
        const board1 = secret.full_board1 || [];
        const board2 = secret.full_board2 || [];

        // Filter to only active (non-folded) players
        const activePlayers = mergedPlayers.filter((p) => !p.has_folded);
        const activeHands = (playerHands || [])
          .filter((ph) => activePlayers.some((p) => p.seat_number === ph.seat_number))
          .map((ph) => ({
            seatNumber: ph.seat_number,
            cards: ph.cards as unknown as string[],
          }));

        const { board1Winners, board2Winners } = determineDoubleBoardWinners(
          activeHands,
          board1,
          board2,
        );

        // Calculate payouts for double board
        const payouts = endOfHandPayout(
          board1Winners,
          board2Winners,
          outcome.potAwarded,
        );

        if (payouts.length) {
          const creditUpdates = payouts
            .map((p) => {
              const player = mergedPlayers.find((pl) => pl.seat_number === p.seat);
              return player
                ? {
                    id: player.id,
                    room_id: player.room_id,
                    seat_number: player.seat_number,
                    auth_user_id: player.auth_user_id,
                    display_name: player.display_name,
                    total_buy_in: player.total_buy_in,
                    chip_stack: (player.chip_stack ?? 0) + p.amount,
                  }
                : null;
            })
            .filter(Boolean) as Partial<RoomPlayer>[];
            if (creditUpdates.length) {
              const { error: creditErr } = await supabase.from("room_players").upsert(creditUpdates);
              if (creditErr) throw creditErr;
            }
          }
          const boardState = (gameState.board_state ?? null) as
            | { board1?: string[]; board2?: string[] }
            | null;

          // Combine all unique winners for hand_results
          const allWinners = Array.from(new Set([...board1Winners, ...board2Winners]));

          const { error: resultsErr } = await supabase.from("hand_results").insert({
            room_id: roomId,
            hand_number: gameState.hand_number,
            final_pot: outcome.potAwarded ?? gameState.pot_size ?? 0,
            board_a: boardState?.board1 ?? null,
            board_b: boardState?.board2 ?? null,
            winners: allWinners,
            action_history: outcome.updatedGameState.action_history ?? gameState.action_history,
            shown_hands: null,
          });
          if (resultsErr) throw resultsErr;
        }

      // Delete game state to trigger hand completion
      const { error: deleteErr } = await supabase
        .from("game_states")
        .delete()
        .eq("id", gameState.id);

      if (deleteErr) {
        logger.error({ err: deleteErr }, "failed to delete game_state");
        throw deleteErr;
      }

      logger.info(
        {
          roomId: room.id,
          handNumber: gameState.hand_number,
        },
        "hand completed and game_state deleted",
      );
    }

    // Return response - if hand completed, game state was deleted
    if (outcome.handCompleted) {
      res.json({ ok: true });
    } else {
      res.json({ ok: true, gameState: { ...gameState, ...outcome.updatedGameState } });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error({ err }, "failed to process action");
    res.status(500).json({ error: message });
  }
});

async function fetchRoom(roomId: string): Promise<Room | null> {
  const { data, error } = await supabase.from("rooms").select("*").eq("id", roomId).maybeSingle();
  if (error) throw error;
  return data as Room | null;
}

async function fetchPlayers(roomId: string): Promise<RoomPlayer[]> {
  const { data, error } = await supabase
    .from("room_players")
    .select("*")
    .eq("room_id", roomId)
    .order("seat_number", { ascending: true });
  if (error) throw error;
  return (data ?? []) as RoomPlayer[];
}

async function fetchLatestGameState(roomId: string): Promise<GameStateRow | null> {
  const { data, error } = await supabase
    .from("game_states")
    .select("*")
    .eq("room_id", roomId)
    .order("hand_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as GameStateRow | null;
}

app.listen(port, () => {
  logger.info(`Engine listening on ${port}`);
});
