import { NextResponse } from "next/server";
import { getServiceClient, getAuthUser } from "@/lib/supabase/server";
import { z } from "zod";
import { logApiRoute } from "@/lib/logger";

const joinRoomSchema = z
  .object({
    displayName: z
      .string()
      .min(1, "Display name is required")
      .max(20, "Display name must be 20 characters or less"),
    seatNumber: z.number().int().min(0).max(11).optional(),
    buyInAmount: z.number().positive().optional(),
    isSpectating: z.boolean().default(false),
  })
  .refine(
    (data) => {
      // If not spectating, require seat number and buy-in amount
      if (!data.isSpectating) {
        return data.seatNumber !== undefined && data.buyInAmount !== undefined;
      }
      return true;
    },
    {
      message: "Seat number and buy-in amount required for players",
      path: ["seatNumber"],
    },
  );

export async function POST(
  request: Request,
  { params }: { params: Promise<{ roomId: string }> },
) {
  const log = logApiRoute("POST", "/api/rooms/[roomId]/join");
  let roomId: string | undefined;

  try {
    roomId = (await params).roomId;
    const body = await request.json();
    log.start({ roomId, bodyKeys: Object.keys(body) });

    // Validation
    const validatedData = joinRoomSchema.parse(body);
    const { displayName, seatNumber, buyInAmount, isSpectating } =
      validatedData;

    const { user } = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = await getServiceClient();

    // Validate room exists and is active
    const { data: room, error: roomError } = await supabase
      .from("rooms")
      .select("*")
      .eq("id", roomId)
      .single();

    if (roomError || !room) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    if (!room.is_active) {
      return NextResponse.json(
        { error: "Room is no longer active" },
        { status: 400 },
      );
    }

    // Validate buy-in amount
    if (!isSpectating) {
      // TypeScript narrowing: Zod already validated these are defined
      if (buyInAmount === undefined || seatNumber === undefined) {
        return NextResponse.json(
          { error: "Buy-in and seat required for players" },
          { status: 400 },
        );
      }

      if (buyInAmount < room.min_buy_in || buyInAmount > room.max_buy_in) {
        return NextResponse.json(
          {
            error: `Buy-in must be between ${room.min_buy_in} and ${room.max_buy_in}`,
          },
          { status: 400 },
        );
      }

      // Check if seat is available
      const { data: existingPlayer } = await supabase
        .from("room_players")
        .select("id")
        .eq("room_id", roomId)
        .eq("seat_number", seatNumber)
        .eq("is_spectating", false)
        .single();

      if (existingPlayer) {
        return NextResponse.json(
          { error: "Seat is already taken" },
          { status: 409 },
        );
      }

      // Check if player count is at max
      const { count } = await supabase
        .from("room_players")
        .select("*", { count: "exact", head: true })
        .eq("room_id", roomId)
        .eq("is_spectating", false);

      if (count && count >= room.max_players) {
        return NextResponse.json({ error: "Table is full" }, { status: 409 });
      }
    }

    // Check if session already exists in this room
    const { data: existingSession } = await supabase
      .from("room_players")
      .select("id")
      .eq("room_id", roomId)
      .eq("auth_user_id", user.id)
      .single();

    if (existingSession) {
      return NextResponse.json(
        { error: "You are already in this room" },
        { status: 409 },
      );
    }

    // Insert player
    const { data: player, error } = await supabase
      .from("room_players")
      .insert({
        room_id: roomId,
        auth_user_id: user.id,
        display_name: displayName,
        seat_number: (isSpectating ? -1 : seatNumber) as number,
        chip_stack: (isSpectating ? 0 : buyInAmount) as number,
        total_buy_in: (isSpectating ? 0 : buyInAmount) as number,
        is_spectating: isSpectating || false,
        is_sitting_out: false,
        is_all_in: false,
        has_folded: false,
        current_bet: 0,
      })
      .select()
      .single();

    if (error) {
      log.error(error, { roomId, userId: user.id, displayName, seatNumber });
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    log.info("Player joined successfully", {
      roomId,
      playerId: player.id,
      userId: user.id,
      displayName,
      seatNumber: player.seat_number,
      isSpectating: player.is_spectating,
      buyIn: player.total_buy_in,
    });

    return NextResponse.json({ player }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      log.error(error, { validationErrors: error.issues, roomId });
      return NextResponse.json(
        { error: error.issues[0].message },
        { status: 400 },
      );
    }
    log.error(error instanceof Error ? error : new Error(String(error)), {
      roomId,
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
