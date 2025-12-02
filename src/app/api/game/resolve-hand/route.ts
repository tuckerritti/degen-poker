import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/server";
import {
  splitPot,
  splitPotWithSidePots,
  createSidePots,
  type PlayerInHand,
} from "@/lib/poker/pot-splitter";
import { resolveHandSchema } from "@/lib/validation/schemas";
import { type BoardState } from "@/types/database";
import { z } from "zod";
import { logApiRoute } from "@/lib/logger";

export async function POST(request: Request) {
  const log = logApiRoute("POST", "/api/game/resolve-hand");

  try {
    const body = await request.json();
    log.start({ bodyKeys: Object.keys(body) });

    // Validation
    const validatedData = resolveHandSchema.parse(body);
    const { roomId } = validatedData;

    const supabase = await getServiceClient();

    // Get game state
    const { data: gameState, error: gameError } = await supabase
      .from("game_states")
      .select("*")
      .eq("room_id", roomId)
      .single();

    if (gameError || !gameState) {
      log.error(gameError || new Error("No active game"), { roomId });
      return NextResponse.json({ error: "No active game" }, { status: 404 });
    }

    if (gameState.phase !== "showdown") {
      log.warn("Attempted to resolve hand before showdown", {
        roomId,
        currentPhase: gameState.phase,
      });
      return NextResponse.json(
        { error: "Hand not at showdown yet" },
        { status: 400 },
      );
    }

    log.info("Resolving showdown", {
      roomId,
      potSize: gameState.pot_size,
      handNumber: gameState.hand_number,
    });

    // Get all players
    const { data: players, error: playersError } = await supabase
      .from("room_players")
      .select("*")
      .eq("room_id", roomId)
      .eq("is_spectating", false);

    if (playersError || !players) {
      return NextResponse.json(
        { error: "Failed to fetch players" },
        { status: 500 },
      );
    }

    // Get community cards from board_state JSONB (per POKER_PLAN.md)
    const boardState = (gameState.board_state as BoardState) || {};
    const boardA = boardState.board1 || [];
    const boardB = boardState.board2 || [];
    const potSize = gameState.pot_size ?? 0;

    if (!boardA.length || !boardB.length) {
      return NextResponse.json(
        { error: "Board state is incomplete" },
        { status: 400 },
      );
    }

    // Fetch player hands from PRIVATE table (per POKER_PLAN.md Section 2)
    // Use service role to access all hands for showdown resolution
    const { data: playerHandsData, error: handsError } = await supabase
      .from("player_hands")
      .select("*")
      .eq("game_state_id", gameState.id);

    if (handsError || !playerHandsData) {
      return NextResponse.json(
        { error: "Failed to fetch player hands" },
        { status: 500 },
      );
    }

    // Map player hands by seat number for easy lookup
    const playerHandsBySeat = new Map<number, string[]>();
    for (const hand of playerHandsData) {
      playerHandsBySeat.set(
        hand.seat_number,
        hand.cards as unknown as string[],
      );
    }

    // Build player hands for evaluation
    const playersInHand: PlayerInHand[] = players
      .filter((p) => !p.has_folded)
      .map((p) => {
        const holeCards = playerHandsBySeat.get(p.seat_number) || [];

        return {
          seatNumber: p.seat_number,
          holeCards,
          hasFolded: false,
          totalInvested: p.total_invested_this_hand ?? 0,
        };
      });

    // Handle case where everyone folded except one
    if (playersInHand.length === 1) {
      const winner = playersInHand[0];
      const winningPlayer = players.find(
        (p) => p.seat_number === winner.seatNumber,
      );

      if (winningPlayer) {
        // Award entire pot to remaining player
        await supabase
          .from("room_players")
          .update({
            chip_stack: winningPlayer.chip_stack + potSize,
            current_bet: 0,
            total_invested_this_hand: 0,
            has_folded: false,
            is_all_in: false,
          })
          .eq("id", winningPlayer.id);

        // Archive hand result
        await supabase.from("hand_results").insert({
          room_id: roomId,
          hand_number: gameState.hand_number,
          final_pot: potSize,
          board_a: boardA,
          board_b: boardB,
          winners: [
            {
              seat: winner.seatNumber,
              amount: potSize,
              board: "A",
              hand_rank: 0,
              hand_description: "Winner by default (all others folded)",
            },
          ],
          shown_hands: {},
          action_history: gameState.action_history,
        });

        // Delete game state
        await supabase.from("game_states").delete().eq("id", gameState.id);

        // Check if pause was scheduled after this hand
        const { data: room } = await supabase
          .from("rooms")
          .select("pause_after_hand")
          .eq("id", roomId)
          .single();

        if (room?.pause_after_hand) {
          // Apply the pause now that the hand is complete
          await supabase
            .from("rooms")
            .update({
              is_paused: true,
              pause_after_hand: false,
            })
            .eq("id", roomId);

          log.info("Pause applied after hand completion", { roomId });
        }

        return NextResponse.json({
          winners: [winner.seatNumber],
          message: "Hand resolved",
        });
      }
    }

    // Create side pots based on all-in scenarios
    const sidePots = createSidePots(
      playersInHand.map((p) => ({
        seatNumber: p.seatNumber,
        totalInvested: p.totalInvested,
        hasFolded: p.hasFolded,
      })),
    );

    log.info("Side pots created", {
      roomId,
      sidePotCount: sidePots.length,
      totalPot: sidePots.reduce((sum, p) => sum + p.amount, 0),
    });

    // Evaluate hands and split pot(s)
    const winners =
      sidePots.length > 0
        ? splitPotWithSidePots(playersInHand, boardA, boardB, sidePots)
        : splitPot(playersInHand, boardA, boardB, potSize);

    log.info("Hand evaluation complete", {
      roomId,
      winnerCount: winners.length,
      totalDistributed: winners.reduce((sum, w) => sum + w.amount, 0),
    });

    // Group winnings by seat
    const winningsBySeat = new Map<number, number>();
    for (const winner of winners) {
      const current = winningsBySeat.get(winner.seatNumber) || 0;
      winningsBySeat.set(winner.seatNumber, current + winner.amount);
    }

    log.debug("Winnings calculated", {
      roomId,
      winnings: Object.fromEntries(winningsBySeat),
    });

    // Update player chip stacks
    for (const [seatNumber, winnings] of winningsBySeat.entries()) {
      const player = players.find((p) => p.seat_number === seatNumber);
      if (player) {
        await supabase
          .from("room_players")
          .update({
            chip_stack: player.chip_stack + winnings,
            current_bet: 0,
            total_invested_this_hand: 0,
            has_folded: false,
            is_all_in: false,
          })
          .eq("id", player.id);
      }
    }

    // Reset non-winning players
    const winningSeats = Array.from(winningsBySeat.keys());
    const losingPlayers = players.filter(
      (p) => !winningSeats.includes(p.seat_number),
    );

    for (const player of losingPlayers) {
      await supabase
        .from("room_players")
        .update({
          current_bet: 0,
          total_invested_this_hand: 0,
          has_folded: false,
          is_all_in: false,
        })
        .eq("id", player.id);
    }

    // Build shown hands for archive
    const shownHands: Record<number, string[]> = {};
    for (const player of playersInHand) {
      shownHands[player.seatNumber] = player.holeCards;
    }

    // Archive hand result
    await supabase.from("hand_results").insert({
      room_id: roomId,
      hand_number: gameState.hand_number,
      final_pot: potSize,
      board_a: boardA,
      board_b: boardB,
      winners: winners.map((w) => ({
        seat: w.seatNumber,
        amount: w.amount,
        board: w.board,
        hand_rank: w.handRank,
        hand_description: w.handDescription,
      })),
      shown_hands: shownHands,
      action_history: gameState.action_history,
    });

    // Delete game state to end hand
    await supabase.from("game_states").delete().eq("id", gameState.id);

    // Check if pause was scheduled after this hand
    const { data: room } = await supabase
      .from("rooms")
      .select("pause_after_hand")
      .eq("id", roomId)
      .single();

    if (room?.pause_after_hand) {
      // Apply the pause now that the hand is complete
      await supabase
        .from("rooms")
        .update({
          is_paused: true,
          pause_after_hand: false,
        })
        .eq("id", roomId);

      log.info("Pause applied after hand completion", { roomId });
    }

    log.success({
      roomId,
      winners: Array.from(winningsBySeat.keys()),
      handNumber: gameState.hand_number,
    });

    return NextResponse.json({
      winners: Array.from(winningsBySeat.keys()),
      winnings: Object.fromEntries(winningsBySeat),
      boardA,
      boardB,
      shownHands,
    });
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
