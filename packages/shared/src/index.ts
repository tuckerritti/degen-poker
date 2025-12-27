export const sharedVersion = "0.0.0";

// Constants
export {
  HAND_COMPLETE_DELAY_MS,
  HAND_COMPLETE_DELAY_321_MS,
} from "./constants";

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
  "partition",
  "showdown",
  "complete",
] as const;
export type GamePhase = (typeof GAME_PHASES)[number];

export const GAME_MODES = [
  "double_board_bomb_pot_plo",
  "texas_holdem",
  "indian_poker",
  "game_mode_321",
] as const;
export type GameMode = (typeof GAME_MODES)[number];

export interface CreateRoomPayload {
  // For PLO bomb pots, big blind acts as the ante; small blind may be 0.
  smallBlind?: number;
  bigBlind: number;
  minBuyIn: number;
  maxBuyIn: number;
  maxPlayers?: number;
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

export interface LeaveRequestPayload {
  seatNumber: number;
}

export interface PartitionSubmissionPayload {
  roomId: string;
  seatNumber: number;
  threeBoardCards: string[]; // 3 cards for 3-board
  twoBoardCards: string[]; // 2 cards for 2-board (PLO)
  oneBoardCard: string[]; // 1 card for 1-board
  authUserId?: string | null;
}

export interface BoardState {
  board1?: string[];
  board2?: string[];
  board3?: string[]; // For 321 mode
  player_partitions?: Record<
    string,
    {
      threeBoardCards: string[];
      twoBoardCards: string[];
      oneBoardCard: string[];
    }
  >;
}
