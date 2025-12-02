import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase/server";
import { z } from "zod";
import { logApiRoute } from "@/lib/logger";

const createRoomSchema = z
  .object({
    sessionId: z.string().min(1, "Session ID is required"),
    smallBlind: z.number().positive("Small blind must be positive"),
    bigBlind: z.number().positive("Big blind must be positive"),
    minBuyIn: z.number().positive("Min buy-in must be positive"),
    maxBuyIn: z.number().positive("Max buy-in must be positive"),
  })
  .refine((data) => data.bigBlind > data.smallBlind, {
    message: "Big blind must be greater than small blind",
    path: ["bigBlind"],
  })
  .refine((data) => data.minBuyIn >= data.bigBlind * 20, {
    message: "Min buy-in must be at least 20x big blind",
    path: ["minBuyIn"],
  })
  .refine((data) => data.maxBuyIn > data.minBuyIn, {
    message: "Max buy-in must be greater than min buy-in",
    path: ["maxBuyIn"],
  });

export async function POST(request: Request) {
  const log = logApiRoute("POST", "/api/rooms/create");

  try {
    const body = await request.json();
    log.start({ bodyKeys: Object.keys(body) });

    // Validation
    const validatedData = createRoomSchema.parse(body);
    const { sessionId, smallBlind, bigBlind, minBuyIn, maxBuyIn } =
      validatedData;

    const supabase = await getServerClient();

    const { data: room, error } = await supabase
      .from("rooms")
      .insert({
        owner_session_id: sessionId,
        small_blind: smallBlind,
        big_blind: bigBlind,
        bomb_pot_ante: smallBlind * 2, // Default: 2x small blind
        min_buy_in: minBuyIn,
        max_buy_in: maxBuyIn,
        button_seat: null, // Will be set to owner's seat on first deal
        max_players: 8,
        is_active: true,
        current_hand_number: 0,
      })
      .select()
      .single();

    if (error) {
      log.error(error, { sessionId, smallBlind, bigBlind });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    log.success({
      roomId: room.id,
      sessionId,
      smallBlind,
      bigBlind,
      minBuyIn,
      maxBuyIn,
    });

    return NextResponse.json({ room }, { status: 201 });
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
