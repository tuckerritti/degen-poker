import { randomBytes } from "crypto";
import { ActionType, GamePhase } from "@poker/shared";
import { shuffleDeck, shuffleDoubleDeck, needsTwoDecks } from "./deck.js";
import type { GameStateRow, Room, RoomPlayer } from "./types.js";
import { compare, evaluate } from "@poker-apprentice/hand-evaluator";

export interface DealResult {
  gameState: Partial<GameStateRow>;
  playerHands: {
    seat_number: number;
    cards: string[];
    auth_user_id: string | null;
  }[];
  updatedPlayers: Partial<RoomPlayer>[];
  deckSeed: string;
  fullBoard1: string[];
  fullBoard2: string[];
  fullBoard3?: string[]; // For 321 mode
  usesTwoDecks: boolean; // Indicates if two decks were used
}

export function nextButtonSeat(
  players: RoomPlayer[],
  currentButton: number | null,
): number {
  if (players.length === 0) return 1;
  const seats = players.map((p) => p.seat_number).sort((a, b) => a - b);
  if (currentButton === null) return seats[0];
  const next = seats.find((s) => s > currentButton);
  return next ?? seats[0];
}

export function actionOrder(
  players: RoomPlayer[],
  buttonSeat: number,
): number[] {
  const activeSeats = players
    .filter(
      (p) =>
        !p.is_spectating &&
        !p.is_sitting_out &&
        !p.waiting_for_next_hand &&
        p.chip_stack > 0,
    )
    .map((p) => p.seat_number)
    .sort((a, b) => a - b);
  if (activeSeats.length === 0) return [];
  const afterButton = activeSeats.filter((s) => s > buttonSeat);
  const beforeButton = activeSeats.filter((s) => s <= buttonSeat);
  return [...afterButton, ...beforeButton];
}

/**
 * Convert player hands to visible cards map for Indian Poker during active play
 * Excludes each player's own card for security (client should not see own card)
 * @param playerHands Array of player hands with seat numbers and cards
 * @returns Map of seat number to visible cards (other players' cards only)
 */
export function getVisibleCardsForActivePlayers(
  playerHands: Array<{ seat_number: number; cards: string[] }>,
): Record<string, string[]> {
  // During active play, each player sees all OTHER players' cards
  // For now, show all cards - frontend will filter own card
  // TODO: Implement per-player filtering on server side for enhanced security
  return Object.fromEntries(
    playerHands.map((h) => [h.seat_number.toString(), h.cards]),
  );
}

/**
 * Convert all player hands to visible cards map for Indian Poker at showdown
 * Shows all cards including each player's own card
 * @param playerHands Array of player hands with seat numbers and cards
 * @returns Map of seat number to visible cards (all cards visible)
 */
export function revealAllCardsAtShowdown(
  playerHands: Array<{ seat_number: number; cards: string[] }>,
): Record<string, string[]> {
  return Object.fromEntries(
    playerHands.map((h) => [h.seat_number.toString(), h.cards]),
  );
}

interface BlindPostingResult {
  updatedPlayers: Partial<RoomPlayer>[];
  totalPosted: number;
  currentBet: number;
  sbSeat: number | null;
  bbSeat: number | null;
}

export function postBlinds(
  players: RoomPlayer[],
  buttonSeat: number,
  smallBlind: number,
  bigBlind: number,
): BlindPostingResult {
  const activePlayers = players.filter(
    (p) =>
      !p.is_spectating &&
      !p.is_sitting_out &&
      !p.waiting_for_next_hand &&
      p.chip_stack > 0,
  );

  const order = actionOrder(activePlayers, buttonSeat);

  // Handle heads-up (2 players): button posts BB, other player posts SB
  const isHeadsUp = activePlayers.length === 2;

  let sbSeat: number | null = null;
  let bbSeat: number | null = null;
  let totalPosted = 0;
  const updatedPlayers: Partial<RoomPlayer>[] = [];

  if (isHeadsUp) {
    // Heads-up: first after button is small blind, button is big blind
    sbSeat = order[0]; // First after button (wraps)
    bbSeat = buttonSeat;
  } else {
    // Normal: first after button is SB, second after button is BB
    sbSeat = order[0];
    bbSeat = order[1];
  }

  // Post small blind
  if (sbSeat !== null) {
    const sbPlayer = players.find((p) => p.seat_number === sbSeat);
    if (sbPlayer) {
      const sbAmount = Math.min(sbPlayer.chip_stack, smallBlind);
      const remaining = sbPlayer.chip_stack - sbAmount;
      updatedPlayers.push({
        id: sbPlayer.id,
        room_id: sbPlayer.room_id,
        seat_number: sbPlayer.seat_number,
        auth_user_id: sbPlayer.auth_user_id,
        display_name: sbPlayer.display_name,
        total_buy_in: sbPlayer.total_buy_in,
        chip_stack: remaining,
        total_invested_this_hand: sbAmount,
        current_bet: sbAmount,
        has_folded: false,
        is_all_in: remaining === 0,
      });
      sbPlayer.chip_stack = remaining;
      sbPlayer.current_bet = sbAmount;
      sbPlayer.total_invested_this_hand = sbAmount;
      if (remaining === 0) sbPlayer.is_all_in = true;
      totalPosted += sbAmount;
    }
  }

  // Post big blind
  if (bbSeat !== null) {
    const bbPlayer = players.find((p) => p.seat_number === bbSeat);
    if (bbPlayer) {
      const bbAmount = Math.min(bbPlayer.chip_stack, bigBlind);
      const remaining = bbPlayer.chip_stack - bbAmount;
      updatedPlayers.push({
        id: bbPlayer.id,
        room_id: bbPlayer.room_id,
        seat_number: bbPlayer.seat_number,
        auth_user_id: bbPlayer.auth_user_id,
        display_name: bbPlayer.display_name,
        total_buy_in: bbPlayer.total_buy_in,
        chip_stack: remaining,
        total_invested_this_hand: bbAmount,
        current_bet: bbAmount,
        has_folded: false,
        is_all_in: remaining === 0,
      });
      bbPlayer.chip_stack = remaining;
      bbPlayer.current_bet = bbAmount;
      bbPlayer.total_invested_this_hand = bbAmount;
      if (remaining === 0) bbPlayer.is_all_in = true;
      totalPosted += bbAmount;
    }
  }

  return {
    updatedPlayers,
    totalPosted,
    currentBet: bigBlind,
    sbSeat,
    bbSeat,
  };
}

// dealBoards function was previously used for PLO; now boards are dealt inline in dealHand()
// Kept for reference but unused after refactoring for multi-game mode support
// function dealBoards(deck: Card[]): { board1: Card[]; board2: Card[]; remaining: Card[] } {
//   const board1 = deck.slice(0, 5);
//   const board2 = deck.slice(5, 10);
//   const remaining = deck.slice(10);
//   return { board1, board2, remaining };
// }

