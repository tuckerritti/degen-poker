import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase/server";
import { z } from "zod";
import { logApiRoute } from "@/lib/logger";

const pauseSchema = z.object({
  sessionId: z.string().min(1, "Session ID is required"),
});

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
    const validatedData = pauseSchema.parse(body);
    const { sessionId } = validatedData;

    const supabase = await getServerClient();

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
    if (room.owner_session_id !== sessionId) {
      return NextResponse.json(
        { error: "Only the room owner can pause/unpause the game" },
        { status: 403 },
      );
    }

    // Toggle pause state
    const newPauseState = !room.is_paused;
    const { data: updatedRoom, error: updateError } = await supabase
      .from("rooms")
      .update({ is_paused: newPauseState })
      .eq("id", roomId)
      .select()
      .single();

    if (updateError) {
      log.error(updateError, { roomId, sessionId });
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    log.info(`Game ${updatedRoom.is_paused ? "paused" : "unpaused"}`, {
      roomId,
      sessionId,
      isPaused: updatedRoom.is_paused,
    });

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
