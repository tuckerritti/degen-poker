import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase/server";
import { submitActionSchema } from "@/lib/validation/schemas";
import {
  type ActionHistoryItem,
  type BoardState,
  type GameState,
} from "@/types/database";
import type { Json } from "@/types/database.types";
import { shuffleDeck } from "@/lib/poker/deck";
import { z } from "zod";
import { logApiRoute, createLogger } from "@/lib/logger";
import {
  getBettingLimits,
  isValidBetAmount,
  shouldAutoDealToShowdown,
} from "@/lib/poker/betting";

/**
 * Submit a player action to the queue
 * The action will be validated and processed by a separate endpoint
 */
export async function POST(request: Request) {
  const log = logApiRoute("POST", "/api/game/submit-action");

  try {
    const body = await request.json();
    log.start({ bodyKeys: Object.keys(body) });

    // Validation
    const validatedData = submitActionSchema.parse(body);
    const { roomId, sessionId, seatNumber, actionType } = validatedData;
    const amount = "amount" in validatedData ? validatedData.amount : undefined;

    const supabase = await getServerClient();

    // Verify player exists and owns this session
    const { data: player, error: playerError } = await supabase
      .from("room_players")
      .select("*")
      .eq("room_id", roomId)
      .eq("session_id", sessionId)
      .eq("seat_number", seatNumber)
      .single();

    if (playerError || !player) {
      log.error(playerError || new Error("Player not found"), {
        roomId,
        sessionId,
        seatNumber,
      });
      return NextResponse.json({ error: "Player not found" }, { status: 404 });
    }

    // Get current game state
    const { data: gameState, error: gameError } = await supabase
      .from("game_states")
      .select("*")
      .eq("room_id", roomId)
      .single();

    if (gameError || !gameState) {
      log.error(gameError || new Error("No active game"), { roomId });
      return NextResponse.json({ error: "No active game" }, { status: 404 });
    }

    // Verify it's this player's turn
    if (gameState.current_actor_seat !== seatNumber) {
      log.warn("Player attempted action out of turn", {
        roomId,
        seatNumber,
        currentActorSeat: gameState.current_actor_seat,
      });
      return NextResponse.json({ error: "Not your turn" }, { status: 400 });
    }

    log.info("Submitting action to queue", {
      roomId,
      seatNumber,
      actionType,
      amount,
    });

    // Insert action into queue
    const { data: action, error: actionError } = await supabase
      .from("player_actions")
      .insert({
        game_state_id: gameState.id,
        room_id: roomId,
        session_id: sessionId,
        seat_number: seatNumber,
        action_type: actionType,
        amount: amount || null,
      })
      .select()
      .single();

    if (actionError) {
      log.error(actionError, { roomId, seatNumber, actionType });
      return NextResponse.json({ error: actionError.message }, { status: 500 });
    }

    // Immediately process this action
    // In production, this could be done via a webhook or background job
    await processAction(action.id);

    log.info("Action submitted successfully", {
      roomId,
      actionId: action.id,
      seatNumber,
      actionType,
    });
    return NextResponse.json({ action }, { status: 201 });
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

/**
 * Process a player action and update game state
 */
async function processAction(actionId: string) {
  const processLogger = createLogger("game-action-processor");
  const supabase = await getServerClient();

  processLogger.debug({ actionId }, "Processing action");

  // Get the action
  const { data: action, error: actionError } = await supabase
    .from("player_actions")
    .select("*")
    .eq("id", actionId)
    .single();

  if (actionError || !action || action.processed || !action.game_state_id) {
    if (actionError) {
      processLogger.error(
        { actionId, error: actionError },
        "Failed to fetch action",
      );
    }
    return;
  }

  // Get game state
  const { data: gameState, error: gameError } = await supabase
    .from("game_states")
    .select("*")
    .eq("id", action.game_state_id)
    .single();

  if (gameError || !gameState) {
    return;
  }

  // Get all players
  const { data: players, error: playersError } = await supabase
    .from("room_players")
    .select("*")
    .eq("room_id", action.room_id)
    .eq("is_spectating", false);

  if (playersError || !players) {
    return;
  }

  const player = players.find((p) => p.seat_number === action.seat_number);
  if (!player) {
    return;
  }

  // Process the action
  let newChipStack = player.chip_stack;
  let newCurrentBet = player.current_bet ?? 0;
  let newPotSize = gameState.pot_size ?? 0;
  let newGameCurrentBet = gameState.current_bet ?? 0;
  let newLastAggressor = gameState.last_aggressor_seat;
  let playerIsAllIn = player.is_all_in ?? false;
  let playerHasFolded = player.has_folded ?? false;
  let newLastRaiseAmount = gameState.last_raise_amount ?? 0;

  processLogger.info(
    {
      roomId: action.room_id,
      seatNumber: action.seat_number,
      actionType: action.action_type,
      amount: action.amount,
      phase: gameState.phase,
    },
    `Processing ${action.action_type} action`,
  );

  switch (action.action_type) {
    case "fold":
      playerHasFolded = true;
      processLogger.debug({ seatNumber: action.seat_number }, "Player folded");
      break;

    case "check":
      // No chips change
      if (newGameCurrentBet > newCurrentBet) {
        // Can't check when facing a bet
        processLogger.warn(
          {
            seatNumber: action.seat_number,
            currentBet: newCurrentBet,
            requiredBet: newGameCurrentBet,
          },
          "Invalid check attempt - facing a bet",
        );
        await supabase
          .from("player_actions")
          .update({
            processed: true,
            error_message: "Cannot check when facing a bet",
          })
          .eq("id", actionId);
        return;
      }
      break;

    case "call":
      const callAmount = Math.min(
        newGameCurrentBet - newCurrentBet,
        player.chip_stack,
      );
      newChipStack -= callAmount;
      newCurrentBet += callAmount;
      newPotSize += callAmount;
      if (newChipStack === 0) {
        playerIsAllIn = true;
      }
      processLogger.debug(
        {
          seatNumber: action.seat_number,
          callAmount,
          newChipStack,
          isAllIn: playerIsAllIn,
        },
        "Player called",
      );
      break;

    case "bet":
    case "raise":
      if (!action.amount || action.amount <= 0) {
        processLogger.warn(
          {
            seatNumber: action.seat_number,
            amount: action.amount,
          },
          "Invalid bet amount",
        );
        await supabase
          .from("player_actions")
          .update({
            processed: true,
            error_message: "Invalid bet amount",
          })
          .eq("id", actionId);
        return;
      }

      // Get room data for big blind
      const { data: room } = await supabase
        .from("rooms")
        .select("big_blind")
        .eq("id", action.room_id)
        .single();

      if (!room) {
        processLogger.error({ roomId: action.room_id }, "Room not found");
        return;
      }

      // Calculate betting limits
      const limits = getBettingLimits(
        player.chip_stack,
        player.current_bet ?? 0,
        gameState.current_bet ?? 0,
        gameState.pot_size ?? 0,
        gameState.last_raise_amount ?? room.big_blind,
        room.big_blind,
      );

      // Validate bet is within pot limits
      const isAllIn = action.amount >= player.chip_stack;
      if (!isValidBetAmount(action.amount, limits, isAllIn)) {
        processLogger.warn(
          {
            seatNumber: action.seat_number,
            amount: action.amount,
            minBet: limits.minBet,
            maxBet: limits.maxBet,
            isAllIn,
          },
          "Bet amount violates pot limit",
        );
        await supabase
          .from("player_actions")
          .update({
            processed: true,
            error_message: `Bet must be between ${limits.minBet} and ${limits.maxBet}`,
          })
          .eq("id", actionId);
        return;
      }

      const totalBetAmount = Math.min(action.amount, player.chip_stack);
      const additionalAmount = totalBetAmount - newCurrentBet;

      newChipStack -= additionalAmount;
      newCurrentBet = totalBetAmount;
      newPotSize += additionalAmount;
      newGameCurrentBet = Math.max(newGameCurrentBet, totalBetAmount);
      newLastAggressor = action.seat_number;

      // Track raise amount for incomplete raise rule
      const raiseSize = totalBetAmount - (gameState.current_bet ?? 0);
      const minRaiseSize = Math.max(
        gameState.last_raise_amount ?? room.big_blind,
        room.big_blind,
      );

      // If all-in and doesn't meet min raise, it doesn't reopen betting
      const reopensBetting = !isAllIn || raiseSize >= minRaiseSize;

      // Update last raise amount if this is a valid raise
      if (reopensBetting && raiseSize > 0) {
        newLastRaiseAmount = raiseSize;
      }

      if (newChipStack === 0) {
        playerIsAllIn = true;
      }
      processLogger.debug(
        {
          seatNumber: action.seat_number,
          totalBetAmount,
          raiseSize,
          reopensBetting,
          newLastRaiseAmount,
          newPotSize,
          isAllIn: playerIsAllIn,
        },
        `Player ${action.action_type}`,
      );
      break;

    case "all_in":
      const allInAmount = player.chip_stack;
      newChipStack = 0;
      newCurrentBet += allInAmount;
      newPotSize += allInAmount;
      newGameCurrentBet = Math.max(newGameCurrentBet, newCurrentBet);
      newLastAggressor = action.seat_number;
      playerIsAllIn = true;
      processLogger.info(
        {
          seatNumber: action.seat_number,
          allInAmount,
          newPotSize,
        },
        "Player went all-in",
      );
      break;
  }

  // Calculate chips actually added to pot this action
  const chipsAdded = player.chip_stack - newChipStack;

  // Update player
  await supabase
    .from("room_players")
    .update({
      chip_stack: newChipStack,
      current_bet: newCurrentBet,
      total_invested_this_hand:
        (player.total_invested_this_hand ?? 0) + chipsAdded,
      is_all_in: playerIsAllIn,
      has_folded: playerHasFolded,
    })
    .eq("id", player.id);

  // Update local player array with new state for detection
  if (playerIsAllIn) {
    player.is_all_in = true;
  }
  if (newChipStack !== player.chip_stack) {
    player.chip_stack = newChipStack;
  }
  player.current_bet = newCurrentBet;

  // Check if auto-deal is needed (no more action possible)
  if (shouldAutoDealToShowdown(players)) {
    processLogger.info(
      {
        roomId: action.room_id,
        phase: gameState.phase,
        potSize: newPotSize,
      },
      "No more action possible - auto-dealing to showdown",
    );

    // Get deck and calculate card indices (reuse existing logic)
    const currentBoardState = (gameState.board_state as BoardState) || {
      board1: [],
      board2: [],
    };
    const board1 = currentBoardState.board1 || [];
    const board2 = currentBoardState.board2 || [];
    const burnedCards = gameState.burned_card_indices ?? [];
    const deck = shuffleDeck(gameState.deck_seed);

    const seatedPlayers = players.filter((p) => !p.is_spectating);
    const holeCardsDealt = seatedPlayers.length * 4;
    const boardCardsDealt = board1.length + board2.length;
    const burnedCardsCount = burnedCards.length;
    const cardIndex = holeCardsDealt + burnedCardsCount + boardCardsDealt;

    // Auto-deal remaining cards
    const dealResult = await autoDealToShowdown(
      gameState,
      deck,
      cardIndex,
      board1,
      board2,
      burnedCards,
    );

    // Reset betting state for all players
    await supabase
      .from("room_players")
      .update({ current_bet: 0 })
      .eq("room_id", action.room_id);

    // Update game state to showdown
    const updatedBoardState: BoardState = {
      board1: dealResult.board1,
      board2: dealResult.board2,
    };

    const actionHistory =
      (gameState.action_history as ActionHistoryItem[] | null) ?? [];
    const newActionHistory: ActionHistoryItem[] = [
      ...actionHistory,
      {
        seat_number: action.seat_number,
        action_type: action.action_type,
        amount: action.amount ?? undefined,
        timestamp: new Date().toISOString(),
      },
    ];

    await supabase
      .from("game_states")
      .update({
        pot_size: newPotSize,
        current_bet: 0,
        last_aggressor_seat: newLastAggressor,
        last_raise_amount: 0,
        current_actor_seat: null,
        action_deadline_at: null,
        seats_to_act: [],
        seats_acted: [],
        action_history: newActionHistory as unknown as Json,
        phase: "showdown",
        board_state: updatedBoardState as unknown as Json,
        burned_card_indices: dealResult.burnedCards,
      })
      .eq("id", gameState.id);

    // Mark action as processed
    await supabase
      .from("player_actions")
      .update({ processed: true, processed_at: new Date().toISOString() })
      .eq("id", actionId);

    processLogger.info(
      {
        roomId: action.room_id,
        potSize: newPotSize,
        board1: dealResult.board1,
        board2: dealResult.board2,
      },
      "Auto-dealt to showdown - awaiting normal resolution",
    );

    return; // Exit early - showdown handled by normal flow
  }

  // Check if only one player remains (everyone else folded)
  // Update the local player array to reflect the fold
  if (playerHasFolded) {
    player.has_folded = true;
  }

  const remainingPlayers = players.filter((p) => !p.has_folded);

  if (remainingPlayers.length === 1) {
    // Award pot to the last remaining player
    const winner = remainingPlayers[0];
    processLogger.info(
      {
        roomId: action.room_id,
        winnerSeat: winner.seat_number,
        potSize: newPotSize,
      },
      "All other players folded - awarding pot to remaining player",
    );

    // Update winner's chip stack
    await supabase
      .from("room_players")
      .update({
        chip_stack:
          winner.seat_number === player.seat_number
            ? newChipStack + newPotSize // If the winner is the player who just acted
            : winner.chip_stack + newPotSize, // Otherwise use their current stack
        current_bet: 0,
        total_invested_this_hand: 0,
        has_folded: false,
        is_all_in: false,
      })
      .eq("id", winner.id);

    // Reset other players' betting state
    await supabase
      .from("room_players")
      .update({
        current_bet: 0,
        total_invested_this_hand: 0,
        has_folded: false,
        is_all_in: false,
      })
      .eq("room_id", action.room_id)
      .neq("id", winner.id);

    // Archive hand result
    const boardState = (gameState.board_state as BoardState) || {
      board1: [],
      board2: [],
    };
    await supabase.from("hand_results").insert({
      room_id: action.room_id,
      hand_number: gameState.hand_number,
      final_pot: newPotSize,
      board_a: boardState.board1 || [],
      board_b: boardState.board2 || [],
      winners: [
        {
          seat: winner.seat_number,
          amount: newPotSize,
          board: "N/A",
          hand_rank: 0,
          hand_description: "Won by fold - all other players folded",
        },
      ],
      shown_hands: {},
      action_history: gameState.action_history,
    });

    // Delete player hands
    await supabase
      .from("player_hands")
      .delete()
      .eq("game_state_id", gameState.id);

    // Delete game state (triggers real-time event for clients)
    await supabase.from("game_states").delete().eq("id", gameState.id);

    // Mark action as processed
    await supabase
      .from("player_actions")
      .update({ processed: true, processed_at: new Date().toISOString() })
      .eq("id", actionId);

    processLogger.info(
      {
        roomId: action.room_id,
        winnerSeat: winner.seat_number,
        potAwarded: newPotSize,
      },
      "Hand ended by fold",
    );

    return;
  }

  // Update action history
  const actionHistory =
    (gameState.action_history as ActionHistoryItem[] | null) ?? [];
  const newActionHistory: ActionHistoryItem[] = [
    ...actionHistory,
    {
      seat_number: action.seat_number,
      action_type: action.action_type,
      amount: action.amount ?? undefined,
      timestamp: new Date().toISOString(),
    },
  ];

  // Mark this seat as acted
  const seatsActed = gameState.seats_acted ?? [];
  const seatsToAct = gameState.seats_to_act ?? [];
  let newSeatsActed = [...seatsActed, action.seat_number];
  let newSeatsToAct = seatsToAct.filter(
    (s: number) => s !== action.seat_number,
  );

  // If this was a valid raise (bet increased), reopen betting to players who already acted
  if (
    newGameCurrentBet > (gameState.current_bet ?? 0) &&
    newLastRaiseAmount > (gameState.last_raise_amount ?? 0)
  ) {
    // Add all active players except current actor back to seats_to_act
    const activePlayers = players.filter(
      (p) =>
        !p.has_folded && !p.is_all_in && p.seat_number !== action.seat_number,
    );
    newSeatsToAct = activePlayers.map((p) => p.seat_number);
    newSeatsActed = [action.seat_number]; // Reset to just the raiser
    processLogger.info(
      {
        roomId: action.room_id,
        raisingSeat: action.seat_number,
        newBet: newGameCurrentBet,
        reopenedTo: newSeatsToAct,
      },
      "Raise reopened betting",
    );
  }

  // Determine next actor
  const activePlayers = players.filter(
    (p) =>
      !p.has_folded && !p.is_all_in && p.seat_number !== action.seat_number,
  );

  // Check if betting round is complete
  const allBetsEqual = activePlayers.every(
    (p) => p.current_bet === newGameCurrentBet || p.has_folded || p.is_all_in,
  );
  const allActed = newSeatsToAct.length === 0;

  let nextPhase = gameState.phase;
  let nextActor = null;

  // Extract current board state from JSONB (per POKER_PLAN.md)
  const currentBoardState = (gameState.board_state as BoardState) || {
    board1: [],
    board2: [],
  };
  let board1 = currentBoardState.board1 || [];
  let board2 = currentBoardState.board2 || [];

  const burnedCards = gameState.burned_card_indices ?? [];

  // Get the shuffled deck to deal new cards
  const deck = shuffleDeck(gameState.deck_seed);

  // Find next card index (after all burned and dealt cards)
  // Account for: player hole cards (4 per player in PLO) + burned cards + board cards
  const seatedPlayers = players.filter((p) => !p.is_spectating);
  const holeCardsDealt = seatedPlayers.length * 4; // PLO = 4 cards per player
  const boardCardsDealt = board1.length + board2.length;
  const burnedCardsCount = burnedCards.length;
  let cardIndex = holeCardsDealt + burnedCardsCount + boardCardsDealt;

  processLogger.debug(
    {
      holeCardsDealt,
      boardCardsDealt,
      burnedCardsCount,
      nextCardIndex: cardIndex,
    },
    "Calculating next card index",
  );

  // Define these before the if block so they're in scope for the update statement
  const nonFoldedPlayers = players.filter((p) => !p.has_folded);
  const nonFoldedNonAllIn = nonFoldedPlayers.filter((p) => !p.is_all_in);

  if (allBetsEqual && allActed) {
    // Advance to next betting round
    // Reset current bets for all players
    await supabase
      .from("room_players")
      .update({ current_bet: 0 })
      .eq("room_id", action.room_id);

    // Reset game current bet for new betting round
    newGameCurrentBet = 0;
    newLastRaiseAmount = 0;

    processLogger.info(
      {
        roomId: action.room_id,
        currentPhase: gameState.phase,
        potSize: newPotSize,
      },
      "Betting round complete - advancing to next phase",
    );

    if (gameState.phase === "flop") {
      // Deal turn - add actual card strings (per POKER_PLAN.md)
      burnedCards.push(cardIndex++);
      board1 = [...board1, deck[cardIndex++]];
      board2 = [...board2, deck[cardIndex++]];
      nextPhase = "turn";
      processLogger.info(
        {
          roomId: action.room_id,
          board1Count: board1.length,
          board2Count: board2.length,
        },
        "Dealt turn cards",
      );
    } else if (gameState.phase === "turn") {
      // Deal river - add actual card strings (per POKER_PLAN.md)
      burnedCards.push(cardIndex++);
      board1 = [...board1, deck[cardIndex++]];
      board2 = [...board2, deck[cardIndex++]];
      nextPhase = "river";
      processLogger.info(
        {
          roomId: action.room_id,
          board1Count: board1.length,
          board2Count: board2.length,
        },
        "Dealt river cards",
      );
    } else if (gameState.phase === "river") {
      // Go to showdown
      nextPhase = "showdown";
      processLogger.info(
        {
          roomId: action.room_id,
          finalPot: newPotSize,
        },
        "Moving to showdown",
      );
    }

    if (nextPhase !== "showdown") {
      // Find first player to act (left of button)
      const room = await supabase
        .from("rooms")
        .select("button_seat, max_players")
        .eq("id", action.room_id)
        .single();

      if (room.data) {
        const buttonSeat = room.data.button_seat ?? 0;
        let firstToAct = (buttonSeat + 1) % room.data.max_players;
        const activeSeats = nonFoldedNonAllIn.map((p) => p.seat_number);

        while (!activeSeats.includes(firstToAct) && activeSeats.length > 0) {
          firstToAct = (firstToAct + 1) % room.data.max_players;
        }

        nextActor = activeSeats.length > 0 ? firstToAct : null;
      }
    }
  } else {
    // Find next player to act
    const room = await supabase
      .from("rooms")
      .select("max_players")
      .eq("id", action.room_id)
      .single();

    if (room.data) {
      let nextSeat = (action.seat_number + 1) % room.data.max_players;
      const activeSeats = activePlayers.map((p) => p.seat_number);

      while (!activeSeats.includes(nextSeat) && activeSeats.length > 0) {
        nextSeat = (nextSeat + 1) % room.data.max_players;
      }

      nextActor = activeSeats.length > 0 ? nextSeat : null;
    }
  }

  // Prepare updated board state (per POKER_PLAN.md)
  const updatedBoardState: BoardState = {
    board1: board1,
    board2: board2,
  };

  // Update game state
  await supabase
    .from("game_states")
    .update({
      pot_size: newPotSize,
      current_bet: newGameCurrentBet,
      last_aggressor_seat: newLastAggressor,
      last_raise_amount: newLastRaiseAmount,
      current_actor_seat: nextActor,
      action_deadline_at: nextActor
        ? new Date(Date.now() + 30000).toISOString()
        : null,
      seats_to_act:
        nextPhase !== gameState.phase
          ? nonFoldedPlayers
              .filter((p) => !p.is_all_in)
              .map((p) => p.seat_number)
          : newSeatsToAct,
      seats_acted: nextPhase !== gameState.phase ? [] : newSeatsActed,
      action_history: newActionHistory as unknown as Json,
      phase: nextPhase,
      board_state: updatedBoardState as unknown as Json, // JSONB with actual card strings
      burned_card_indices: burnedCards,
    })
    .eq("id", gameState.id);

  // Mark action as processed
  await supabase
    .from("player_actions")
    .update({ processed: true, processed_at: new Date().toISOString() })
    .eq("id", actionId);

  // If showdown, trigger resolution
  if (nextPhase === "showdown") {
    // This could be done via a webhook or separate call
    // For now, we'll let the client detect showdown and call resolve
  }
}

/**
 * Auto-deals all remaining cards when no more betting is possible
 * Deals turn and/or river as needed, then advances to showdown
 *
 * @param gameState Current game state
 * @param deck Shuffled deck from game state seed
 * @param cardIndex Current position in deck
 * @param board1 Current board 1 cards
 * @param board2 Current board 2 cards
 * @param burnedCards Current burned card indices
 * @returns Updated state for showdown
 */
async function autoDealToShowdown(
  gameState: GameState,
  deck: string[],
  cardIndex: number,
  board1: string[],
  board2: string[],
  burnedCards: number[],
): Promise<{
  phase: "showdown";
  board1: string[];
  board2: string[];
  burnedCards: number[];
  cardIndex: number;
}> {
  const processLogger = createLogger("auto-deal-to-showdown");

  processLogger.info(
    {
      roomId: gameState.room_id,
      currentPhase: gameState.phase,
      board1Count: board1.length,
      board2Count: board2.length,
    },
    "Auto-dealing remaining cards - all players all-in",
  );

  let currentCardIndex = cardIndex;
  const updatedBoard1 = [...board1];
  const updatedBoard2 = [...board2];
  const updatedBurnedCards = [...burnedCards];

  // Deal turn if we're on flop
  if (gameState.phase === "flop") {
    updatedBurnedCards.push(currentCardIndex++);
    updatedBoard1.push(deck[currentCardIndex++]);
    updatedBoard2.push(deck[currentCardIndex++]);

    processLogger.debug(
      {
        board1Count: updatedBoard1.length,
        board2Count: updatedBoard2.length,
      },
      "Auto-dealt turn",
    );
  }

  // Deal river if we're on flop or turn
  if (gameState.phase === "flop" || gameState.phase === "turn") {
    updatedBurnedCards.push(currentCardIndex++);
    updatedBoard1.push(deck[currentCardIndex++]);
    updatedBoard2.push(deck[currentCardIndex++]);

    processLogger.debug(
      {
        board1Count: updatedBoard1.length,
        board2Count: updatedBoard2.length,
      },
      "Auto-dealt river",
    );
  }

  processLogger.info(
    {
      roomId: gameState.room_id,
      finalBoard1: updatedBoard1,
      finalBoard2: updatedBoard2,
    },
    "All cards dealt - advancing to showdown",
  );

  return {
    phase: "showdown",
    board1: updatedBoard1,
    board2: updatedBoard2,
    burnedCards: updatedBurnedCards,
    cardIndex: currentCardIndex,
  };
}