export function dealHand(room: Room, players: RoomPlayer[]): DealResult {
  // Generate a cryptographically strong, non-guessable seed and never expose it to clients
  const deckSeed = randomBytes(32).toString("hex");

  // Activate players who were waiting for next hand
  const waitingPlayers = players.filter((p) => p.waiting_for_next_hand);
  const activatedPlayers: Partial<RoomPlayer>[] = waitingPlayers.map((p) => ({
    id: p.id,
    room_id: p.room_id,
    seat_number: p.seat_number,
    auth_user_id: p.auth_user_id,
    display_name: p.display_name,
    total_buy_in: p.total_buy_in,
    chip_stack: p.chip_stack,
    waiting_for_next_hand: false,
    total_invested_this_hand: 0,
    current_bet: 0,
    has_folded: false,
    is_all_in: false,
  }));

  // Update local player state for subsequent logic
  waitingPlayers.forEach((p) => {
    p.waiting_for_next_hand = false;
  });

  const activePlayers = players.filter(
    (p) =>
      !p.is_spectating &&
      !p.is_sitting_out &&
      !p.waiting_for_next_hand &&
      p.chip_stack > 0,
  );

  // Determine game mode configuration
  const isHoldem = room.game_mode === "texas_holdem";
  const isIndianPoker = room.game_mode === "indian_poker";
  const is321 = room.game_mode === "game_mode_321";

  let cardsPerPlayer: number;
  let totalBoardCards: number;

  if (is321) {
    cardsPerPlayer = 6;
    totalBoardCards = 15; // 3 boards × 5 cards
  } else if (isIndianPoker) {
    cardsPerPlayer = 1;
    totalBoardCards = 0; // No boards for Indian Poker
  } else if (isHoldem) {
    cardsPerPlayer = 2;
    totalBoardCards = 5;
  } else {
    // Default to PLO
    cardsPerPlayer = 4;
    totalBoardCards = 10; // 2 boards × 5 cards
  }

  // Check if two decks are needed and shuffle accordingly
  const usesTwoDecks = needsTwoDecks(
    activePlayers.length,
    cardsPerPlayer,
    totalBoardCards,
  );
  const deck = usesTwoDecks
    ? shuffleDoubleDeck(deckSeed)
    : shuffleDeck(deckSeed);

  // Deal hole cards
  let cursor = 0;
  const playerHands = activePlayers.map((p) => {
    const cards = deck.slice(cursor, cursor + cardsPerPlayer);
    cursor += cardsPerPlayer;
    return { seat_number: p.seat_number, cards, auth_user_id: p.auth_user_id };
  });

  // Deal boards
  const board1 = isIndianPoker ? [] : deck.slice(cursor, cursor + 5);
  cursor += isIndianPoker ? 0 : 5;
  let board2: string[];
  let board3: string[] | undefined;

  if (is321) {
    board2 = deck.slice(cursor, cursor + 5);
    cursor += 5;
    board3 = deck.slice(cursor, cursor + 5);
  } else if (isHoldem || isIndianPoker) {
    board2 = [];
  } else {
    board2 = deck.slice(cursor, cursor + 5);
  }
  const buttonSeat = nextButtonSeat(activePlayers, room.button_seat);
  let updatedPlayers: Partial<RoomPlayer>[] = [];
  let totalPot = 0;
  let currentBet = 0;
  let seatsToAct: number[] = [];
  let currentActor: number | null = null;

  if (isHoldem) {
    // Post blinds for Texas Hold'em
    const blindResult = postBlinds(
      activePlayers,
      buttonSeat,
      room.small_blind,
      room.big_blind,
    );
    updatedPlayers = blindResult.updatedPlayers;
    totalPot = blindResult.totalPosted;
    currentBet = blindResult.currentBet;

    // For preflop, action starts first after big blind (UTG)
    const order = actionOrder(activePlayers, buttonSeat);
    // Skip small blind and big blind to find UTG
    const isHeadsUp = activePlayers.length === 2;

    seatsToAct = isHeadsUp
      ? order.filter(
          (s) => !updatedPlayers.find((p) => p.seat_number === s)?.is_all_in,
        )
      : order
          .slice(2)
          .concat(order.slice(0, 2))
          .filter(
            (s) => !updatedPlayers.find((p) => p.seat_number === s)?.is_all_in,
          );
    currentActor = seatsToAct[0] ?? null;
  } else {
    // Post antes for PLO/Indian Poker bomb pots: big blind value is the ante
    const ante = room.big_blind;
    updatedPlayers = activePlayers.map((p) => {
      const antePaid = Math.min(p.chip_stack, ante);
      const remaining = p.chip_stack - antePaid;
      return {
        id: p.id,
        room_id: p.room_id,
        seat_number: p.seat_number,
        auth_user_id: p.auth_user_id,
        display_name: p.display_name,
        total_buy_in: p.total_buy_in,
        chip_stack: remaining,
        total_invested_this_hand: antePaid,
        current_bet: antePaid,
        has_folded: false,
        is_all_in: remaining === 0,
      } as Partial<RoomPlayer>;
    });

    totalPot = updatedPlayers.reduce(
      (sum, p) => sum + (p.total_invested_this_hand ?? 0),
      0,
    );
    currentBet = ante > 0 ? ante : 0;
    const order = actionOrder(activePlayers, buttonSeat);
    seatsToAct = order.filter(
      (s) => !updatedPlayers.find((p) => p.seat_number === s)?.is_all_in,
    );
    currentActor = seatsToAct[0] ?? null;
  }

  const initialPhase = isHoldem ? "preflop" : "flop";

  // Build board state based on game mode
  let initialBoardState:
    | {
        board1: string[];
        board2: string[];
        board3?: string[];
        visible_player_cards?: Record<string, string[]>;
      }
    | {
        board1: string[];
        board2: string[];
        visible_player_cards?: Record<string, string[]>;
      };
  if (isIndianPoker) {
    initialBoardState = {
      board1: [],
      board2: [],
      visible_player_cards: getVisibleCardsForActivePlayers(playerHands),
    }; // Indian Poker: all cards visible during active play, frontend filters own card
  } else if (isHoldem) {
    initialBoardState = { board1: [], board2: [] }; // No cards shown preflop
  } else if (is321) {
    initialBoardState = {
      board1: board1.slice(0, 3),
      board2: board2.slice(0, 3),
      board3: board3!.slice(0, 3),
    }; // Show 3 cards on each of 3 boards for 321
  } else {
    initialBoardState = {
      board1: board1.slice(0, 3),
      board2: board2.slice(0, 3),
    }; // Show 3 cards on flop for PLO
  }

  const gameState: Partial<GameStateRow> = {
    room_id: room.id,
    hand_number: room.current_hand_number + 1,
    deck_seed: "hidden",
    button_seat: buttonSeat,
    phase: initialPhase,
    pot_size: totalPot,
    current_bet: currentBet,
    min_raise: room.big_blind,
    current_actor_seat: currentActor,
    last_aggressor_seat: null,
    last_raise_amount: null,
    action_deadline_at: null,
    action_reopened_to: null,
    seats_to_act: seatsToAct,
    seats_acted: [],
    burned_card_indices: [],
    board_state: initialBoardState,
    side_pots: [],
    action_history: [],
  };

  const mergedUpdatedPlayers = new Map<string, Partial<RoomPlayer>>();
  activatedPlayers.forEach((p) => {
    if (!p.id) return;
    mergedUpdatedPlayers.set(p.id, { ...p });
  });
  updatedPlayers.forEach((p) => {
    if (!p.id) return;
    const existing = mergedUpdatedPlayers.get(p.id);
    mergedUpdatedPlayers.set(p.id, existing ? { ...existing, ...p } : { ...p });
  });

  return {
    gameState,
    playerHands,
    updatedPlayers: Array.from(mergedUpdatedPlayers.values()),
    deckSeed,
    fullBoard1: board1,
    fullBoard2: board2,
    fullBoard3: board3,
    usesTwoDecks,
  };
}

