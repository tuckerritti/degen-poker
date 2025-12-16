export const sharedVersion = "0.0.0";

// Supabase enum mirrors
export const ACTION_TYPES = [
  "fold",
  "check",
  "call",
  "bet",
  "raise",
  "all_in",
] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

export const GAME_PHASES = [
  "waiting",
  "dealing",
  "preflop",
  "flop",
  "turn",
  "river",
  "showdown",
  "complete",
] as const;
export type GamePhase = (typeof GAME_PHASES)[number];

export const GAME_MODES = ["double_board_bomb_pot_plo", "texas_holdem"] as const;
export type GameMode = (typeof GAME_MODES)[number];

export interface CreateRoomPayload {
  smallBlind: number;
  bigBlind: number;
  minBuyIn: number;
  maxBuyIn: number;
  maxPlayers?: number;
  bombPotAnte?: number;
  interHandDelay?: number;
  pauseAfterHand?: boolean;
  ownerAuthUserId?: string | null;
  gameMode?: GameMode;
}

export interface JoinRoomPayload {
  roomId: string;
  seatNumber: number;
  displayName: string;
  buyIn: number;
  authUserId?: string | null;
}

export interface StartHandPayload {
  roomId: string;
  deckSeed?: string;
}

export interface ActionRequestPayload {
  roomId: string;
  seatNumber: number;
  actionType: ActionType;
  amount?: number;
  authUserId?: string | null;
  idempotencyKey?: string;
}

export interface ActionHistoryItem {
  seat_number: number;
  action_type: ActionType;
  amount?: number;
  timestamp: string;
}
