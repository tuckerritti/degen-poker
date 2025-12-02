import { NextResponse } from "next/server";
import { getAuthUser, getServiceClient } from "@/lib/supabase/server";
import { dealHandSchema } from "@/lib/validation/schemas";
import { z } from "zod";
import { logApiRoute } from "@/lib/logger";
import { dealHandLogic } from "@/lib/poker/deal-hand";

export async function POST(request: Request) {
  const log = logApiRoute("POST", "/api/game/deal-hand");

  try {
    const body = await request.json();
    log.start({ bodyKeys: Object.keys(body) });

    // Validation
    const validatedData = dealHandSchema.parse(body);
    const { roomId } = validatedData;
    const { user } = await getAuthUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = await getServiceClient();

    // Get room details
    const { data: room, error: roomError } = await supabase
      .from("rooms")
      .select("owner_auth_user_id, is_paused")
      .eq("id", roomId)
      .single();

    if (roomError || !room) {
      log.error(roomError || new Error("Room not found"), { roomId });
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    // Verify the requester is the room owner
    if (room.owner_auth_user_id !== user.id) {
      log.error(new Error("Unauthorized deal attempt"), {
        roomId,
        ownerUserId: room.owner_auth_user_id,
        requestUserId: user.id,
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

    // Call shared deal logic
    const { gameState } = await dealHandLogic(roomId, user.id);

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