export interface ActionContext {
  room: Room;
  players: RoomPlayer[];
  gameState: GameStateRow;
  fullBoard1: string[];
  fullBoard2: string[];
  fullBoard3?: string[]; // For 321 mode
  playerHands?: Array<{ seat_number: number; cards: string[] }>; // Optional: only needed for Indian Poker showdown
  playerPartitions?: Array<{
    seat_number: number;
    three_board_cards: unknown;
    two_board_cards: unknown;
    one_board_card: unknown;
  }>; // Optional: only needed for 321 mode showdown
}

export interface ActionOutcome {
  updatedGameState: Partial<GameStateRow>;
  updatedPlayers: Partial<RoomPlayer>[];
  handCompleted: boolean;
  autoWinners?: number[];
  potAwarded?: number;
  error?: string;
}

function activeNonFolded(players: RoomPlayer[]): RoomPlayer[] {
  return players.filter(
    (p) =>
      !p.has_folded &&
      !p.is_spectating &&
      !p.is_sitting_out &&
      !p.waiting_for_next_hand &&
      p.chip_stack >= 0,
  );
}

function rotateAfter(seats: number[], current: number): number[] {
  const idx = seats.indexOf(current);
  if (idx === -1) return seats;
  const after = seats.slice(idx + 1);
  const before = seats.slice(0, idx);
  return [...after, ...before];
}

