import { NextResponse } from "next/server";
import { getServiceClient, getAuthUser } from "@/lib/supabase/server";
import { rebuySchema } from "@/lib/validation/schemas";
import { z } from "zod";
import { logApiRoute } from "@/lib/logger";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ playerId: string }> },
) {
  const log = logApiRoute("POST", "/api/players/[playerId]/rebuy");
  let playerId: string | undefined;

  try {
    playerId = (await params).playerId;
    const body = await request.json();
    log.start({ playerId, bodyKeys: Object.keys(body) });

    // Validation
    const validatedData = rebuySchema.parse(body);
    const { amount } = validatedData;

    const { user } = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = await getServiceClient();

    // Get player with room details
    const { data: player, error: playerError } = await supabase
      .from("room_players")
      .select(
        `
        *,
        rooms (
          id,
          min_buy_in,
          max_buy_in,
          is_active
        )
      `,
      )
      .eq("id", playerId)
      .single();

    if (playerError || !player) {
      return NextResponse.json({ error: "Player not found" }, { status: 404 });
    }

    // Verify session ownership
    if (player.auth_user_id !== user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Check if room is still active
    if (!player.rooms?.is_active) {
      return NextResponse.json(
        { error: "Room is no longer active" },
        { status: 400 },
      );
    }

    // Check if player is spectating
    if (player.is_spectating) {
      return NextResponse.json(
        { error: "Spectators cannot re-buy" },
        { status: 400 },
      );
    }

    // Validate new stack doesn't exceed max buy-in
    const newStack = player.chip_stack + amount;
    if (newStack > player.rooms.max_buy_in) {
      return NextResponse.json(
        {
          error: `Total stack cannot exceed ${player.rooms.max_buy_in}. Current stack: ${player.chip_stack}, Max additional: ${player.rooms.max_buy_in - player.chip_stack}`,
        },
        { status: 400 },
      );
    }

    // Update player's chip stack and total buy-in
    const { data: updatedPlayer, error: updateError } = await supabase
      .from("room_players")
      .update({
        chip_stack: newStack,
        total_buy_in: player.total_buy_in + amount,
      })
      .eq("id", playerId)
      .select()
      .single();

    if (updateError) {
      log.error(updateError, { playerId, amount });
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    log.info("Rebuy successful", {
      playerId,
      amount,
      newStack: updatedPlayer.chip_stack,
      totalBuyIn: updatedPlayer.total_buy_in,
    });

    return NextResponse.json({ player: updatedPlayer }, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      log.error(error, { validationErrors: error.issues, playerId });
      return NextResponse.json(
        { error: error.issues[0].message },
        { status: 400 },
      );
    }
    log.error(error instanceof Error ? error : new Error(String(error)), {
      playerId,
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
