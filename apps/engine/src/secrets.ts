import { supabase } from "./supabase.js";
import type { GameStateSecret } from "./types.js";

export async function insertGameStateSecret(params: {
  game_state_id: string;
  deck_seed: string;
  full_board1: string[];
  full_board2: string[];
}): Promise<void> {
  const { error } = await supabase.from("game_state_secrets").insert(params);
  if (error) throw error;
}

export async function fetchGameStateSecret(
  game_state_id: string,
): Promise<GameStateSecret | null> {
  const { data, error } = await supabase
    .from("game_state_secrets")
    .select("*")
    .eq("game_state_id", game_state_id)
    .maybeSingle();
  if (error) throw error;
  return data as GameStateSecret | null;
}