export function applyAction(
  ctx: ActionContext,
  seatNumber: number,
  actionType: ActionType,
  amount?: number,
): ActionOutcome {
  const {
    gameState,
    players,
    room,
    fullBoard1,
    fullBoard2,
    fullBoard3,
    playerPartitions,
  } = ctx;

  if (
    gameState.current_actor_seat !== seatNumber &&
    gameState.phase !== "showdown"
  ) {
    return {
      updatedGameState: {},
      updatedPlayers: [],
      handCompleted: false,
      error: "Not your turn",
    };
  }

  const player = players.find((p) => p.seat_number === seatNumber);
  if (!player) {
    return {
      updatedGameState: {},
      updatedPlayers: [],
      handCompleted: false,
      error: "Seat not found",
    };
  }

  if (
    player.has_folded ||
    player.is_spectating ||
    player.is_sitting_out ||
    player.waiting_for_next_hand
  ) {
    return {
      updatedGameState: {},
      updatedPlayers: [],
      handCompleted: false,
      error: "Player cannot act",
    };
  }

  let pot = gameState.pot_size ?? 0;
  let currentBet = gameState.current_bet ?? 0;
  const baseBet = room.big_blind;
  let minRaise = gameState.min_raise ?? baseBet;
  const updatedPlayers: Partial<RoomPlayer>[] = [];
  let seatsToAct = [...(gameState.seats_to_act ?? [])];
  let seatsActed = [...(gameState.seats_acted ?? [])];
  let phase: GamePhase = gameState.phase;
  const actionHistory = Array.isArray(gameState.action_history)
    ? [...(gameState.action_history as unknown[])]
    : [];
  const boardState =
    (gameState.board_state as {
      board1?: string[];
      board2?: string[];
    }) ?? {};

  const markActed = () => {
    seatsToAct = seatsToAct.filter((s) => s !== seatNumber);
    if (!seatsActed.includes(seatNumber)) seatsActed.push(seatNumber);
  };

  const invest = (chipAmount: number) => {
    const investAmount = Math.min(player.chip_stack, chipAmount);
    pot += investAmount;
    const newStack = player.chip_stack - investAmount;
    const newCurrentBet = (player.current_bet ?? 0) + investAmount;
    updatedPlayers.push({
      id: player.id,
      room_id: player.room_id,
      seat_number: player.seat_number,
      auth_user_id: player.auth_user_id,
      display_name: player.display_name,
      total_buy_in: player.total_buy_in,
      chip_stack: newStack,
      current_bet: newCurrentBet,
      total_invested_this_hand:
        (player.total_invested_this_hand ?? 0) + investAmount,
      is_all_in: newStack === 0,
    });
    player.chip_stack = newStack;
    player.current_bet = newCurrentBet;
    player.total_invested_this_hand =
      (player.total_invested_this_hand ?? 0) + investAmount;
    if (newStack === 0) player.is_all_in = true;
  };

  switch (actionType) {
    case "fold": {
      updatedPlayers.push({
        id: player.id,
        room_id: player.room_id,
        seat_number: player.seat_number,
        auth_user_id: player.auth_user_id,
        display_name: player.display_name,
        total_buy_in: player.total_buy_in,
        chip_stack: player.chip_stack,
        has_folded: true,
      });
      player.has_folded = true;
      markActed();
      break;
    }
    case "check": {
      if ((gameState.current_bet ?? 0) !== (player.current_bet ?? 0)) {
        return {
          updatedGameState: {},
          updatedPlayers: [],
          handCompleted: false,
          error: "Cannot check facing bet",
        };
      }
      markActed();
      break;
    }
    case "call": {
      const diff = (gameState.current_bet ?? 0) - (player.current_bet ?? 0);
      if (diff <= 0) {
        return {
          updatedGameState: {},
          updatedPlayers: [],
          handCompleted: false,
          error: "Nothing to call",
        };
      }
      invest(diff);
      markActed();
      break;
    }
    case "bet": {
      if (currentBet > 0) {
        return {
          updatedGameState: {},
          updatedPlayers: [],
          handCompleted: false,
          error: "Bet not allowed after bet",
        };
      }
      if (!amount || amount <= 0) {
        return {
          updatedGameState: {},
          updatedPlayers: [],
          handCompleted: false,
          error: "Bet amount required",
        };
      }
      currentBet = amount;
      minRaise = amount;
      invest(amount);
      seatsToAct = rotateAfter(
        actionOrder(players, gameState.button_seat),
        seatNumber,
      ).filter(
        (s) =>
          s !== seatNumber &&
          !players.find((p) => p.seat_number === s)?.has_folded,
      );
      seatsActed = [];
      break;
    }
    case "raise":
    case "all_in": {
      if (currentBet === 0 && actionType === "raise") {
        return {
          updatedGameState: {},
          updatedPlayers: [],
          handCompleted: false,
          error: "No bet to raise",
        };
      }
      const targetAmount =
        actionType === "all_in"
          ? (player.current_bet ?? 0) + player.chip_stack
          : (amount ?? 0);
      // Short-stack all-ins are allowed to call for less; only enforce raise rules when the all-in exceeds the current bet.
      const isAllInRaise = actionType === "all_in" && targetAmount > currentBet;
      if (actionType !== "all_in" && targetAmount <= currentBet) {
        return {
          updatedGameState: {},
          updatedPlayers: [],
          handCompleted: false,
          error: "Raise must exceed current bet",
        };
      }
      if (actionType === "all_in" && !isAllInRaise) {
        // Treat as a call for less; keep table currentBet/minRaise unchanged.
        invest(targetAmount - (player.current_bet ?? 0));
        markActed();
        break;
      }
      const raiseAmount = targetAmount - currentBet;
      if (raiseAmount < minRaise && actionType !== "all_in") {
        return {
          updatedGameState: {},
          updatedPlayers: [],
          handCompleted: false,
          error: "Raise below minimum",
        };
      }
      invest(targetAmount - (player.current_bet ?? 0));
      currentBet = targetAmount;
      minRaise = raiseAmount;
      seatsToAct = rotateAfter(
        actionOrder(players, gameState.button_seat),
        seatNumber,
      ).filter(
        (s) =>
          s !== seatNumber &&
          !players.find((p) => p.seat_number === s)?.has_folded,
      );
      seatsActed = [];
      break;
    }
    default:
      return {
        updatedGameState: {},
        updatedPlayers: [],
        handCompleted: false,
        error: "Unknown action",
      };
  }

  actionHistory.push({
    seat_number: seatNumber,
    action_type: actionType,
    amount,
    timestamp: new Date().toISOString(),
  });

  const activeSeats = activeNonFolded(players).map((p) => p.seat_number);

  // If only one player remains (everyone else folded), hand ends immediately
  if (activeSeats.length === 1) {
    // Calculate side pots with updated player state
    const mergedPlayers = players.map((p) => {
      const updated = updatedPlayers.find((u) => u.id === p.id);
      return updated ? { ...p, ...updated } : p;
    });
    const calculatedSidePots = calculateSidePots(mergedPlayers as RoomPlayer[]);

    return {
      updatedGameState: {
        phase: "complete",
        current_actor_seat: null,
        seats_to_act: [],
        seats_acted: activeSeats,
        action_history: actionHistory,
        pot_size: pot,
        side_pots: calculatedSidePots,
      },
      updatedPlayers,
      handCompleted: true,
      autoWinners: activeSeats,
      potAwarded: pot,
    };
  }

  // Street completion: if no seats left to act and all bets are matched
  const awaiting = seatsToAct.length;
  const allBetsEqual = players.every(
    (p) =>
      p.has_folded ||
      p.is_spectating ||
      p.is_sitting_out ||
      p.waiting_for_next_hand ||
      (p.current_bet ?? 0) === currentBet ||
      p.is_all_in,
  );

  let currentActor: number | null = seatsToAct[0] ?? null;

  if (awaiting === 0 && allBetsEqual) {
    const activeNonFoldedPlayers = players.filter(
      (p) =>
        !p.has_folded &&
        !p.is_spectating &&
        !p.is_sitting_out &&
        !p.waiting_for_next_hand,
    );
    const nonAllInCount = activeNonFoldedPlayers.filter(
      (p) => !p.is_all_in,
    ).length;

    // Debug aid for street-closing logic; keep disabled in production
    // console.log('street-closure', { nonAllInCount, awaiting, allBetsEqual });

    const isIndianPoker = room.game_mode === "indian_poker";

    // Indian Poker: single betting round only, go straight to complete
    if (isIndianPoker) {
      const calculatedSidePotsFinal = calculateSidePots(
        activeNonFoldedPlayers as RoomPlayer[],
      );

      // SECURITY: Reveal all player cards at showdown
      const updatedBoardState = {
        ...boardState,
        visible_player_cards: ctx.playerHands
          ? revealAllCardsAtShowdown(ctx.playerHands)
          : {},
      };

      return {
        updatedGameState: {
          phase: "complete",
          current_actor_seat: null,
          seats_to_act: [],
          seats_acted: activeSeats,
          action_history: [...actionHistory],
          current_bet: currentBet,
          pot_size: pot,
          board_state: updatedBoardState,
          side_pots: calculatedSidePotsFinal,
        },
        updatedPlayers,
        handCompleted: true,
      };
    }

    // If no more betting action is possible (0 or 1 non-all-in players remaining),
    // fast-forward to showdown/complete and reveal all community cards.
    if (nonAllInCount <= 1) {
      const isHoldem = room.game_mode === "texas_holdem";
      const is321 = room.game_mode === "game_mode_321";
      const updatedBoardState = {
        board1: fullBoard1.slice(0, 5),
        board2: isHoldem ? [] : fullBoard2.slice(0, 5),
        board3: is321 && fullBoard3 ? fullBoard3.slice(0, 5) : undefined,
        fullBoard1: fullBoard1,
        fullBoard2: isHoldem ? [] : fullBoard2,
        fullBoard3: is321 && fullBoard3 ? fullBoard3 : undefined,
      };

      const calculatedSidePotsFinal = calculateSidePots(
        activeNonFoldedPlayers as RoomPlayer[],
      );

      // In 321 mode we must still collect partitions before showdown.
      if (is321) {
        return {
          updatedGameState: {
            phase: "partition",
            current_actor_seat: null,
            seats_to_act: [],
            seats_acted: activeSeats,
            action_history: [...actionHistory],
            current_bet: currentBet,
            pot_size: pot,
            board_state: updatedBoardState,
            side_pots: calculatedSidePotsFinal,
          },
          updatedPlayers,
          handCompleted: false,
        };
      }

      return {
        updatedGameState: {
          phase: "complete",
          current_actor_seat: null,
          seats_to_act: [],
          seats_acted: activeSeats,
          action_history: [...actionHistory],
          current_bet: currentBet,
          pot_size: pot,
          board_state: updatedBoardState,
          side_pots: calculatedSidePotsFinal,
        },
        updatedPlayers,
        handCompleted: true,
        autoWinners: activeSeats,
        potAwarded: pot,
      };
    }

    // advance phase
    const nextPhase = advancePhase(phase, room.game_mode);
    phase = nextPhase;
    seatsActed = [];
    seatsToAct = [];
    currentActor = null;

    if (
      nextPhase !== "complete" &&
      nextPhase !== "showdown" &&
      nextPhase !== "partition"
    ) {
      // reset bets for the new street
      players.forEach((p) => {
        updatedPlayers.push({
          id: p.id,
          room_id: p.room_id,
          seat_number: p.seat_number,
          auth_user_id: p.auth_user_id,
          display_name: p.display_name,
          total_buy_in: p.total_buy_in,
          chip_stack: p.chip_stack,
          current_bet: 0,
          total_invested_this_hand: p.total_invested_this_hand,
          waiting_for_next_hand: p.waiting_for_next_hand,
        });
        p.current_bet = 0;
      });
      currentBet = 0;
      minRaise = room.big_blind;
      const order = actionOrder(players, gameState.button_seat);
      seatsToAct = order.filter((s) => {
        const pl = players.find((p) => p.seat_number === s);
        return (
          pl &&
          !pl.has_folded &&
          !pl.is_all_in &&
          !pl.is_sitting_out &&
          !pl.is_spectating &&
          !pl.waiting_for_next_hand
        );
      });
      currentActor = seatsToAct[0] ?? null;
    }

    // For partition phase in 321 mode, no current actor (waiting for all players to submit)
    if (nextPhase === "partition") {
      currentActor = null;
      seatsToAct = [];
    }

    // Reveal next community cards based on phase progression
    const updatedBoardState: {
      board1?: string[];
      board2?: string[];
      board3?: string[];
      fullBoard1?: string[];
      fullBoard2?: string[];
      fullBoard3?: string[];
      revealed_partitions?: Record<
        number,
        {
          three_board_cards: string[];
          two_board_cards: string[];
          one_board_card: string[];
        }
      >;
    } = { ...boardState };

    const isHoldem = room.game_mode === "texas_holdem";
    const is321 = room.game_mode === "game_mode_321";

    if (nextPhase === "flop") {
      // Flop: reveal 3 cards (only for Hold'em when transitioning from preflop)
      updatedBoardState.board1 = fullBoard1.slice(0, 3);
      updatedBoardState.board2 = isHoldem ? [] : fullBoard2.slice(0, 3);
      if (is321 && fullBoard3) {
        updatedBoardState.board3 = fullBoard3.slice(0, 3);
      }
      if (!isHoldem) {
        updatedBoardState.fullBoard1 = fullBoard1;
        updatedBoardState.fullBoard2 = fullBoard2;
        if (is321 && fullBoard3) {
          updatedBoardState.fullBoard3 = fullBoard3;
        }
      }
    } else if (nextPhase === "turn") {
      // Turn: reveal 4 cards
      updatedBoardState.board1 = fullBoard1.slice(0, 4);
      updatedBoardState.board2 = isHoldem ? [] : fullBoard2.slice(0, 4);
      if (is321 && fullBoard3) {
        updatedBoardState.board3 = fullBoard3.slice(0, 4);
      }
      if (!isHoldem) {
        updatedBoardState.fullBoard1 = fullBoard1;
        updatedBoardState.fullBoard2 = fullBoard2;
        if (is321 && fullBoard3) {
          updatedBoardState.fullBoard3 = fullBoard3;
        }
      }
    } else if (nextPhase === "river") {
      // River: reveal all 5 cards
      updatedBoardState.board1 = fullBoard1.slice(0, 5);
      updatedBoardState.board2 = isHoldem ? [] : fullBoard2.slice(0, 5);
      if (is321 && fullBoard3) {
        updatedBoardState.board3 = fullBoard3.slice(0, 5);
      }
      if (!isHoldem) {
        updatedBoardState.fullBoard1 = fullBoard1;
        updatedBoardState.fullBoard2 = fullBoard2;
        if (is321 && fullBoard3) {
          updatedBoardState.fullBoard3 = fullBoard3;
        }
      }
    } else if (nextPhase === "partition") {
      // Partition phase (321 mode only): all boards fully revealed, waiting for partitions
      updatedBoardState.board1 = fullBoard1.slice(0, 5);
      updatedBoardState.board2 = fullBoard2.slice(0, 5);
      if (fullBoard3) {
        updatedBoardState.board3 = fullBoard3.slice(0, 5);
      }
      updatedBoardState.fullBoard1 = fullBoard1;
      updatedBoardState.fullBoard2 = fullBoard2;
      if (fullBoard3) {
        updatedBoardState.fullBoard3 = fullBoard3;
      }
    } else if (nextPhase === "showdown" || nextPhase === "complete") {
      // Showdown: reveal all 5 cards
      updatedBoardState.board1 = fullBoard1.slice(0, 5);
      updatedBoardState.board2 = isHoldem ? [] : fullBoard2.slice(0, 5);
      if (is321 && fullBoard3) {
        updatedBoardState.board3 = fullBoard3.slice(0, 5);
      }
      updatedBoardState.fullBoard1 = fullBoard1;
      updatedBoardState.fullBoard2 = fullBoard2;
      if (is321 && fullBoard3) {
        updatedBoardState.fullBoard3 = fullBoard3;
      }

      // For 321 mode, reveal all player partitions at showdown
      if (is321 && playerPartitions) {
        const revealedPartitions: Record<
          number,
          {
            three_board_cards: string[];
            two_board_cards: string[];
            one_board_card: string[];
          }
        > = {};

        for (const partition of playerPartitions) {
          revealedPartitions[partition.seat_number] = {
            three_board_cards:
              partition.three_board_cards as unknown as string[],
            two_board_cards: partition.two_board_cards as unknown as string[],
            one_board_card: partition.one_board_card as unknown as string[],
          };
        }

        updatedBoardState.revealed_partitions = revealedPartitions;
      }
    }

    // When hand reaches showdown, determine winners
    let autoWinners: number[] | undefined = undefined;
    let potAwarded: number | undefined = undefined;

    if (nextPhase === "showdown" || nextPhase === "complete") {
      // For now: split pot equally among all non-folded players
      // TODO: Implement proper PLO hand evaluation
      const activePlayers = players.filter(
        (p) =>
          !p.has_folded &&
          !p.is_spectating &&
          !p.is_sitting_out &&
          !p.waiting_for_next_hand,
      );
      autoWinners = activePlayers.map((p) => p.seat_number);
      potAwarded = pot;
    }

    if (nextPhase === "showdown" || nextPhase === "complete") {
      // Calculate side pots with updated player state
      const mergedPlayers = players.map((p) => {
        const updated = updatedPlayers.find((u) => u.id === p.id);
        return updated ? { ...p, ...updated } : p;
      });
      const calculatedSidePots = calculateSidePots(
        mergedPlayers as RoomPlayer[],
      );

      return {
        updatedGameState: {
          phase,
          current_actor_seat: currentActor,
          seats_to_act: seatsToAct,
          seats_acted: seatsActed,
          action_history: actionHistory,
          current_bet: currentBet,
          pot_size: pot,
          board_state: updatedBoardState,
          side_pots: calculatedSidePots,
        },
        updatedPlayers,
        handCompleted: true,
        autoWinners,
        potAwarded,
      };
    }

    // Return for turn/river street advancement
    // Calculate side pots with updated player state
    const mergedPlayers = players.map((p) => {
      const updated = updatedPlayers.find((u) => u.id === p.id);
      return updated ? { ...p, ...updated } : p;
    });
    const calculatedSidePots = calculateSidePots(mergedPlayers as RoomPlayer[]);

    return {
      updatedGameState: {
        phase,
        pot_size: pot,
        current_bet: currentBet,
        min_raise: minRaise,
        current_actor_seat: currentActor,
        seats_to_act: seatsToAct,
        seats_acted: seatsActed,
        action_history: actionHistory,
        last_aggressor_seat: gameState.last_aggressor_seat,
        last_raise_amount: gameState.last_raise_amount,
        board_state: updatedBoardState,
        side_pots: calculatedSidePots,
      },
      updatedPlayers,
      handCompleted: false,
    };
  }

  // Calculate side pots after action is applied
  const mergedPlayers = players.map((p) => {
    const updated = updatedPlayers.find((u) => u.id === p.id);
    return updated ? { ...p, ...updated } : p;
  });
  const calculatedSidePots = calculateSidePots(mergedPlayers as RoomPlayer[]);

  return {
    updatedGameState: {
      phase,
      pot_size: pot,
      current_bet: currentBet,
      min_raise: minRaise,
      current_actor_seat: currentActor,
      seats_to_act: seatsToAct,
      seats_acted: seatsActed,
      action_history: actionHistory,
      last_aggressor_seat:
        actionType === "bet" ||
        actionType === "raise" ||
        actionType === "all_in"
          ? seatNumber
          : gameState.last_aggressor_seat,
      last_raise_amount:
        actionType === "bet" ||
        actionType === "raise" ||
        actionType === "all_in"
          ? currentBet
          : gameState.last_raise_amount,
      board_state: { ...boardState },
      side_pots: calculatedSidePots,
    },
    updatedPlayers,
    handCompleted: false,
  };
}

