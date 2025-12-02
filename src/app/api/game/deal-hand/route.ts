import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase/server";
import { generateSeed, shuffleDeck } from "@/lib/poker/deck";
import { dealHandSchema } from "@/lib/validation/schemas";
import { z } from "zod";
import { logApiRoute } from "@/lib/logger";

export async function POST(request: Request) {
  const log = logApiRoute("POST", "/api/game/deal-hand");

  try {
    const body = await request.json();
    log.start({ bodyKeys: Object.keys(body) });

    // Validation
    const validatedData = dealHandSchema.parse(body);
    const { roomId, sessionId } = validatedData;

    const supabase = await getServerClient();

    // Get room details
    const { data: room, error: roomError } = await supabase
      .from("rooms")
      .select("*")
      .eq("id", roomId)
      .single();

    if (roomError || !room) {
      log.error(roomError || new Error("Room not found"), { roomId });
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    // Verify the requester is the room owner
    if (room.owner_session_id !== sessionId) {
      log.error(new Error("Unauthorized deal attempt"), {
        roomId,
        ownerSessionId: room.owner_session_id,
        requestSessionId: sessionId,
      });
      return NextResponse.json(
        { error: "Only the room owner can start the hand" },
        { status: 403 },
      );
    }

    // Check if game is paused
    if (room.is_paused) {
      log.error(new Error("Game is paused"), { roomId });
      return NextResponse.json(
        { error: "Game is paused. Unpause to deal the next hand." },
        { status: 400 },
      );
    }

    // Get active players (not spectating, not sitting out)
    const { data: players, error: playersError } = await supabase
      .from("room_players")
      .select("*")
      .eq("room_id", roomId)
      .eq("is_spectating", false)
      .eq("is_sitting_out", false)
      .order("seat_number", { ascending: true });

    if (playersError) {
      log.error(playersError, { roomId });
      return NextResponse.json(
        { error: "Failed to fetch players" },
        { status: 500 },
      );
    }

    if (!players || players.length < 2) {
      log.error(new Error("Insufficient players"), {
        roomId,
        playerCount: players?.length || 0,
      });
      return NextResponse.json(
        { error: "Need at least 2 players to start" },
        { status: 400 },
      );
    }

    // Check if there's already an active hand
    const { data: existingGame } = await supabase
      .from("game_states")
      .select("id")
      .eq("room_id", roomId)
      .single();

    if (existingGame) {
      log.error(new Error("Hand already in progress"), {
        roomId,
        existingGameId: existingGame.id,
      });
      return NextResponse.json(
        { error: "Hand already in progress" },
        { status: 400 },
      );
    }

    // Collect antes from all players
    const anteAmount = room.bomb_pot_ante;
    const playersAfterAnte = [];

    log.info("Collecting antes and dealing hand", {
      roomId,
      playerCount: players.length,
      anteAmount,
      handNumber: (room.current_hand_number ?? 0) + 1,
    });

    for (const player of players) {
      log.debug(`Processing player ${player.seat_number}`, {
        playerId: player.id,
        chipStack: player.chip_stack,
        anteAmount,
      });

      if (player.chip_stack < anteAmount) {
        // Player doesn't have enough for ante, they're all-in
        const { data: updated, error: updateError } = await supabase
          .from("room_players")
          .update({
            chip_stack: 0,
            current_bet: player.chip_stack,
            total_invested_this_hand: player.chip_stack,
            is_all_in: true,
          })
          .eq("id", player.id)
          .select()
          .single();

        if (updateError) {
          log.error(updateError, { playerId: player.id, phase: "ante_all_in" });
          return NextResponse.json(
            {
              error: `Failed to collect ante from player ${player.seat_number}`,
            },
            { status: 500 },
          );
        }
        playersAfterAnte.push(updated);
      } else {
        // Take ante
        const { data: updated, error: updateError } = await supabase
          .from("room_players")
          .update({
            chip_stack: player.chip_stack - anteAmount,
            current_bet: anteAmount,
            total_invested_this_hand: anteAmount,
          })
          .eq("id", player.id)
          .select()
          .single();

        if (updateError) {
          log.error(updateError, { playerId: player.id, phase: "ante_deduct" });
          return NextResponse.json(
            {
              error: `Failed to collect ante from player ${player.seat_number}`,
            },
            { status: 500 },
          );
        }
        playersAfterAnte.push(updated);
      }

      log.debug(`Player ${player.seat_number} ante collected`, {
        newChipStack: playersAfterAnte[playersAfterAnte.length - 1]?.chip_stack,
      });
    }

    const totalPot = playersAfterAnte.reduce(
      (sum, p) => sum + (p?.current_bet || 0),
      0,
    );

    // Reset current_bet to 0 for all players (ante is tracked in total_invested_this_hand)
    // This ensures the first betting round starts fresh with current_bet = 0
    await supabase
      .from("room_players")
      .update({ current_bet: 0 })
      .eq("room_id", roomId)
      .in(
        "id",
        playersAfterAnte.map((p) => p!.id),
      );

    log.debug("Reset player current_bet to 0 after ante collection", {
      roomId,
      playerCount: playersAfterAnte.length,
    });

    // Generate seed and shuffle deck
    const seed = generateSeed();
    const deck = shuffleDeck(seed);

    log.debug(`Deck generated`, {
      deckSize: deck.length,
      firstFewCards: deck.slice(0, 20),
      hasNulls: deck.some((card) => card == null),
      nullIndices: deck
        .map((card, i) => (card == null ? i : null))
        .filter((i) => i != null),
    });

    // Deal cards using actual card strings (per POKER_PLAN.md)
    let cardIndex = 0;

    // Deal 4 hole cards to each player (PLO)
    const playerHandsToInsert = [];
    for (const player of playersAfterAnte) {
      if (player) {
        const holeCards = [
          deck[cardIndex++],
          deck[cardIndex++],
          deck[cardIndex++],
          deck[cardIndex++],
        ];
        playerHandsToInsert.push({
          session_id: player.session_id,
          seat_number: player.seat_number,
          cards: holeCards,
        });
      }
    }

    // Burn a card, then deal flop A (3 cards)
    const burnedCardIndices = [cardIndex++];
    const boardA = [deck[cardIndex++], deck[cardIndex++], deck[cardIndex++]];

    // Burn a card, then deal flop B (3 cards)
    burnedCardIndices.push(cardIndex++);
    const boardB = [deck[cardIndex++], deck[cardIndex++], deck[cardIndex++]];

    log.debug(`Boards dealt`, {
      boardA,
      boardB,
      boardALength: boardA.length,
      boardBLength: boardB.length,
    });

    // Board state per POKER_PLAN.md: JSONB with actual card strings
    const boardState = {
      board1: boardA,
      board2: boardB,
    };

    // Initialize button to owner's seat on first hand, otherwise advance
    let newButtonSeat: number;
    const occupiedSeats = players
      .map((p) => p.seat_number)
      .sort((a, b) => a - b);

    if (room.button_seat === null) {
      // First hand - find owner's seat from original players array
      const ownerPlayer = players.find(
        (p) => p.session_id === room.owner_session_id,
      );
      newButtonSeat = ownerPlayer?.seat_number ?? 0;
      log.info("Initializing button to owner's seat", {
        roomId,
        ownerSessionId: room.owner_session_id,
        ownerFound: !!ownerPlayer,
        buttonSeat: newButtonSeat,
      });
    } else {
      // Advance button clockwise to next occupied seat
      // Find the next occupied seat after the current button position
      let nextSeat = (room.button_seat + 1) % room.max_players;
      let attempts = 0;

      // Keep advancing until we find an occupied seat
      while (!occupiedSeats.includes(nextSeat) && attempts < room.max_players) {
        nextSeat = (nextSeat + 1) % room.max_players;
        attempts++;
      }

      newButtonSeat = nextSeat;
      log.info("Advancing button to next occupied seat", {
        roomId,
        previousButton: room.button_seat,
        newButton: newButtonSeat,
        occupiedSeats,
      });
    }

    // Find first active player after button for first to act
    let firstToAct = (newButtonSeat + 1) % room.max_players;
    const activeSeatNumbers = playersAfterAnte
      .filter((p) => p && !p.is_all_in)
      .map((p) => p!.seat_number);

    while (!activeSeatNumbers.includes(firstToAct)) {
      firstToAct = (firstToAct + 1) % room.max_players;
    }

    // Create game state (PUBLIC - does NOT contain player hands)
    const newHandNumber = (room.current_hand_number ?? 0) + 1;
    const { data: gameState, error: gameError } = await supabase
      .from("game_states")
      .insert({
        room_id: roomId,
        hand_number: newHandNumber,
        button_seat: newButtonSeat,
        phase: "flop",
        deck_seed: seed,
        burned_card_indices: burnedCardIndices,
        board_state: boardState, // JSONB with actual cards
        pot_size: totalPot,
        current_bet: 0, // Bomb pot starts with no bet (everyone anted)
        min_raise: room.big_blind,
        current_actor_seat: firstToAct,
        action_deadline_at: new Date(Date.now() + 30000).toISOString(), // 30 seconds
        seats_to_act: activeSeatNumbers,
        seats_acted: [],
        action_history: [
          {
            seat_number: -1,
            action_type: "all_in" as const,
            timestamp: new Date().toISOString(),
          },
        ],
      })
      .select()
      .single();

    if (gameError) {
      log.error(gameError, { roomId, phase: "creating_game_state" });
      return NextResponse.json({ error: gameError.message }, { status: 500 });
    }

    // Insert player hands into PRIVATE table (per POKER_PLAN.md Section 2)
    // Each player will only receive their own cards via RLS
    const handsWithGameId = playerHandsToInsert.map((hand) => ({
      ...hand,
      game_state_id: gameState.id,
      room_id: roomId,
    }));

    const { error: handsError } = await supabase
      .from("player_hands")
      .insert(handsWithGameId);

    if (handsError) {
      log.error(handsError, { roomId, gameStateId: gameState.id });
      // Rollback: delete the game state
      await supabase.from("game_states").delete().eq("id", gameState.id);
      return NextResponse.json(
        { error: "Failed to deal cards" },
        { status: 500 },
      );
    }

    log.info("Player hands dealt successfully", {
      roomId,
      gameStateId: gameState.id,
      playerCount: playerHandsToInsert.length,
    });

    // Update room
    await supabase
      .from("rooms")
      .update({
        button_seat: newButtonSeat,
        current_hand_number: newHandNumber,
      })
      .eq("id", roomId);

    log.info("Hand dealt successfully", {
      roomId,
      gameStateId: gameState.id,
      handNumber: newHandNumber,
      potSize: totalPot,
      phase: "flop",
    });

    return NextResponse.json({ gameState }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      log.error(error, { validationErrors: error.issues });
      return NextResponse.json(
        { error: error.issues[0].message },
        { status: 400 },
      );
    }
    log.error(error instanceof Error ? error : new Error(String(error)));
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
