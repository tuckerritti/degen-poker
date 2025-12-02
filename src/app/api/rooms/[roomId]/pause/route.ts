import { NextResponse } from "next/server";
import { getServiceClient, getAuthUser } from "@/lib/supabase/server";
import { z } from "zod";
import { logApiRoute } from "@/lib/logger";

const pauseSchema = z.object({});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ roomId: string }> },
) {
  const log = logApiRoute("POST", "/api/rooms/[roomId]/pause");
  let roomId: string | undefined;

  try {
    roomId = (await params).roomId;
    const body = await request.json();
    log.start({ roomId, bodyKeys: Object.keys(body) });

    // Validation
    pauseSchema.parse(body);

    const { user } = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = await getServiceClient();

    // Get room and verify ownership
    const { data: room, error: roomError } = await supabase
      .from("rooms")
      .select("*")
      .eq("id", roomId)
      .single();

    if (roomError || !room) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    // Verify caller is the owner
    if (room.owner_auth_user_id !== user.id) {
      return NextResponse.json(
        { error: "Only the room owner can pause/unpause the game" },
        { status: 403 },
      );
    }

    // Check if there's an active hand
    const { data: gameState } = await supabase
      .from("game_states")
      .select("id")
      .eq("room_id", roomId)
      .maybeSingle();

    let updatedRoom;
    let updateError;

    if (gameState) {
      // If there's an active hand, toggle pause_after_hand
      const newPauseAfterHandState = !room.pause_after_hand;
      const result = await supabase
        .from("rooms")
        .update({ pause_after_hand: newPauseAfterHandState })
        .eq("id", roomId)
        .select()
        .single();
      updatedRoom = result.data;
      updateError = result.error;
    } else {
      // If there's no active hand, toggle is_paused immediately
      const newPauseState = !room.is_paused;
      const result = await supabase
        .from("rooms")
        .update({
          is_paused: newPauseState,
          // Clear pause_after_hand if unpausing
          pause_after_hand: newPauseState ? room.pause_after_hand : false,
        })
        .eq("id", roomId)
        .select()
        .single();
      updatedRoom = result.data;
      updateError = result.error;
    }

    if (updateError || !updatedRoom) {
      log.error(updateError || new Error("No room returned"), {
        roomId,
        userId: user.id,
      });
      return NextResponse.json(
        { error: updateError?.message || "Failed to update room" },
        { status: 500 },
      );
    }

    log.info(
      gameState
        ? `Pause ${updatedRoom.pause_after_hand ? "scheduled after hand" : "canceled"}`
        : `Game ${updatedRoom.is_paused ? "paused" : "unpaused"}`,
      {
        roomId,
        userId: user.id,
        isPaused: updatedRoom.is_paused,
        pauseAfterHand: updatedRoom.pause_after_hand,
        hasActiveHand: !!gameState,
      },
    );

    return NextResponse.json({ room: updatedRoom }, { status: 200 });
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