export function advancePhase(current: GamePhase, gameMode: string): GamePhase {
  // Different phase progression for 321 mode (includes partition phase)
  if (gameMode === "game_mode_321") {
    const order: GamePhase[] = [
      "flop",
      "turn",
      "river",
      "partition",
      "showdown",
      "complete",
    ];
    const idx = order.indexOf(current);
    if (idx === -1 || idx === order.length - 1) return "complete";
    return order[idx + 1];
  }

  // Standard progression for other modes
  const order: GamePhase[] = [
    "preflop",
    "flop",
    "turn",
    "river",
    "showdown",
    "complete",
  ];
  const idx = order.indexOf(current);
  if (idx === -1 || idx === order.length - 1) return "complete";
  return order[idx + 1];
}

/**
 * Return true if any rank appears more than 4 times in the 5-card hand.
 * This guards against 5-of-a-kind in two-deck games, which the evaluator
 * does not rank properly.
 */
function hasRankCountOver4(cards: string[]): boolean {
  const counts = new Map<string, number>();
  for (const card of cards) {
    const rank = card[0];
    counts.set(rank, (counts.get(rank) ?? 0) + 1);
    if ((counts.get(rank) ?? 0) > 4) return true;
  }
  return false;
}

function combinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (k > arr.length) return [];
  const result: T[][] = [];
  const indices = Array.from({ length: k }, (_, i) => i);
  const last = arr.length - 1;

  while (true) {
    result.push(indices.map((i) => arr[i]));
    let i = k - 1;
    while (i >= 0 && indices[i] === last - (k - 1 - i)) {
      i -= 1;
    }
    if (i < 0) break;
    indices[i] += 1;
    for (let j = i + 1; j < k; j += 1) {
      indices[j] = indices[j - 1] + 1;
    }
  }

  return result;
}

