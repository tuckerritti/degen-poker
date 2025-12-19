import express, { type Request, type Response } from "express";
import cors from "cors";
import { z } from "zod";
import { port, corsOrigin } from "./env.js";
import { logger } from "./logger.js";
import { supabase } from "./supabase.js";
import { dealHand, applyAction, endOfHandPayout, determineDoubleBoardWinners, determineSingleBoardWinners, calculateSidePots } from "./logic.js";
import type { GameStateRow, Room, RoomPlayer, SidePot } from "./types.js";
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

async function getUserId(req: Request): Promise<string | null> {
  const authHeader = (req.headers.authorization ?? req.headers.Authorization ?? "") as string;
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
    return null;
  }
  const token = authHeader.slice(7).trim();
  if (!token) return null;
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user.id;
}

async function requireUser(req: Request, res: Response): Promise<string | null> {
  const userId = await getUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized: missing or invalid bearer token" });
    return null;
  }
  return userId;
}

const createRoomSchema = z.object({
  // Bomb pots are ante-only; blinds are optional and derived when omitted.
  smallBlind: z.number().int().min(0).optional(),
  bigBlind: z.number().int().min(0).optional(),
  minBuyIn: z.number().int().positive(),
  maxBuyIn: z.number().int().positive(),
  maxPlayers: z.number().int().min(2).max(10).optional(),
  bombPotAnte: z.number().int().min(1, "bombPotAnte must be at least 1").optional(),
  interHandDelay: z.number().int().min(0).optional(),
  pauseAfterHand: z.boolean().optional(),
  gameMode: z.enum(["double_board_bomb_pot_plo", "texas_holdem"]).optional(),
});

const joinRoomSchema = z.object({
  // UI currently sends zero-based seats; allow 0+
  seatNumber: z.number().int().min(0),
  displayName: z.string().min(1),
  buyIn: z.number().int().positive(),
});

const startHandSchema = z.object({});

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
  idempotencyKey: z.string().optional(),
});

app.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true, now: new Date().toISOString() });
});

