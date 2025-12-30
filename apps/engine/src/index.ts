import express, { type Request, type Response } from "express";
import cors from "cors";
import { z } from "zod";
import { port, corsOrigin } from "./env.js";
import { logger } from "./logger.js";
import { supabase } from "./supabase.js";
import {
  dealHand,
  applyAction,
  endOfHandPayout,
  determineDoubleBoardWinners,
  determineSingleBoardWinners,
  determineIndianPokerWinners,
  determine321Winners,
  calculateSidePots,
  endOfHandPayout321,
} from "./logic.js";
import type { GameStateRow, Room, RoomPlayer, SidePot } from "./types.js";
import { ActionType } from "@poker/shared";
import { fetchGameStateSecret } from "./secrets.js";
import { handCompletionCleanup } from "./cleanup.js";

const app = express();

// Track in-flight requests for graceful shutdown
let activeRequests = 0;
let isShuttingDown = false;

app.use((req, res, next) => {
  if (isShuttingDown) {
    res.status(503).send("Server is shutting down");
    return;
  }
  activeRequests++;
  res.on("finish", () => {
    activeRequests--;
  });
  next();
});

app.use(
  cors({
    origin: corsOrigin === "*" ? true : corsOrigin,
    methods: ["GET", "POST", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);
app.use(express.json());

async function getUserId(req: Request): Promise<string | null> {
  const authHeader = (req.headers.authorization ??
    req.headers.Authorization ??
    "") as string;
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
    return null;
  }
  const token = authHeader.slice(7).trim();
  if (!token) return null;
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user.id;
}

async function requireUser(
  req: Request,
  res: Response,
): Promise<string | null> {
  const userId = await getUserId(req);
  if (!userId) {
    res
      .status(401)
      .json({ error: "Unauthorized: missing or invalid bearer token" });
    return null;
  }
  return userId;
}

const createRoomSchema = z.object({
  // For PLO bomb pots, big blind acts as the ante; small blind may be 0.
  smallBlind: z.number().int().nonnegative().optional(),
  bigBlind: z.number().int().positive(),
  minBuyIn: z.number().int().positive(),
  maxBuyIn: z.number().int().positive(),
  maxPlayers: z.number().int().min(2).max(10).optional(),
  interHandDelay: z.number().int().min(0).optional(),
  pauseAfterHand: z.boolean().optional(),
  gameMode: z
    .enum([
      "double_board_bomb_pot_plo",
      "texas_holdem",
      "indian_poker",
      "game_mode_321",
    ])
    .optional(),
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

const partitionSchema = z.object({
  seatNumber: z.number().int(),
  threeBoardCards: z.array(z.string()).length(3),
  twoBoardCards: z.array(z.string()).length(2),
  oneBoardCard: z.array(z.string()).length(1),
});

app.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true, now: new Date().toISOString() });
});