function evaluateWithConstraints(
  holeCards: string[],
  board: string[],
  minimumHoleCards: number,
  maximumHoleCards: number,
): { strength: number; hand: string[] } {
  const totalCards = holeCards.length + board.length;
  if (totalCards === 0) return { strength: 0, hand: [] };

  const minHole = Math.max(0, minimumHoleCards);
  const maxHole = Math.min(maximumHoleCards, holeCards.length, 5);
  if (minHole > maxHole) return { strength: 0, hand: [] };

  // Fast path when there aren't enough cards to form a 5-card hand.
  if (totalCards < 5) {
    try {
      const evaluated = evaluate({
        holeCards: holeCards as unknown as Parameters<
          typeof evaluate
        >[0]["holeCards"],
        communityCards: board as unknown as Parameters<
          typeof evaluate
        >[0]["communityCards"],
        minimumHoleCards: minHole,
        maximumHoleCards: maxHole,
      });
      return {
        strength: evaluated.strength,
        hand: evaluated.hand as unknown as string[],
      };
    } catch {
      return { strength: 0, hand: [] };
    }
  }

  let best: { strength: number; hand: string[] } | null = null;

  for (let holeCount = minHole; holeCount <= maxHole; holeCount += 1) {
    const boardCount = 5 - holeCount;
    if (boardCount < 0 || boardCount > board.length) continue;

    const holeCombos = combinations(holeCards, holeCount);
    const boardCombos = combinations(board, boardCount);

    for (const holeCombo of holeCombos) {
      for (const boardCombo of boardCombos) {
        const combo = [...holeCombo, ...boardCombo];
        if (hasRankCountOver4(combo)) continue;

        try {
          const evaluated = evaluate({
            holeCards: combo as unknown as Parameters<
              typeof evaluate
            >[0]["holeCards"],
          });
          if (
            !best ||
            compare(
              evaluated as Parameters<typeof compare>[0],
              best as Parameters<typeof compare>[0],
            ) === -1
          ) {
            best = {
              strength: evaluated.strength,
              hand: evaluated.hand as unknown as string[],
            };
          }
        } catch {
          // Skip invalid combinations
        }
      }
    }
  }

  return best ?? { strength: 0, hand: [] };
}

/**
 * Evaluate a single player's best hand for a given board (PLO rules)
 */
function evaluatePlayerHand(
  holeCards: string[],
  board: string[],
): { strength: number; hand: string[] } {
  return evaluateWithConstraints(holeCards, board, 2, 2);
}

/**
 * Determine winners for double board PLO
 * Each board awards half the pot. If a player wins both boards, they get the full pot.
 *
 * @returns Object with board1Winners and board2Winners arrays of seat numbers
 */