app.post("/rooms", async (req: Request, res: Response) => {
  try {
    const userId = await requireUser(req, res);
    if (!userId) return;

    const payload = createRoomSchema.parse(req.body);

    // Derive blinds from ante when not supplied; blinds remain stored for min-raise math
    const effectiveBigBlind = payload.bigBlind ?? Math.max(payload.bombPotAnte ?? 0, 2);
    let effectiveSmallBlind =
      payload.smallBlind ?? Math.max(1, Math.min(effectiveBigBlind - 1, Math.floor(effectiveBigBlind / 2)));

    if (effectiveSmallBlind >= effectiveBigBlind) {
      effectiveSmallBlind = Math.max(1, effectiveBigBlind - 1);
    }

    if (payload.maxBuyIn < payload.minBuyIn) {
      return res.status(400).json({ error: "maxBuyIn must be >= minBuyIn" });
    }
    if (effectiveBigBlind <= effectiveSmallBlind) {
      return res.status(400).json({ error: "bigBlind must be greater than smallBlind" });
    }

    const gameMode = payload.gameMode ?? "double_board_bomb_pot_plo";

    // Validate game mode specific constraints
    if (gameMode === "texas_holdem" && (payload.bombPotAnte ?? 0) > 0) {
      return res.status(400).json({ error: "Texas Hold'em does not support bomb pot antes" });
    }

    const { data, error } = await supabase
      .from("rooms")
      .insert({
        small_blind: effectiveSmallBlind,
        big_blind: effectiveBigBlind,
        min_buy_in: payload.minBuyIn,
        max_buy_in: payload.maxBuyIn,
        max_players: payload.maxPlayers ?? 9,
        bomb_pot_ante: payload.bombPotAnte,
        inter_hand_delay: payload.interHandDelay ?? 5,
        pause_after_hand: payload.pauseAfterHand ?? false,
        game_mode: gameMode,
        owner_auth_user_id: userId,
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
    const userId = await requireUser(req, res);
    if (!userId) return;

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

    if (payload.seatNumber >= room.max_players) {
      return res.status(400).json({ error: "Seat number exceeds table capacity" });
    }

    const { data: seatedByUser } = await supabase
      .from("room_players")
      .select("*")
      .eq("room_id", roomId)
      .eq("auth_user_id", userId)
      .maybeSingle();
    if (seatedByUser) {
      return res.status(400).json({ error: "You are already seated at this table" });
    }

    const { count: currentPlayers } = await supabase
      .from("room_players")
      .select("id", { count: "exact", head: true })
      .eq("room_id", roomId);
    if ((currentPlayers ?? 0) >= room.max_players) {
      return res.status(400).json({ error: "Table is full" });
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
        auth_user_id: userId,
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
  startHandSchema.parse(req.body ?? {});

  const userId = await requireUser(req, res);
  if (!userId) return;

  const room = await fetchRoom(roomId);
  if (!room) return res.status(404).json({ error: "Room not found" });
  if (!room.is_active || room.is_paused) {
    return res.status(400).json({ error: "Room not active" });
  }

  if (room.owner_auth_user_id && room.owner_auth_user_id !== userId) {
    return res.status(403).json({ error: "Only the room owner can deal the next hand" });
  }

  if (!room.owner_auth_user_id) {
    const { error: ownerErr } = await supabase
      .from("rooms")
      .update({ owner_auth_user_id: userId })
      .eq("id", roomId);
    if (ownerErr) {
      return res.status(500).json({ error: "Failed to assign room owner" });
    }
  }

  const activeGame = await fetchLatestGameState(roomId);
  if (activeGame) {
    return res.status(400).json({ error: "A hand is already in progress" });
  }

  const players = await fetchPlayers(roomId);
  if (players.length < 2) {
    return res.status(400).json({ error: "Need at least two players to start" });
  }

  const { gameState, playerHands, updatedPlayers, fullBoard1, fullBoard2, deckSeed } = dealHand(
    room as Room,
    players as RoomPlayer[],
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
      deck_seed: deckSeed,
      full_board1: fullBoard1,
      full_board2: fullBoard2.length > 0 ? fullBoard2 : null,
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

    res.status(201).json({ gameState: gs });
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
    const userId = await requireUser(req, res);
    if (!userId) return;

    const room = await fetchRoom(roomId);
    if (!room) return res.status(404).json({ error: "Room not found" });

    const gameState = await fetchLatestGameState(roomId);
    if (!gameState) return res.status(400).json({ error: "No active hand" });

    const secret = await fetchGameStateSecret(gameState.id);
    if (!secret) return res.status(500).json({ error: "Missing game secrets" });

    const players = await fetchPlayers(roomId);
    const actingPlayer = players.find((p) => p.seat_number === payload.seatNumber);
    if (!actingPlayer) return res.status(404).json({ error: "Seat not found" });
    if (actingPlayer.auth_user_id && actingPlayer.auth_user_id !== userId) {
      return res.status(403).json({ error: "You are not authorized to act for this seat" });
    }
    if (!actingPlayer.auth_user_id) {
      await supabase
        .from("room_players")
        .update({ auth_user_id: userId })
        .eq("id", actingPlayer.id);
      actingPlayer.auth_user_id = userId;
    }

    if (payload.idempotencyKey) {
      const { data: existing } = await supabase
        .from("player_actions")
        .select("*")
        .eq("room_id", roomId)
        .eq("seat_number", payload.seatNumber)
        .eq("idempotency_key", payload.idempotencyKey)
        .maybeSingle();
      if (existing) {
        return res.status(200).json({ ok: true, duplicate: true });
      }
    }

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
        auth_user_id: userId,
        idempotency_key: payload.idempotencyKey ?? null,
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

      const activePlayers = mergedPlayers.filter((p) => !p.has_folded);
      let payouts: { seat: number; amount: number }[] = [];

      if (activePlayers.length === 1) {
        payouts = [
          {
            seat: activePlayers[0].seat_number,
            amount: outcome.potAwarded ?? gameState.pot_size ?? 0,
          },
        ];
      } else {
        // Determine winners using hand evaluation
        const board1 = secret.full_board1 || [];
        const board2 = secret.full_board2 || [];
        const isHoldem = (room as Room).game_mode === "texas_holdem";

        const activeHands = (playerHands || [])
          .filter((ph) => activePlayers.some((p) => p.seat_number === ph.seat_number))
          .map((ph) => ({
            seatNumber: ph.seat_number,
            cards: ph.cards as unknown as string[],
          }));

        // Reuse side pots from applyAction outcome instead of recalculating
        const sidePots = outcome.updatedGameState.side_pots as SidePot[] ?? calculateSidePots(mergedPlayers);

        if (isHoldem) {
          // Texas Hold'em: single board winner determination
          const winners = determineSingleBoardWinners(activeHands, board1);
          // For Hold'em, distribute entire pot to winners (not split between boards)
          payouts = endOfHandPayout(sidePots, winners, []);
        } else {
          // PLO: double board winner determination
          const { board1Winners, board2Winners } = determineDoubleBoardWinners(
            activeHands,
            board1,
            board2,
          );
          payouts = endOfHandPayout(sidePots, board1Winners, board2Winners);
        }
      }

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

        // Auto-pause heads-up games when one player busts
        const finalPlayers = mergedPlayers.map((p) => {
          const credit = creditUpdates.find((c) => c.id === p.id);
          return credit ? { ...p, ...credit } : p;
        });
        const activeSeated = finalPlayers.filter(
          (p) => !p.is_spectating && !p.is_sitting_out,
        );
        const withChips = activeSeated.filter((p) => (p.chip_stack ?? 0) > 0);
        const shouldAutoPause = activeSeated.length === 2 && withChips.length === 1;
        if (shouldAutoPause) {
          const { error: pauseErr } = await supabase
            .from("rooms")
            .update({
              is_paused: true,
              pause_after_hand: false,
              last_activity_at: new Date().toISOString(),
            })
            .eq("id", roomId);
          if (pauseErr) throw pauseErr;
        }
      }
      const boardState = (gameState.board_state ?? null) as
        | { board1?: string[]; board2?: string[] }
        | null;

      const allWinners = payouts.map((p) => p.seat);

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