app.post("/rooms", async (req: Request, res: Response) => {
  try {
    const userId = await requireUser(req, res);
    if (!userId) return;

    const payload = createRoomSchema.parse(req.body);

    const gameMode = payload.gameMode ?? "double_board_bomb_pot_plo";
    const isHoldem = gameMode === "texas_holdem";

    const effectiveBigBlind = payload.bigBlind;
    let effectiveSmallBlind: number;

    if (isHoldem) {
      effectiveSmallBlind =
        payload.smallBlind ??
        Math.max(
          1,
          Math.min(effectiveBigBlind - 1, Math.floor(effectiveBigBlind / 2)),
        );
      if (effectiveSmallBlind <= 0) {
        return res
          .status(400)
          .json({ error: "smallBlind must be >= 1 for Texas Hold'em" });
      }
      if (effectiveBigBlind <= effectiveSmallBlind) {
        return res
          .status(400)
          .json({ error: "bigBlind must be greater than smallBlind" });
      }
    } else {
      // Bomb pot PLO: BB doubles as ante; SB is optional and can be 0
      effectiveSmallBlind = payload.smallBlind ?? 0;
      if (effectiveBigBlind <= effectiveSmallBlind) {
        effectiveSmallBlind = 0; // keep DB constraint big_blind > small_blind
      }
    }

    if (payload.maxBuyIn < payload.minBuyIn) {
      return res.status(400).json({ error: "maxBuyIn must be >= minBuyIn" });
    }

    const { data, error } = await supabase
      .from("rooms")
      .insert({
        small_blind: effectiveSmallBlind,
        big_blind: effectiveBigBlind,
        min_buy_in: payload.minBuyIn,
        max_buy_in: payload.maxBuyIn,
        max_players: payload.maxPlayers ?? 9,
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
    if (roomErr || !room)
      return res.status(404).json({ error: "Room not found" });

    if (payload.buyIn < room.min_buy_in || payload.buyIn > room.max_buy_in) {
      return res.status(400).json({ error: "Buy-in out of range" });
    }

    if (payload.seatNumber >= room.max_players) {
      return res
        .status(400)
        .json({ error: "Seat number exceeds table capacity" });
    }

    const { data: seatedByUser } = await supabase
      .from("room_players")
      .select("*")
      .eq("room_id", roomId)
      .eq("auth_user_id", userId)
      .maybeSingle();
    if (seatedByUser) {
      return res
        .status(400)
        .json({ error: "You are already seated at this table" });
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

    // Check if a hand is currently in progress
    const activeGame = await fetchLatestGameState(roomId);
    const isHandInProgress =
      activeGame !== null && !activeGame.hand_completed_at;

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
        waiting_for_next_hand: isHandInProgress,
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
    return res
      .status(403)
      .json({ error: "Only the room owner can deal the next hand" });
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
    return res
      .status(400)
      .json({ error: "Need at least two players to start" });
  }

  const {
    gameState,
    playerHands,
    updatedPlayers,
    fullBoard1,
    fullBoard2,
    fullBoard3,
    deckSeed,
    usesTwoDecks,
  } = dealHand(room as Room, players as RoomPlayer[]);

  let createdGameStateId: string | null = null;
  try {
    const { data: gs, error: gsErr } = await supabase
      .from("game_states")
      .insert(gameState)
      .select()
      .single();
    if (gsErr) throw gsErr;
    createdGameStateId = gs.id;

    const { error: secretErr } = await supabase
      .from("game_state_secrets")
      .insert({
        game_state_id: gs.id,
        deck_seed: deckSeed,
        full_board1: fullBoard1,
        full_board2: fullBoard2.length > 0 ? fullBoard2 : null,
        full_board3: fullBoard3 && fullBoard3.length > 0 ? fullBoard3 : null,
      });
    if (secretErr) throw secretErr;

    // Update room with two-deck metadata if needed
    if (usesTwoDecks) {
      const { error: roomUpdateErr } = await supabase
        .from("rooms")
        .update({ uses_two_decks: true })
        .eq("id", roomId);
      if (roomUpdateErr) throw roomUpdateErr;
    }

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
      const normalizedPlayers = updatedPlayers.map((player) => ({
        ...player,
        waiting_for_next_hand: player.waiting_for_next_hand ?? false,
      }));
      const { error: upErr } = await supabase
        .from("room_players")
        .upsert(normalizedPlayers);
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
      await supabase
        .from("player_hands")
        .delete()
        .eq("game_state_id", createdGameStateId);
      await supabase
        .from("game_state_secrets")
        .delete()
        .eq("game_state_id", createdGameStateId);
      await supabase.from("game_states").delete().eq("id", createdGameStateId);
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error({ err }, "failed to start hand");
    res.status(400).json({ error: message });
  }
});

app.patch("/rooms/:roomId/pause", async (req: Request, res: Response) => {
  try {
    const userId = await requireUser(req, res);
    if (!userId) return;

    const roomId = req.params.roomId;
    const room = await fetchRoom(roomId);
    if (!room) return res.status(404).json({ error: "Room not found" });

    if (!room.is_active) {
      return res.status(400).json({ error: "Room not active" });
    }

    // Authorization: Only room owner can pause/unpause
    // Note: If owner_auth_user_id is null (anonymous room), any authenticated user can pause
    if (room.owner_auth_user_id && room.owner_auth_user_id !== userId) {
      return res
        .status(403)
        .json({ error: "Only the room owner can pause/unpause" });
    }

    const gameState = await fetchLatestGameState(roomId);

    let updates: {
      is_paused?: boolean;
      pause_after_hand?: boolean;
      last_activity_at: string;
    };
    let pauseScheduled = false;

    if (room.is_paused) {
      // Unpause: clear both flags
      updates = {
        is_paused: false,
        pause_after_hand: false,
        last_activity_at: new Date().toISOString(),
      };
    } else if (gameState) {
      // Hand in progress: schedule pause after hand
      updates = {
        pause_after_hand: true,
        last_activity_at: new Date().toISOString(),
      };
      pauseScheduled = true;
    } else {
      // No active hand: pause immediately
      updates = {
        is_paused: true,
        last_activity_at: new Date().toISOString(),
      };
    }

    const { data: updatedRoom, error: updateErr } = await supabase
      .from("rooms")
      .update(updates)
      .eq("id", roomId)
      .select()
      .single();

    if (updateErr) throw updateErr;

    res.json({ room: updatedRoom, pauseScheduled });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error({ err }, "failed to toggle pause");
    res.status(500).json({ error: message });
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
    const actingPlayer = players.find(
      (p) => p.seat_number === payload.seatNumber,
    );
    if (!actingPlayer) return res.status(404).json({ error: "Seat not found" });
    if (actingPlayer.auth_user_id && actingPlayer.auth_user_id !== userId) {
      return res
        .status(403)
        .json({ error: "You are not authorized to act for this seat" });
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

    // Fetch player hands for Indian Poker showdown reveal
    let playerHands:
      | Array<{ seat_number: number; cards: string[] }>
      | undefined;
    if (room.game_mode === "indian_poker") {
      const { data: handsData, error: handsErr } = await supabase
        .from("player_hands")
        .select("seat_number, cards")
        .eq("game_state_id", gameState.id);
      if (handsErr) throw handsErr;
      if (handsData) {
        playerHands = handsData.map((h) => ({
          seat_number: h.seat_number,
          cards: h.cards as unknown as string[],
        }));
      }
    }

    // Fetch player partitions for 321 mode showdown reveal
    let playerPartitions:
      | Array<{
          seat_number: number;
          three_board_cards: unknown;
          two_board_cards: unknown;
          one_board_card: unknown;
        }>
      | undefined;
    if (room.game_mode === "game_mode_321") {
      const { data: partitionsData, error: partitionsErr } = await supabase
        .from("player_partitions")
        .select(
          "seat_number, three_board_cards, two_board_cards, one_board_card",
        )
        .eq("game_state_id", gameState.id);
      if (partitionsErr) {
        // Don't throw - partitions may not exist yet if still in partition phase
        console.error("Failed to fetch partitions:", partitionsErr);
      } else if (partitionsData) {
        playerPartitions = partitionsData.map((p) => ({
          seat_number: p.seat_number,
          three_board_cards: p.three_board_cards,
          two_board_cards: p.two_board_cards,
          one_board_card: p.one_board_card,
        }));
      }
    }

    const outcome = applyAction(
      {
        room: room as Room,
        players: players as RoomPlayer[],
        gameState: gameState as GameStateRow,
        fullBoard1: secret.full_board1,
        fullBoard2: secret.full_board2,
        fullBoard3: secret.full_board3 ?? undefined,
        playerHands,
        playerPartitions,
      },
      payload.seatNumber,
      payload.actionType as ActionType,
      payload.amount,
    );

    await supabase.from("player_actions").insert({
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
      const deduplicatedPlayers = Array.from(playerMap.values()).map(
        (player) => ({
          ...player,
          waiting_for_next_hand: player.waiting_for_next_hand ?? false,
        }),
      );

      const { error: upErr } = await supabase
        .from("room_players")
        .upsert(deduplicatedPlayers);
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

      const activePlayers = mergedPlayers.filter(
        (p) =>
          !p.has_folded &&
          !p.is_spectating &&
          !p.is_sitting_out &&
          !p.waiting_for_next_hand,
      );
      let payouts: { seat: number; amount: number }[] = [];
      let board1Winners: number[] = [];
      let board2Winners: number[] = [];

      if (activePlayers.length === 1) {
        board1Winners = [activePlayers[0].seat_number];
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
        const isIndianPoker = (room as Room).game_mode === "indian_poker";

        const activeHands = (playerHands || [])
          .filter((ph) =>
            activePlayers.some((p) => p.seat_number === ph.seat_number),
          )
          .map((ph) => ({
            seatNumber: ph.seat_number,
            cards: ph.cards as unknown as string[],
          }));

        // Reuse side pots from applyAction outcome instead of recalculating
        const sidePots =
          (outcome.updatedGameState.side_pots as SidePot[]) ??
          calculateSidePots(mergedPlayers);

        if (isIndianPoker) {
          // Indian Poker: single card high-card comparison
          const winners = determineIndianPokerWinners(activeHands);
          board1Winners = winners;
          payouts = endOfHandPayout(sidePots, winners, []);
        } else if (isHoldem) {
          // Texas Hold'em: single board winner determination
          const winners = determineSingleBoardWinners(activeHands, board1);
          // For Hold'em, distribute entire pot to winners (not split between boards)
          board1Winners = winners;
          payouts = endOfHandPayout(sidePots, winners, []);
        } else {
          // PLO: double board winner determination
          const { board1Winners: ploBoard1, board2Winners: ploBoard2 } =
            determineDoubleBoardWinners(activeHands, board1, board2);
          board1Winners = ploBoard1;
          board2Winners = ploBoard2;
          payouts = endOfHandPayout(sidePots, ploBoard1, ploBoard2);
        }
      }

      if (payouts.length) {
        const creditUpdates = payouts
          .map((p) => {
            const player = mergedPlayers.find(
              (pl) => pl.seat_number === p.seat,
            );
            return player
              ? {
                  id: player.id,
                  room_id: player.room_id,
                  seat_number: player.seat_number,
                  auth_user_id: player.auth_user_id,
                  display_name: player.display_name,
                  total_buy_in: player.total_buy_in,
                  chip_stack: (player.chip_stack ?? 0) + p.amount,
                  waiting_for_next_hand: player.waiting_for_next_hand,
                }
              : null;
          })
          .filter(Boolean) as Partial<RoomPlayer>[];
        if (creditUpdates.length) {
          const { error: creditErr } = await supabase
            .from("room_players")
            .upsert(creditUpdates);
          if (creditErr) throw creditErr;
        }

        // Auto-pause heads-up games when one player busts
        const finalPlayers = mergedPlayers.map((p) => {
          const credit = creditUpdates.find((c) => c.id === p.id);
          return credit ? { ...p, ...credit } : p;
        });
        const activeSeated = finalPlayers.filter(
          (p) =>
            !p.is_spectating && !p.is_sitting_out && !p.waiting_for_next_hand,
        );
        const withChips = activeSeated.filter((p) => (p.chip_stack ?? 0) > 0);
        const shouldAutoPause =
          activeSeated.length === 2 && withChips.length === 1;

        // Pause if: (1) heads-up bust, or (2) pause_after_hand flag is set
        if (shouldAutoPause || room.pause_after_hand) {
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
      const boardState = (gameState.board_state ?? null) as {
        board1?: string[];
        board2?: string[];
        board3?: string[];
      } | null;

      const allWinners = payouts.map((p) => p.seat);

      const { error: resultsErr } = await supabase.from("hand_results").insert({
        room_id: roomId,
        hand_number: gameState.hand_number,
        final_pot: outcome.potAwarded ?? gameState.pot_size ?? 0,
        board_a: boardState?.board1 ?? null,
        board_b: boardState?.board2 ?? null,
        board_c: boardState?.board3 ?? null,
        winners: allWinners,
        board1_winners: board1Winners,
        board2_winners: board2Winners.length > 0 ? board2Winners : null,
        board3_winners: null,
        action_history:
          outcome.updatedGameState.action_history ?? gameState.action_history,
        shown_hands: null,
      });
      if (resultsErr) throw resultsErr;

      // Mark hand as completed with timestamp for frontend countdown timer
      // The cleanup scheduler will delete this game_state after HAND_COMPLETE_DELAY_MS
      const { error: updateErr } = await supabase
        .from("game_states")
        .update({ hand_completed_at: new Date().toISOString() })
        .eq("id", gameState.id);

      if (updateErr) {
        logger.error(
          { err: updateErr },
          "failed to update game_state with hand_completed_at",
        );
        throw updateErr;
      }

      logger.info(
        {
          roomId: room.id,
          handNumber: gameState.hand_number,
          completedAt: new Date().toISOString(),
        },
        "hand marked as completed, cleanup scheduled",
      );
    }

    // Return response - if hand completed, game state was deleted
    if (outcome.handCompleted) {
      res.json({ ok: true });
    } else {
      res.json({
        ok: true,
        gameState: { ...gameState, ...outcome.updatedGameState },
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error({ err }, "failed to process action");
    res.status(500).json({ error: message });
  }
});

/**
 * Partition submission for 321 mode.
 * Each active player must submit exactly 6 cards split as 3/2/1 before showdown.
 */
app.post("/rooms/:roomId/partitions", async (req: Request, res: Response) => {
  const roomId = req.params.roomId;
  const parseResult = partitionSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ error: parseResult.error.message });
  }
  const payload = parseResult.data;

  try {
    const userId = await requireUser(req, res);
    if (!userId) return;

    const room = await fetchRoom(roomId);
    if (!room) return res.status(404).json({ error: "Room not found" });
    if (room.game_mode !== "game_mode_321") {
      return res
        .status(400)
        .json({ error: "Partitioning is only for 321 mode" });
    }

    const gameState = await fetchLatestGameState(roomId);
    if (!gameState) return res.status(400).json({ error: "No active hand" });
    if (gameState.phase !== "partition") {
      return res
        .status(400)
        .json({ error: `Cannot submit partition in phase ${gameState.phase}` });
    }
    if (gameState.hand_completed_at) {
      return res.status(409).json({ error: "Hand already completed" });
    }

    const secret = await fetchGameStateSecret(gameState.id);
    if (!secret) return res.status(500).json({ error: "Missing game secrets" });

    const players = await fetchPlayers(roomId);
    const actingPlayer = players.find(
      (p) => p.seat_number === payload.seatNumber,
    );
    if (!actingPlayer) return res.status(404).json({ error: "Seat not found" });

    if (
      actingPlayer.has_folded ||
      actingPlayer.is_sitting_out ||
      actingPlayer.is_spectating ||
      actingPlayer.waiting_for_next_hand
    ) {
      return res
        .status(400)
        .json({ error: "Player is not active in this hand" });
    }

    if (actingPlayer.auth_user_id && actingPlayer.auth_user_id !== userId) {
      return res
        .status(403)
        .json({ error: "You are not authorized for this seat" });
    }
    if (!actingPlayer.auth_user_id) {
      await supabase
        .from("room_players")
        .update({ auth_user_id: userId })
        .eq("id", actingPlayer.id);
      actingPlayer.auth_user_id = userId;
    }

    // Fetch player's hole cards for this hand
    const { data: handRow, error: handErr } = await supabase
      .from("player_hands")
      .select("cards")
      .eq("game_state_id", gameState.id)
      .eq("seat_number", payload.seatNumber)
      .single();
    if (handErr || !handRow)
      throw handErr ?? new Error("Player hand not found");
    const playerCards = (handRow.cards as unknown as string[]) ?? [];

    const submittedCards = [
      ...payload.threeBoardCards,
      ...payload.twoBoardCards,
      ...payload.oneBoardCard,
    ];

    if (submittedCards.length !== 6) {
      return res
        .status(400)
        .json({ error: "Partition must contain exactly 6 cards" });
    }

    if (playerCards.length !== 6) {
      return res.status(400).json({
        error: "Partition must use exactly the player's 6 hole cards",
      });
    }

    const remaining = new Map<string, number>();
    playerCards.forEach((card) => {
      remaining.set(card, (remaining.get(card) ?? 0) + 1);
    });

    let invalidCard: string | null = null;
    submittedCards.forEach((card) => {
      if (invalidCard) return;
      const count = remaining.get(card) ?? 0;
      if (count <= 0) {
        invalidCard = card;
        return;
      }
      remaining.set(card, count - 1);
    });

    const hasRemainder = Array.from(remaining.values()).some(
      (count) => count !== 0,
    );
    if (invalidCard || hasRemainder) {
      return res.status(400).json({
        error: "Partition must use exactly the player's 6 hole cards",
      });
    }

    const now = new Date().toISOString();
    const { error: upsertErr } = await supabase
      .from("player_partitions")
      .upsert(
        {
          room_id: roomId,
          game_state_id: gameState.id,
          seat_number: payload.seatNumber,
          auth_user_id: actingPlayer.auth_user_id ?? userId,
          three_board_cards: payload.threeBoardCards,
          two_board_cards: payload.twoBoardCards,
          one_board_card: payload.oneBoardCard,
          is_submitted: true,
          submitted_at: now,
        },
        { onConflict: "game_state_id,seat_number" },
      );
    if (upsertErr) {
      if (upsertErr.message?.includes("hand already completed")) {
        return res.status(409).json({ error: "Hand already completed" });
      }
      throw upsertErr;
    }

    // Check submission progress
    const requiredSeats = players
      .filter(
        (p) =>
          !p.has_folded &&
          !p.is_spectating &&
          !p.is_sitting_out &&
          !p.waiting_for_next_hand,
      )
      .map((p) => p.seat_number);

    const { data: submittedRows, error: submittedErr } = await supabase
      .from("player_partitions")
      .select("seat_number, three_board_cards, two_board_cards, one_board_card")
      .eq("game_state_id", gameState.id)
      .eq("is_submitted", true);
    if (submittedErr) throw submittedErr;

    const submittedSeats = new Set(
      (submittedRows ?? []).map((r) => r.seat_number),
    );
    const pendingSeats = requiredSeats.filter((s) => !submittedSeats.has(s));

    if (pendingSeats.length > 0) {
      return res.json({
        ok: true,
        pendingSeats,
        submittedCount: submittedSeats.size,
        requiredCount: requiredSeats.length,
      });
    }

    // All partitions are in: determine winners and pay out
    const sidePots =
      (gameState.side_pots as SidePot[] | null) ?? calculateSidePots(players);

    const board1 = secret.full_board1 || [];
    const board2 = secret.full_board2 || [];
    const board3 = secret.full_board3 || [];

    const partitions = (submittedRows ?? []).map((r) => ({
      seatNumber: r.seat_number,
      threeBoardCards: r.three_board_cards as string[],
      twoBoardCards: r.two_board_cards as string[],
      oneBoardCard: r.one_board_card as string[],
    }));

    const { board1Winners, board2Winners, board3Winners } = determine321Winners(
      partitions,
      board1,
      board2,
      board3,
    );

    const payouts = endOfHandPayout321(
      sidePots,
      partitions,
      board1,
      board2,
      board3,
    );

    // Mark hand complete (guard against double-finalization)
    const completionTime = new Date().toISOString();
    const { data: updatedRows, error: gsUpdateErr } = await supabase
      .from("game_states")
      .update({
        phase: "complete",
        current_actor_seat: null,
        seats_to_act: [],
        seats_acted: requiredSeats,
        hand_completed_at: completionTime,
        board_state: {
          board1,
          board2,
          board3,
          // SECURITY FIX: Do NOT store fullBoard1/2/3 - boards are already fully revealed at completion
          // fullBoard fields removed to prevent card leaks
          player_partitions: Object.fromEntries(
            partitions.map((p) => [
              p.seatNumber.toString(),
              {
                threeBoardCards: p.threeBoardCards,
                twoBoardCards: p.twoBoardCards,
                oneBoardCard: p.oneBoardCard,
              },
            ]),
          ),
          revealed_partitions: Object.fromEntries(
            partitions.map((p) => [
              p.seatNumber,
              {
                three_board_cards: p.threeBoardCards,
                two_board_cards: p.twoBoardCards,
                one_board_card: p.oneBoardCard,
              },
            ]),
          ),
        },
        side_pots: sidePots,
      })
      .eq("id", gameState.id)
      .is("hand_completed_at", null)
      .select("id");

    if (gsUpdateErr) {
      throw gsUpdateErr;
    }

    // If another request already finalized, avoid duplicating results
    const alreadyCompleted = !updatedRows || updatedRows.length === 0;
    if (alreadyCompleted) {
      return res.json({
        ok: true,
        completed: true,
        winners: {
          board1: board1Winners,
          board2: board2Winners,
          board3: board3Winners,
        },
        payouts,
      });
    }

    // Credit winners after the completion write succeeds
    if (payouts.length) {
      const creditUpdates = payouts
        .map((p) => {
          const player = players.find((pl) => pl.seat_number === p.seat);
          return player
            ? {
                id: player.id,
                room_id: player.room_id,
                seat_number: player.seat_number,
                auth_user_id: player.auth_user_id,
                display_name: player.display_name,
                total_buy_in: player.total_buy_in,
                chip_stack: (player.chip_stack ?? 0) + p.amount,
                waiting_for_next_hand: player.waiting_for_next_hand,
              }
            : null;
        })
        .filter(Boolean) as Partial<RoomPlayer>[];

      if (creditUpdates.length) {
        const { error: creditErr } = await supabase
          .from("room_players")
          .upsert(creditUpdates);
        if (creditErr) throw creditErr;
      }
    }

    // Record hand result only if we just marked completion
    const { error: resultsErr } = await supabase.from("hand_results").insert({
      room_id: roomId,
      hand_number: gameState.hand_number,
      final_pot: gameState.pot_size ?? 0,
      board_a: board1 ?? null,
      board_b: board2 ?? null,
      board_c: board3 ?? null,
      winners: payouts.map((p) => p.seat),
      board1_winners: board1Winners,
      board2_winners: board2Winners,
      board3_winners: board3Winners,
      action_history: gameState.action_history,
      shown_hands: null,
    });
    if (resultsErr) throw resultsErr;

    // Auto-pause heads-up bust / pause-after-hand logic (reuse applyAction rules)
    const finalPlayers = players.map((p) => {
      const credit = payouts.find((c) => c.seat === p.seat_number);
      return credit
        ? { ...p, chip_stack: (p.chip_stack ?? 0) + credit.amount }
        : p;
    });
    const activeSeated = finalPlayers.filter(
      (p) => !p.is_spectating && !p.is_sitting_out && !p.waiting_for_next_hand,
    );
    const withChips = activeSeated.filter((p) => (p.chip_stack ?? 0) > 0);
    const shouldAutoPause = activeSeated.length === 2 && withChips.length === 1;

    if (shouldAutoPause || room.pause_after_hand) {
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

    res.json({
      ok: true,
      completed: true,
      winners: {
        board1: board1Winners,
        board2: board2Winners,
        board3: board3Winners,
      },
      payouts,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error({ err }, "failed to submit partition");
    res.status(500).json({ error: message });
  }
});

// ============================================================
// SECURITY: Indian Poker Visibility Endpoint
// GET /rooms/:roomId/game-states/:gameStateId/indian-poker-cards?seat=<seatNumber>
// Returns visible cards for Indian Poker mode (all OTHER players' cards)
// ============================================================
const indianPokerCardsQuerySchema = z.object({
  seat: z.coerce.number().int().min(0).optional(),
});

app.get(
  "/rooms/:roomId/game-states/:gameStateId/indian-poker-cards",
  async (req: Request, res: Response) => {
    try {
      const userId = await requireUser(req, res);
      if (!userId) return;

      const { roomId, gameStateId } = req.params;
      const queryParse = indianPokerCardsQuerySchema.safeParse(req.query);

      if (!queryParse.success) {
        return res.status(400).json({
          error: "Invalid query parameters",
          details: queryParse.success ? [] : queryParse.error.issues,
        });
      }

      const { seat: requestedSeat } = queryParse.data;

      // Verify room exists
      const room = await fetchRoom(roomId);
      if (!room) {
        return res.status(404).json({ error: "Room not found" });
      }

      // Verify game mode is Indian Poker
      if (room.game_mode !== "indian_poker") {
        return res.status(400).json({
          error: "This endpoint is only for Indian Poker mode",
        });
      }

      // Verify requester is a seated (non-spectating) player in this room
      const { data: requestingPlayer, error: playerError } = await supabase
        .from("room_players")
        .select("seat_number, is_spectating")
        .eq("room_id", roomId)
        .eq("auth_user_id", userId)
        .maybeSingle();
      if (playerError) throw playerError;
      if (!requestingPlayer || requestingPlayer.is_spectating) {
        return res
          .status(403)
          .json({ error: "Player is not seated in this room" });
      }

      // If client provided a seat, ensure it matches the authenticated player
      if (
        requestedSeat !== undefined &&
        requestedSeat !== requestingPlayer.seat_number
      ) {
        return res
          .status(403)
          .json({ error: "Seat mismatch for requesting player" });
      }

      // Verify game state exists and belongs to this room
      const { data: gameState, error: gsError } = await supabase
        .from("game_states")
        .select("*")
        .eq("id", gameStateId)
        .eq("room_id", roomId)
        .maybeSingle();

      if (gsError) throw gsError;
      if (!gameState) {
        return res.status(404).json({ error: "Game state not found" });
      }

      // Verify requester is actually in this hand
      const { data: playerHand, error: handError } = await supabase
        .from("player_hands")
        .select("id")
        .eq("game_state_id", gameStateId)
        .eq("room_id", roomId)
        .eq("seat_number", requestingPlayer.seat_number)
        .maybeSingle();
      if (handError) throw handError;
      if (!playerHand) {
        return res.status(403).json({ error: "Player is not in this hand" });
      }

      // Call the secure database function to get visible cards
      const { data: visibleCards, error: cardsError } = await supabase.rpc(
        "get_indian_poker_visible_cards",
        {
          game_state_id_param: gameStateId,
          requesting_seat_number: requestingPlayer.seat_number,
        },
      );

      if (cardsError) throw cardsError;

      // Transform to map format for client
      const visibleCardsMap: Record<string, string[]> = {};
      for (const row of visibleCards || []) {
        visibleCardsMap[row.seat_number.toString()] = [row.visible_card];
      }

      res.json({
        gameStateId,
        requestingSeat: requestingPlayer.seat_number,
        visibleCards: visibleCardsMap,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error(
        { err, errorMessage },
        "Error fetching Indian Poker visible cards",
      );
      res.status(500).json({
        error: "Failed to fetch visible cards",
        details: errorMessage,
      });
    }
  },
);

async function fetchRoom(roomId: string): Promise<Room | null> {
  const { data, error } = await supabase
    .from("rooms")
    .select("*")
    .eq("id", roomId)
    .maybeSingle();
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

async function fetchLatestGameState(
  roomId: string,
): Promise<GameStateRow | null> {
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

let server: ReturnType<typeof app.listen> | null = null;

if (process.env.NODE_ENV !== "test") {
  server = app.listen(port, () => {
    logger.info(`Engine listening on ${port}`);

    // Start cleanup scheduler for completed hands
    handCompletionCleanup.start();
  });

  // Graceful shutdown handler
  async function gracefulShutdown(signal: string) {
    logger.info(`${signal} received, starting graceful shutdown`);
    isShuttingDown = true;

    // Stop accepting new connections
    server?.close(() => {
      logger.info("HTTP server closed");
    });

    // Stop cleanup scheduler and wait for in-progress cleanup
    await handCompletionCleanup.stop();

    // Wait for active requests to complete (with timeout)
    const maxWaitMs = 10000;
    const startTime = Date.now();
    while (activeRequests > 0 && Date.now() - startTime < maxWaitMs) {
      logger.info(
        `Waiting for ${activeRequests} active requests to complete...`,
      );
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    if (activeRequests > 0) {
      logger.warn(
        `Forcing shutdown with ${activeRequests} active requests still pending`,
      );
    }

    logger.info("Graceful shutdown complete");
    process.exit(0);
  }

  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
}

export { app };