export function determineDoubleBoardWinners(
  playerHands: Array<{ seatNumber: number; cards: string[] }>,
  board1: string[],
  board2: string[],
): { board1Winners: number[]; board2Winners: number[] } {
  if (playerHands.length === 0) {
    return { board1Winners: [], board2Winners: [] };
  }

  // Evaluate each player on both boards
  const evaluations = playerHands.map((ph) => ({
    seatNumber: ph.seatNumber,
    board1: evaluatePlayerHand(ph.cards, board1),
    board2: evaluatePlayerHand(ph.cards, board2),
  }));

  type Evaluated = { strength: number; hand: string[] };
  const bestBoard1 = evaluations.reduce<Evaluated | null>((best, current) => {
    if (!best) return current.board1;
    const comparison = compare(
      current.board1 as unknown as Parameters<typeof compare>[0],
      best as unknown as Parameters<typeof compare>[0],
    );
    return comparison === -1 ? current.board1 : best;
  }, null);

  const bestBoard2 = evaluations.reduce<Evaluated | null>((best, current) => {
    if (!best) return current.board2;
    const comparison = compare(
      current.board2 as unknown as Parameters<typeof compare>[0],
      best as unknown as Parameters<typeof compare>[0],
    );
    return comparison === -1 ? current.board2 : best;
  }, null);

  const board1Winners =
    bestBoard1 === null
      ? []
      : evaluations
          .filter(
            (e) =>
              compare(
                e.board1 as unknown as Parameters<typeof compare>[0],
                bestBoard1 as unknown as Parameters<typeof compare>[0],
              ) === 0,
          )
          .map((e) => e.seatNumber);

  const board2Winners =
    bestBoard2 === null
      ? []
      : evaluations
          .filter(
            (e) =>
              compare(
                e.board2 as unknown as Parameters<typeof compare>[0],
                bestBoard2 as unknown as Parameters<typeof compare>[0],
              ) === 0,
          )
          .map((e) => e.seatNumber);

  return { board1Winners, board2Winners };
}

/**
 * Evaluate a single player's best hand for Hold'em (standard poker rules)
 */
function evaluateHoldemHand(
  holeCards: string[],
  board: string[],
): { strength: number; hand: string[] } {
  return evaluateWithConstraints(holeCards, board, 0, 2);
}

/**
 * Determine winners for single board Hold'em
 * @returns Array of winning seat numbers (can be multiple if tie)
 */
export function determineSingleBoardWinners(
  playerHands: Array<{ seatNumber: number; cards: string[] }>,
  board: string[],
): number[] {
  if (playerHands.length === 0) {
    return [];
  }

  // Evaluate each player
  const evaluations = playerHands.map((ph) => ({
    seatNumber: ph.seatNumber,
    evaluation: evaluateHoldemHand(ph.cards, board),
  }));

  // Find best hand(s)
  const maxStrength = Math.max(
    ...evaluations.map((e) => e.evaluation.strength),
  );
  const winners = evaluations
    .filter((e) => e.evaluation.strength === maxStrength)
    .map((e) => e.seatNumber);

  return winners;
}

/**
 * Evaluate 3-board hand (standard 5-card poker with 3 hole + 5 board)
 * Player can use any 5 cards from their 3 hole cards + 5 community cards
 */
function evaluate3BoardHand(
  holeCards: string[],
  board: string[],
): { strength: number; hand: string[] } {
  if (holeCards.length !== 3) return { strength: 0, hand: [] };
  if (board.length !== 5) return { strength: 0, hand: [] };
  return evaluateWithConstraints(holeCards, board, 0, 3);
}

/**
 * Evaluate 1-board hand (exactly 1 hole + 4 board = 5 card hand)
 * Creates a 5-card hand by combining the single hole card with best 4 from board
 */
function evaluate1BoardHand(
  holeCards: string[],
  board: string[],
): { strength: number; hand: string[] } {
  if (holeCards.length !== 1) return { strength: 0, hand: [] };
  if (board.length !== 5) return { strength: 0, hand: [] };
  return evaluateWithConstraints(holeCards, board, 1, 1);
}

/**
 * Determine winners for 321 mode (3 boards, different evaluation rules)
 * @param playerPartitions - Array of player partitions with allocated cards
 * @param board1 - 3-board community cards
 * @param board2 - 2-board community cards
 * @param board3 - 1-board community cards
 * @returns Winners for each board
 */
type Evaluated321Hand = {
  seatNumber: number;
  board1: { strength: number; hand: string[] };
  board2: { strength: number; hand: string[] };
  board3: { strength: number; hand: string[] };
};

function evaluate321Hands(
  playerPartitions: Array<{
    seatNumber: number;
    threeBoardCards: string[];
    twoBoardCards: string[];
    oneBoardCard: string[];
  }>,
  board1: string[],
  board2: string[],
  board3: string[],
): Evaluated321Hand[] {
  return playerPartitions.map((p) => ({
    seatNumber: p.seatNumber,
    board1: evaluate3BoardHand(p.threeBoardCards, board1), // 3-card holdem
    board2: evaluatePlayerHand(p.twoBoardCards, board2), // PLO rules (exactly 2 cards)
    board3: evaluate1BoardHand(p.oneBoardCard, board3), // 1+4 modified
  }));
}

function winnersForBoard(
  evaluations: Evaluated321Hand[],
  boardKey: "board1" | "board2" | "board3",
  eligibleSeats?: number[],
): number[] {
  const filtered = eligibleSeats
    ? evaluations.filter((e) => eligibleSeats.includes(e.seatNumber))
    : evaluations;
  if (filtered.length === 0) return [];
  const maxStrength = Math.max(...filtered.map((e) => e[boardKey].strength));
  return filtered
    .filter((e) => e[boardKey].strength === maxStrength)
    .map((e) => e.seatNumber);
}

export function determine321Winners(
  playerPartitions: Array<{
    seatNumber: number;
    threeBoardCards: string[];
    twoBoardCards: string[];
    oneBoardCard: string[];
  }>,
  board1: string[],
  board2: string[],
  board3: string[],
): {
  board1Winners: number[];
  board2Winners: number[];
  board3Winners: number[];
} {
  if (playerPartitions.length === 0) {
    return { board1Winners: [], board2Winners: [], board3Winners: [] };
  }

  const evaluations = evaluate321Hands(
    playerPartitions,
    board1,
    board2,
    board3,
  );
  const board1Winners = winnersForBoard(evaluations, "board1");
  const board2Winners = winnersForBoard(evaluations, "board2");
  const board3Winners = winnersForBoard(evaluations, "board3");

  return { board1Winners, board2Winners, board3Winners };
}

/**
 * Calculate side pots from players with different all-in amounts
 */
export function calculateSidePots(
  players: RoomPlayer[],
): Array<{ amount: number; eligibleSeats: number[] }> {
  const contributors = players.filter(
    (p) =>
      !p.has_folded &&
      !p.is_spectating &&
      !p.is_sitting_out &&
      !p.waiting_for_next_hand &&
      (p.total_invested_this_hand ?? 0) > 0,
  );

  if (contributors.length === 0) return [];

  const sorted = [...contributors].sort(
    (a, b) =>
      (a.total_invested_this_hand ?? 0) - (b.total_invested_this_hand ?? 0),
  );

  const uniqueLevels = Array.from(
    new Set(sorted.map((p) => p.total_invested_this_hand ?? 0)),
  ).sort((a, b) => a - b);

  const pots: Array<{ amount: number; eligibleSeats: number[] }> = [];
  let previousLevel = 0;

  uniqueLevels.forEach((level) => {
    const eligibleSeats = sorted
      .filter((p) => (p.total_invested_this_hand ?? 0) >= level)
      .map((p) => p.seat_number)
      .sort((a, b) => a - b);
    const diff = level - previousLevel;
    if (diff > 0 && eligibleSeats.length > 0) {
      pots.push({
        amount: diff * eligibleSeats.length,
        eligibleSeats,
      });
    }
    previousLevel = level;
  });

  return pots;
}

function distributeEven(
  amount: number,
  seats: number[],
  payouts: Map<number, number>,
) {
  if (amount <= 0 || seats.length === 0) return;
  const sortedSeats = [...seats].sort((a, b) => a - b);
  const base = Math.floor(amount / sortedSeats.length);
  let remainder = amount - base * sortedSeats.length;
  sortedSeats.forEach((seat) => {
    const extra = remainder > 0 ? 1 : 0;
    if (remainder > 0) remainder -= 1;
    payouts.set(seat, (payouts.get(seat) ?? 0) + base + extra);
  });
}

/**
 * Distribute pot(s) to winners, handling side pots and double boards
 * TODO: sidePots parameter will be used when side pot distribution is implemented
 */
export function endOfHandPayout(
  sidePots: Array<{ amount: number; eligibleSeats: number[] }>,
  board1Winners: number[],
  board2Winners: number[],
): { seat: number; amount: number }[] {
  if (board1Winners.length === 0 && board2Winners.length === 0) return [];

  const payouts: Map<number, number> = new Map();
  const potsToDistribute =
    sidePots.length > 0
      ? sidePots
      : [
          {
            amount: 0,
            eligibleSeats: Array.from(
              new Set([...board1Winners, ...board2Winners]),
            ),
          },
        ];

  potsToDistribute.forEach((pot) => {
    const eligibleBoard1 = board1Winners.filter((seat) =>
      pot.eligibleSeats.includes(seat),
    );
    const eligibleBoard2 = board2Winners.filter((seat) =>
      pot.eligibleSeats.includes(seat),
    );

    const board1Seats =
      eligibleBoard1.length > 0
        ? eligibleBoard1
        : eligibleBoard2.length > 0
          ? eligibleBoard2
          : pot.eligibleSeats;
    const board2Seats =
      eligibleBoard2.length > 0
        ? eligibleBoard2
        : board1Seats.length > 0
          ? board1Seats
          : pot.eligibleSeats;

    const halfPot = Math.floor(pot.amount / 2);
    const remainderPot = pot.amount - halfPot;

    distributeEven(halfPot, board1Seats, payouts);
    distributeEven(remainderPot, board2Seats, payouts);
  });

  return Array.from(payouts.entries()).map(([seat, amount]) => ({
    seat,
    amount,
  }));
}

/**
 * Distribute pot for 321 mode (3-way split)
 * Each board gets 1/3 of each pot. Scoop = player wins all 3 boards.
 */
export function endOfHandPayout321(
  sidePots: Array<{ amount: number; eligibleSeats: number[] }>,
  playerPartitions: Array<{
    seatNumber: number;
    threeBoardCards: string[];
    twoBoardCards: string[];
    oneBoardCard: string[];
  }>,
  board1: string[],
  board2: string[],
  board3: string[],
): { seat: number; amount: number }[] {
  if (playerPartitions.length === 0) {
    return [];
  }

  const evaluations = evaluate321Hands(
    playerPartitions,
    board1,
    board2,
    board3,
  );

  const payouts: Map<number, number> = new Map();
  const potsToDistribute =
    sidePots.length > 0
      ? sidePots
      : [
          {
            amount: 0,
            eligibleSeats: evaluations.map((e) => e.seatNumber),
          },
        ];

  potsToDistribute.forEach((pot) => {
    const eligibleSeats = pot.eligibleSeats;
    const board1Winners = winnersForBoard(evaluations, "board1", eligibleSeats);
    const board2Winners = winnersForBoard(evaluations, "board2", eligibleSeats);
    const board3Winners = winnersForBoard(evaluations, "board3", eligibleSeats);

    const board1Seats =
      board1Winners.length > 0 ? board1Winners : eligibleSeats;
    const board2Seats =
      board2Winners.length > 0 ? board2Winners : eligibleSeats;
    const board3Seats =
      board3Winners.length > 0 ? board3Winners : eligibleSeats;

    // Split pot into thirds (with rounding)
    const third = Math.floor(pot.amount / 3);
    const remainder = pot.amount - third * 3;

    // Distribute each third
    distributeEven(third, board1Seats, payouts);
    distributeEven(third, board2Seats, payouts);
    distributeEven(third + remainder, board3Seats, payouts); // Give remainder to board3
  });

  return Array.from(payouts.entries()).map(([seat, amount]) => ({
    seat,
    amount,
  }));
}

/**
 * Get rank value for high-card comparison in Indian Poker
 * @param card Card string (e.g., "Ah", "Kd")
 * @returns Rank value (0-12, where 2=0 and A=12)
 * @throws Error if card rank is invalid
 */
function cardRankValue(card: string): number {
  const rank = card[0];
  const rankOrder = "23456789TJQKA";
  const index = rankOrder.indexOf(rank);
  if (index === -1) {
    throw new Error(`Invalid card rank: ${rank} in card ${card}`);
  }
  return index;
}

/**
 * Determine winners in Indian Poker (single card high-card comparison)
 * @param hands Array of player hands with seat numbers and cards
 * @returns Array of winning seat numbers
 */
export function determineIndianPokerWinners(
  hands: Array<{ seatNumber: number; cards: string[] }>,
): number[] {
  if (hands.length === 0) return [];

  // Find highest card rank
  let maxRank = -1;
  const winners: number[] = [];

  for (const hand of hands) {
    // Validate hand has cards before accessing
    if (!hand.cards || hand.cards.length === 0) {
      console.warn(`Player at seat ${hand.seatNumber} has no cards, skipping`);
      continue;
    }

    const card = hand.cards[0];
    const rankValue = cardRankValue(card);

    if (rankValue > maxRank) {
      maxRank = rankValue;
      winners.length = 0; // Clear previous winners
      winners.push(hand.seatNumber);
    } else if (rankValue === maxRank) {
      winners.push(hand.seatNumber); // Tie
    }
  }

  return winners;
}
