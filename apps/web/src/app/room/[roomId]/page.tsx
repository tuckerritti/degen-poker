"use client";

import { use, useEffect, useState } from "react";
import { useSession } from "@/lib/hooks/useSession";
import { useRoomPlayers } from "@/lib/hooks/useRoomPlayers";
import { useGameState } from "@/lib/hooks/useGameState";
import { usePlayerHand } from "@/lib/hooks/usePlayerHand";
import { getBrowserClient } from "@/lib/supabase/client";
import { ActionPanel } from "@/components/poker/ActionPanel";
import { PokerTable } from "@/components/poker/PokerTable";
import type { Room, BoardState } from "@/types/database";
import { engineFetch, safeEngineUrl } from "@/lib/engineClient";
import { HAND_COMPLETE_DELAY_MS } from "@poker/shared";

export default function RoomPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = use(params);
  const { sessionId, accessToken, isLoading: sessionLoading } = useSession();
  const {
    players,
    loading: playersLoading,
    refetch: refetchPlayers,
  } = useRoomPlayers(roomId);
  const { gameState } = useGameState(roomId);
  const { playerHand } = usePlayerHand(roomId, sessionId);

  const [room, setRoom] = useState<Room | null>(null);
  const [roomLoading, setRoomLoading] = useState(true);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [selectedSeat, setSelectedSeat] = useState<number | null>(null);
  const [buyInAmount, setBuyInAmount] = useState(200);
  const [isJoining, setIsJoining] = useState(false);
  const [showRebuyModal, setShowRebuyModal] = useState(false);
  const [rebuyAmount, setRebuyAmount] = useState(100);
  const [isRebuying, setIsRebuying] = useState(false);
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [nextHandCountdown, setNextHandCountdown] = useState<number | null>(
    null,
  );
  const [handCompletionCountdown, setHandCompletionCountdown] = useState<
    number | null
  >(null);
  const [showdownProgress, setShowdownProgress] = useState(1);

  const myPlayer = players.find((p) => p.auth_user_id === sessionId);
  const isMyTurn =
    gameState &&
    myPlayer &&
    gameState.current_actor_seat === myPlayer.seat_number;

  useEffect(() => {
    const fetchRoom = async () => {
      const supabase = getBrowserClient();
      const { data, error } = await supabase
        .from("rooms")
        .select("*")
        .eq("id", roomId)
        .single();

      if (error) {
        console.error("Error fetching room:", error);
      } else {
        setRoom(data);
        setBuyInAmount(data.min_buy_in);
      }
      setRoomLoading(false);
    };

    fetchRoom();

    // Subscribe to room updates for pause state
    const supabase = getBrowserClient();
    const channel = supabase
      .channel(`room:${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "rooms",
          filter: `id=eq.${roomId}`,
        },
        (payload) => {
          setRoom(payload.new as Room);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId]);

  // Show countdown timer when hand completes (hand_completed_at is set)
  useEffect(() => {
    if (!gameState?.hand_completed_at) {
      setHandCompletionCountdown(null);
      return;
    }

    const completedAt = new Date(
      gameState.hand_completed_at as unknown as string,
    ).getTime();
    const now = Date.now();
    const elapsed = now - completedAt;
    const delayMs = HAND_COMPLETE_DELAY_MS;

    if (elapsed >= delayMs) {
      setHandCompletionCountdown(null);
      return;
    }

    // Show countdown (500ms intervals provide smooth UX without excessive re-renders)
    const countdownInterval = setInterval(() => {
      const currentElapsed = Date.now() - completedAt;
      const remaining = Math.ceil((delayMs - currentElapsed) / 1000);
      setHandCompletionCountdown(remaining > 0 ? remaining : null);

      if (currentElapsed >= delayMs) {
        clearInterval(countdownInterval);
        setHandCompletionCountdown(null);
      }
    }, 500);

    return () => clearInterval(countdownInterval);
  }, [gameState?.hand_completed_at]);

  // Shrinking progress bar while showdown resolves
  // Dependencies include hand_completed_at to restart the timer when it changes
  useEffect(() => {
    const isShowdownPhase =
      gameState?.phase === "showdown" || gameState?.phase === "complete";

    if (!isShowdownPhase) {
      setShowdownProgress(1);
      return;
    }

    const durationMs = HAND_COMPLETE_DELAY_MS;
    const startedAt = gameState?.hand_completed_at
      ? new Date(gameState.hand_completed_at as string).getTime()
      : Date.now();
    const endsAt = startedAt + durationMs;
    let interval: ReturnType<typeof setInterval> | null = null;

    const tick = () => {
      const remaining = endsAt - Date.now();
      const ratio = Math.max(0, Math.min(1, remaining / durationMs));
      setShowdownProgress(ratio);
      if (remaining <= 0) {
        if (interval) clearInterval(interval);
      }
    };

    tick();
    // 80ms intervals for smooth visual progress bar animation
    interval = setInterval(tick, 80);

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [gameState?.phase, gameState?.hand_completed_at]);

  // Auto-deal next hand after current hand ends
  useEffect(() => {
    // Calculate seated players
    const seatedPlayerCount = players.filter((p) => !p.is_spectating).length;
    const isOwner = room?.owner_auth_user_id === sessionId;

    // Only auto-deal if:
    // 1. No active game state (hand just ended)
    // 2. Not the first hand (current_hand_number > 0)
    // 3. Game is not paused
    // 4. Enough players
    // 5. User is the owner
    if (
      !gameState &&
      room &&
      (room.current_hand_number ?? 0) > 0 &&
      !room.is_paused &&
      seatedPlayerCount >= 2 &&
      isOwner
    ) {
      const delayMs = room.inter_hand_delay ?? 0;

      // Show countdown
      let elapsed = 0;
      const countdownInterval = setInterval(() => {
        elapsed += 100;
        const remaining = Math.ceil((delayMs - elapsed) / 1000);
        setNextHandCountdown(remaining > 0 ? remaining : null);

        if (elapsed >= delayMs) {
          clearInterval(countdownInterval);
          setNextHandCountdown(null);
        }
      }, 100);

      // Auto-deal after delay
      const dealTimer = setTimeout(async () => {
        try {
          if (!safeEngineUrl()) return;
          const response = await engineFetch(
            `/rooms/${roomId}/start-hand`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({}),
            },
            accessToken,
          );

          if (!response.ok) {
            const data = await response.json();
            console.error("Auto-deal failed:", data.error);
          }
        } catch (error) {
          console.error("Auto-deal error:", error);
        }
      }, delayMs);

      return () => {
        clearInterval(countdownInterval);
        clearTimeout(dealTimer);
        setNextHandCountdown(null);
      };
    } else {
      setNextHandCountdown(null);
    }
  }, [gameState, room, players, roomId, sessionId, accessToken]);

  const handleSeatClick = (seatNumber: number) => {
    // Don't allow sitting if already at the table
    if (myPlayer) {
      return;
    }
    setSelectedSeat(seatNumber);
    setShowJoinModal(true);
  };

  const handleJoinTable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionId || !room || selectedSeat === null) return;

    setIsJoining(true);

    try {
      if (!safeEngineUrl()) {
        alert("Engine URL not configured");
        return;
      }
      const response = await engineFetch(
        `/rooms/${roomId}/join`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            displayName,
            seatNumber: selectedSeat,
            buyIn: buyInAmount,
          }),
        },
        accessToken,
      );

      const data = await response.json();

      if (response.ok) {
        setShowJoinModal(false);
        setDisplayName("");
        setSelectedSeat(null);
        // Refetch players to ensure UI updates immediately
        await refetchPlayers();
      } else {
        alert(data.error || "Failed to join table");
      }
    } catch (error) {
      console.error("Error joining:", error);
      alert("Failed to join table");
    } finally {
      setIsJoining(false);
    }
  };

  const handleRebuy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!myPlayer || !accessToken || !roomId) return;

    // Validate rebuy amount
    if (rebuyAmount <= 0) {
      alert("Rebuy amount must be positive");
      return;
    }

    const maxRebuy = room
      ? Math.max(0, room.max_buy_in - myPlayer.chip_stack)
      : 0;
    if (maxRebuy <= 0) {
      alert("You're already at the maximum buy-in");
      return;
    }
    if (rebuyAmount > maxRebuy) {
      alert(`Maximum rebuy amount is $${maxRebuy}`);
      return;
    }

    setIsRebuying(true);

    try {
      const response = await engineFetch(
        `/rooms/${roomId}/rebuy`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            seatNumber: myPlayer.seat_number,
            rebuyAmount: rebuyAmount,
          }),
        },
        accessToken,
      );

      if (!response.ok) {
        const data = await response.json();
        alert(data.error || "Failed to add chips");
        return;
      }

      // Success - close modal and reset
      setShowRebuyModal(false);
      setRebuyAmount(100);

      // Real-time subscription will update UI automatically
    } catch (error) {
      console.error("Error adding chips:", error);
      alert("Failed to add chips");
    } finally {
      setIsRebuying(false);
    }
  };

  const handleDealHand = async () => {
    if (!safeEngineUrl()) {
      alert("Engine URL not configured");
      return;
    }
    try {
      const response = await engineFetch(
        `/rooms/${roomId}/start-hand`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
        accessToken,
      );

      const data = await response.json();

      if (!response.ok) {
        alert(data.error || "Failed to deal hand");
      }
    } catch (error) {
      console.error("Error dealing hand:", error);
      alert("Failed to deal hand");
    }
  };

  const handleTogglePause = async () => {
    if (!safeEngineUrl()) {
      alert("Engine URL not configured");
      return;
    }
    try {
      const response = await engineFetch(
        `/rooms/${roomId}/pause`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
        },
        accessToken,
      );

      const data = await response.json();

      if (!response.ok) {
        alert(data.error || "Failed to toggle pause");
        return;
      }

      // Show feedback for scheduled pause
      if (data.pauseScheduled) {
        alert("Game will pause after this hand completes");
      }
      // Real-time subscription will update UI automatically
    } catch (error) {
      console.error("Error toggling pause:", error);
      alert("Failed to toggle pause");
    }
  };

  const handleAction = async (actionType: string, amount?: number) => {
    if (!myPlayer) return;

    if (!safeEngineUrl()) {
      alert("Engine URL not configured");
      return;
    }
    try {
      const response = await engineFetch(
        `/rooms/${roomId}/actions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            seatNumber: myPlayer.seat_number,
            actionType,
            amount,
            idempotencyKey: crypto.randomUUID(),
          }),
        },
        accessToken,
      );

      const data = await response.json();

      if (!response.ok) {
        alert(data.error || "Failed to submit action");
      }
    } catch (error) {
      console.error("Error submitting action:", error);
      alert("Failed to submit action");
    }
  };

  const copyRoomLink = () => {
    navigator.clipboard.writeText(window.location.href);
    alert("Room link copied to clipboard!");
  };

  if (sessionLoading || roomLoading || playersLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-tokyo-night">
        <div
          className="text-2xl text-cream-parchment"
          style={{ fontFamily: "Playfair Display, serif" }}
        >
          Loading...
        </div>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-tokyo-night">
        <div
          className="text-2xl text-cream-parchment"
          style={{ fontFamily: "Playfair Display, serif" }}
        >
          Room not found
        </div>
      </div>
    );
  }

  // Get my hole cards from PRIVATE player_hands table (per POKER_PLAN.md)
  // RLS ensures we only see our own cards
  const myHoleCards: string[] =
    (playerHand?.cards as unknown as string[]) || [];

  // Get community cards from board_state JSONB (per POKER_PLAN.md)
  let boardA: string[] = [];
  let boardB: string[] = [];
  if (gameState?.board_state) {
    const boardState = gameState.board_state as unknown as BoardState;
    boardA = boardState.board1 || [];
    boardB = boardState.board2 || [];
    console.log("Board state received:", {
      boardA,
      boardB,
      boardALength: boardA.length,
      boardBLength: boardB.length,
    });
  }

  // Extract side pots from game state
  const sidePots = gameState?.side_pots
    ? (gameState.side_pots as unknown as Array<{
        amount: number;
        eligibleSeats: number[];
      }>)
    : [];

  const activePlayers = players.filter((p) => !p.is_spectating);
  const seatedPlayers = activePlayers.length;
  const isOwner =
    room.owner_auth_user_id !== null
      ? room.owner_auth_user_id === sessionId
      : true; // allow dealing if owner not set
  const canDeal =
    !gameState &&
    seatedPlayers >= 2 &&
    isOwner &&
    !room.is_paused &&
    room.current_hand_number === 0; // Only show for first hand
  const showActionRail = Boolean(isMyTurn && myPlayer && gameState && room);
  const layoutRowsClass = showActionRail
    ? "grid-rows-[auto_1fr_auto]"
    : "grid-rows-[auto_1fr]";

  const gameModeLabel =
    room?.game_mode === "double_board_bomb_pot_plo"
      ? "Double Board Bomb Pot PLO"
      : "Loading game...";

  const isShowdownPhase =
    gameState?.phase === "showdown" || gameState?.phase === "complete";

  const stakesLabel = room
    ? `Bomb pot ante (BB): ${room.big_blind}`
    : "Loading stakes...";

  return (
    <div
      className={`grid h-[100svh] min-h-[100svh] bg-royal-blue overflow-hidden relative ${layoutRowsClass}`}
    >
      {/* Vignette Effect */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 0%, transparent 40%, rgba(0,0,0,0.4) 70%, rgba(0,0,0,0.8) 100%)",
        }}
      />

      {/* Header */}
      <div className="relative flex-shrink-0 p-2 sm:p-3 z-10 bg-royal-blue/85 backdrop-blur-xl border-b border-white/5">
        <div className="glass rounded-lg p-2 sm:p-3 shadow-lg max-w-6xl mx-auto">
          <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex-1 min-w-0 space-y-0.5">
              <h1
                className="text-base sm:text-xl font-bold text-cream-parchment"
                style={{ fontFamily: "Playfair Display, serif" }}
              >
                {gameModeLabel}
              </h1>
              <p
                className="text-[11px] sm:text-xs text-cigar-ash"
                style={{ fontFamily: "Roboto Mono, monospace" }}
              >
                {stakesLabel}
              </p>
              {isOwner && (
                <p
                  className="text-[11px] sm:text-xs text-whiskey-gold"
                  style={{ fontFamily: "Lato, sans-serif" }}
                >
                  You are the table owner
                </p>
              )}
            </div>
          </div>
          <div className="mt-2 sm:mt-3 grid grid-cols-3 sm:flex sm:flex-wrap gap-1.5 sm:gap-2 sm:justify-start">
            <button
              onClick={() => setShowStatsModal(true)}
              className="w-full sm:w-auto rounded-md bg-royal-blue border border-white/10 px-2 py-1.5 sm:px-3 sm:py-2 text-[11px] sm:text-sm text-cream-parchment hover:border-whiskey-gold/50 transition-colors"
              style={{ fontFamily: "Lato, sans-serif" }}
            >
              Stats
            </button>
            {myPlayer && room && myPlayer.chip_stack < room.max_buy_in && (
              <button
                onClick={() => setShowRebuyModal(true)}
                className="w-full sm:w-auto rounded-md bg-whiskey-gold px-2 py-1.5 sm:px-3 sm:py-2 text-[11px] sm:text-sm font-semibold text-tokyo-night hover:bg-whiskey-gold/90 transition-colors"
                style={{ fontFamily: "Lato, sans-serif" }}
              >
                Add Chips
              </button>
            )}
            <button
              onClick={copyRoomLink}
              className="w-full sm:w-auto rounded-md bg-black/40 border border-white/10 px-2 py-1.5 sm:px-3 sm:py-2 text-[11px] sm:text-sm text-cream-parchment hover:border-whiskey-gold/50 transition-colors"
              style={{ fontFamily: "Lato, sans-serif" }}
            >
              Share
            </button>
            {isOwner && (
              <button
                onClick={handleTogglePause}
                className={`w-full sm:w-auto rounded-md px-2 py-1.5 sm:px-3 sm:py-2 text-[11px] sm:text-sm font-semibold border transition-colors ${
                  room.is_paused || room.pause_after_hand
                    ? "bg-whiskey-gold text-tokyo-night border-whiskey-gold hover:bg-whiskey-gold/90"
                    : "bg-black/40 text-cream-parchment border-white/10 hover:border-whiskey-gold/50"
                }`}
                style={{ fontFamily: "Lato, sans-serif" }}
              >
                {room.is_paused
                  ? "Unpause"
                  : room.pause_after_hand
                    ? "⏸ After Hand"
                    : gameState
                      ? "Pause After Hand"
                      : "Pause"}
              </button>
            )}
            {canDeal && (
              <button
                onClick={handleDealHand}
                className="w-full sm:w-auto animate-pulse rounded-md bg-whiskey-gold px-2 py-1.5 sm:px-3 sm:py-2 text-xs sm:text-sm font-bold text-tokyo-night shadow-lg glow-gold hover:bg-whiskey-gold/90 transition-colors"
                style={{ fontFamily: "Lato, sans-serif" }}
              >
                Deal Hand
              </button>
            )}
            {handCompletionCountdown !== null && (
              <div
                className="w-full sm:w-auto rounded-md bg-black/40 border border-whiskey-gold/50 px-2 py-1.5 sm:px-3 sm:py-2 text-xs sm:text-sm font-semibold text-whiskey-gold"
                style={{ fontFamily: "Lato, sans-serif" }}
              >
                Next hand in {handCompletionCountdown}s...
              </div>
            )}
            {nextHandCountdown !== null && (
              <div
                className="w-full sm:w-auto rounded-md bg-black/40 border border-whiskey-gold/50 px-2 py-1.5 sm:px-3 sm:py-2 text-xs sm:text-sm font-semibold text-whiskey-gold"
                style={{ fontFamily: "Lato, sans-serif" }}
              >
                Next hand in {nextHandCountdown}s...
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Table Area - fills remaining space */}
      <div className="relative z-20 flex items-center justify-center px-2 sm:px-4 overflow-visible">
        <div className="w-full h-full max-w-6xl flex items-center justify-center min-h-[260px]">
          <PokerTable
            players={players}
            maxPlayers={room.max_players}
            myPlayerId={myPlayer?.id}
            myHoleCards={myHoleCards}
            currentActorSeat={gameState?.current_actor_seat}
            buttonSeat={gameState?.button_seat ?? null}
            boardA={boardA}
            boardB={boardB}
            potSize={gameState?.pot_size ?? 0}
            sidePots={sidePots}
            phase={gameState?.phase}
            gameMode={room.game_mode}
            showdownProgress={isShowdownPhase ? showdownProgress : null}
            onSeatClick={handleSeatClick}
          />
        </div>
      </div>

      {/* Game Status Messages - Overlays */}
      {gameState && room.pause_after_hand && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 text-center glass px-3 py-2 sm:px-4 sm:py-3 rounded-lg z-20 mx-3 max-w-[min(90vw,420px)]">
          <p
            className="text-sm sm:text-base font-semibold text-whiskey-gold"
            style={{ fontFamily: "Lato, sans-serif" }}
          >
            ⏸ Pause Scheduled After Hand
          </p>
        </div>
      )}

      {!gameState && room.is_paused && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center glass px-4 py-3 sm:px-6 sm:py-4 rounded-lg z-20 max-w-[min(92vw,460px)] mx-3">
          <p
            className="text-lg sm:text-2xl font-bold text-whiskey-gold glow-gold"
            style={{ fontFamily: "Playfair Display, serif" }}
          >
            ⏸ GAME PAUSED
          </p>
          <p
            className="text-xs sm:text-sm mt-2 text-cream-parchment"
            style={{ fontFamily: "Lato, sans-serif" }}
          >
            {isOwner
              ? "Click 'Unpause' to resume"
              : "Waiting for owner to unpause..."}
          </p>
        </div>
      )}

      {!gameState && seatedPlayers < 2 && !room.is_paused && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center glass px-4 py-3 sm:px-6 sm:py-4 rounded-lg z-20 max-w-[min(92vw,420px)] mx-3">
          <p
            className="text-sm sm:text-lg text-cream-parchment"
            style={{ fontFamily: "Lato, sans-serif" }}
          >
            Waiting for players... ({seatedPlayers}/2 minimum)
          </p>
        </div>
      )}

      {gameState?.phase === "showdown" && (
        <div className="absolute top-24 sm:top-28 left-1/2 -translate-x-1/2 z-20 w-[min(90vw,520px)] px-4 pointer-events-none">
          <div className="h-2 w-full overflow-hidden rounded-full bg-white/10 border border-white/10 shadow-lg backdrop-blur-sm">
            <div
              className="h-full bg-whiskey-gold"
              style={{
                width: `${Math.max(0, Math.min(1, showdownProgress)) * 100}%`,
                transition: "width 80ms linear",
              }}
            />
          </div>
        </div>
      )}

      {/* Action Panel - Fixed at bottom */}
      {isMyTurn && myPlayer && gameState && room && (
        <div className="flex-shrink-0 w-full sm:max-w-5xl sm:mx-auto">
          <ActionPanel
            playerChips={myPlayer.chip_stack}
            playerCurrentBet={myPlayer.current_bet ?? 0}
            currentBet={gameState.current_bet ?? 0}
            potSize={gameState.pot_size ?? 0}
            bigBlind={room.big_blind}
            lastRaiseAmount={gameState.min_raise ?? room.big_blind}
            gameMode={room.game_mode}
            onAction={handleAction}
          />
        </div>
      )}

      {/* Join Modal */}
      {showJoinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-tokyo-night/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-lg glass border border-whiskey-gold/30 p-4 sm:p-6 shadow-2xl">
            <h2
              className="mb-4 text-xl sm:text-2xl font-bold text-cream-parchment"
              style={{ fontFamily: "Playfair Display, serif" }}
            >
              Join Table
            </h2>
            <form onSubmit={handleJoinTable} className="space-y-4">
              <div>
                <label
                  className="block text-sm font-medium text-cigar-ash"
                  style={{ fontFamily: "Lato, sans-serif" }}
                >
                  Display Name
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-cream-parchment focus:border-whiskey-gold focus:outline-none focus:ring-1 focus:ring-whiskey-gold backdrop-blur-sm"
                  style={{ fontFamily: "Lato, sans-serif" }}
                  required
                  maxLength={20}
                />
              </div>

              <div>
                <label
                  className="block text-sm font-medium text-cigar-ash"
                  style={{ fontFamily: "Lato, sans-serif" }}
                >
                  Buy-in Amount (${room.min_buy_in} - ${room.max_buy_in})
                </label>
                <input
                  type="number"
                  value={buyInAmount}
                  onChange={(e) => setBuyInAmount(Number(e.target.value))}
                  className="mt-1 block w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-cream-parchment focus:border-whiskey-gold focus:outline-none focus:ring-1 focus:ring-whiskey-gold backdrop-blur-sm"
                  style={{ fontFamily: "Roboto Mono, monospace" }}
                  min={room.min_buy_in}
                  max={room.max_buy_in}
                  required
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowJoinModal(false);
                    setSelectedSeat(null);
                  }}
                  className="flex-1 rounded-md bg-black/40 border border-white/10 px-4 py-2 text-cream-parchment hover:border-velvet-red/50 transition-colors"
                  style={{ fontFamily: "Lato, sans-serif" }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isJoining}
                  className="flex-1 rounded-md bg-whiskey-gold px-4 py-2 font-bold text-tokyo-night hover:bg-whiskey-gold/90 disabled:opacity-50 transition-colors"
                  style={{ fontFamily: "Lato, sans-serif" }}
                >
                  {isJoining ? "Joining..." : "Join"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Rebuy Modal */}
      {showRebuyModal && room && myPlayer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-tokyo-night/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-lg glass border border-whiskey-gold/30 p-4 sm:p-6 shadow-2xl">
            <h2
              className="mb-4 text-xl sm:text-2xl font-bold text-cream-parchment"
              style={{ fontFamily: "Playfair Display, serif" }}
            >
              Add Chips
            </h2>
            <div
              className="mb-4 text-sm text-cigar-ash"
              style={{ fontFamily: "Roboto Mono, monospace" }}
            >
              <p>
                Current stack:{" "}
                <span className="font-semibold text-cream-parchment">
                  ${myPlayer.chip_stack}
                </span>
              </p>
              <p>
                Maximum stack:{" "}
                <span className="font-semibold text-cream-parchment">
                  ${room.max_buy_in}
                </span>
              </p>
              <p>
                Maximum you can add:{" "}
                <span className="font-semibold text-whiskey-gold">
                  ${room.max_buy_in - myPlayer.chip_stack}
                </span>
              </p>
            </div>
            <form onSubmit={handleRebuy} className="space-y-4">
              <div>
                <label
                  className="block text-sm font-medium text-cigar-ash"
                  style={{ fontFamily: "Lato, sans-serif" }}
                >
                  Amount to Add
                </label>
                <input
                  type="number"
                  value={rebuyAmount}
                  onChange={(e) => setRebuyAmount(Number(e.target.value))}
                  className="mt-1 block w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-cream-parchment focus:border-whiskey-gold focus:outline-none focus:ring-1 focus:ring-whiskey-gold backdrop-blur-sm"
                  style={{ fontFamily: "Roboto Mono, monospace" }}
                  min={1}
                  max={room.max_buy_in - myPlayer.chip_stack}
                  required
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowRebuyModal(false);
                    setRebuyAmount(100);
                  }}
                  className="flex-1 rounded-md bg-black/40 border border-white/10 px-4 py-2 text-cream-parchment hover:border-velvet-red/50 transition-colors"
                  style={{ fontFamily: "Lato, sans-serif" }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isRebuying}
                  className="flex-1 rounded-md bg-whiskey-gold px-4 py-2 font-bold text-tokyo-night hover:bg-whiskey-gold/90 disabled:opacity-50 transition-colors"
                  style={{ fontFamily: "Lato, sans-serif" }}
                >
                  {isRebuying ? "Processing..." : "Add Chips"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Buy-in Stats Modal */}
      {showStatsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-tokyo-night/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl rounded-lg glass border border-whiskey-gold/30 p-4 sm:p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="mb-4 flex items-center justify-between">
              <h2
                className="text-xl sm:text-2xl font-bold text-cream-parchment"
                style={{ fontFamily: "Playfair Display, serif" }}
              >
                Buy-in Statistics
              </h2>
              <button
                onClick={() => setShowStatsModal(false)}
                className="text-cigar-ash hover:text-cream-parchment transition-colors"
              >
                <svg
                  className="h-6 w-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            <div className="overflow-x-auto">
              <p
                className="mb-2 text-xs text-cigar-ash"
                style={{ fontFamily: "Lato, sans-serif" }}
              >
                Total buy-ins are cumulative. Live stack includes chips already
                committed to the current pot when a hand is running.
              </p>
              <table className="min-w-full">
                <thead>
                  <tr className="border-b border-white/10">
                    <th
                      className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-cigar-ash"
                      style={{ fontFamily: "Lato, sans-serif" }}
                    >
                      Seat
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-cigar-ash"
                      style={{ fontFamily: "Lato, sans-serif" }}
                    >
                      Player
                    </th>
                    <th
                      className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-cigar-ash"
                      style={{ fontFamily: "Lato, sans-serif" }}
                    >
                      Total Buy-ins
                    </th>
                    <th
                      className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-cigar-ash"
                      style={{ fontFamily: "Lato, sans-serif" }}
                    >
                      Stack (On Table)
                    </th>
                    <th
                      className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-cigar-ash"
                      style={{ fontFamily: "Lato, sans-serif" }}
                    >
                      Live Stack (Incl. Pot)
                    </th>
                    <th
                      className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-cigar-ash"
                      style={{ fontFamily: "Lato, sans-serif" }}
                    >
                      Profit/Loss
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {activePlayers
                    .sort((a, b) => a.seat_number - b.seat_number)
                    .map((player) => {
                      const investedThisHand = gameState
                        ? (player.total_invested_this_hand ?? 0)
                        : 0;
                      const liveStack = player.chip_stack + investedThisHand;
                      const hasMoneyInPot = gameState && investedThisHand > 0;
                      const profitLoss = liveStack - player.total_buy_in;
                      const isProfit = profitLoss > 0;
                      const isLoss = profitLoss < 0;
                      const isMe = player.id === myPlayer?.id;

                      return (
                        <tr
                          key={player.id}
                          className={isMe ? "bg-whiskey-gold/10" : ""}
                        >
                          <td
                            className="whitespace-nowrap px-4 py-3 text-sm text-cream-parchment"
                            style={{ fontFamily: "Roboto Mono, monospace" }}
                          >
                            {player.seat_number + 1}
                          </td>
                          <td
                            className="whitespace-nowrap px-4 py-3 text-sm font-medium text-cream-parchment"
                            style={{ fontFamily: "Lato, sans-serif" }}
                          >
                            {player.display_name}
                            {isMe && (
                              <span className="ml-2 text-xs text-whiskey-gold">
                                (You)
                              </span>
                            )}
                          </td>
                          <td
                            className="whitespace-nowrap px-4 py-3 text-right text-sm text-cream-parchment"
                            style={{ fontFamily: "Roboto Mono, monospace" }}
                          >
                            ${player.total_buy_in}
                          </td>
                          <td
                            className="whitespace-nowrap px-4 py-3 text-right text-sm text-cream-parchment"
                            style={{ fontFamily: "Roboto Mono, monospace" }}
                          >
                            ${player.chip_stack}
                          </td>
                          <td
                            className="whitespace-nowrap px-4 py-3 text-right text-sm text-cream-parchment"
                            style={{ fontFamily: "Roboto Mono, monospace" }}
                          >
                            <div className="inline-flex items-center justify-end gap-2 whitespace-nowrap">
                              <span>${liveStack}</span>
                              {hasMoneyInPot && (
                                <span className="rounded-full bg-whiskey-gold/20 px-2 py-0.5 text-[11px] font-semibold text-whiskey-gold align-middle">
                                  +${investedThisHand} in pot
                                </span>
                              )}
                            </div>
                          </td>
                          <td
                            className={`whitespace-nowrap px-4 py-3 text-right text-sm font-semibold ${
                              isProfit
                                ? "text-whiskey-gold"
                                : isLoss
                                  ? "text-velvet-red"
                                  : "text-cream-parchment"
                            }`}
                            style={{ fontFamily: "Roboto Mono, monospace" }}
                          >
                            {profitLoss > 0 ? "+" : ""}${profitLoss}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
                <tfoot className="border-t border-whiskey-gold/30">
                  <tr>
                    <td
                      colSpan={2}
                      className="px-4 py-3 text-sm font-bold text-cream-parchment"
                      style={{ fontFamily: "Lato, sans-serif" }}
                    >
                      Total
                    </td>
                    <td
                      className="whitespace-nowrap px-4 py-3 text-right text-sm font-bold text-cream-parchment"
                      style={{ fontFamily: "Roboto Mono, monospace" }}
                    >
                      $
                      {activePlayers.reduce(
                        (sum, p) => sum + p.total_buy_in,
                        0,
                      )}
                    </td>
                    <td
                      className="whitespace-nowrap px-4 py-3 text-right text-sm font-bold text-cream-parchment"
                      style={{ fontFamily: "Roboto Mono, monospace" }}
                    >
                      ${activePlayers.reduce((sum, p) => sum + p.chip_stack, 0)}
                    </td>
                    <td
                      className="whitespace-nowrap px-4 py-3 text-right text-sm font-bold text-cream-parchment"
                      style={{ fontFamily: "Roboto Mono, monospace" }}
                    >
                      $
                      {activePlayers.reduce(
                        (sum, p) =>
                          sum +
                          p.chip_stack +
                          (gameState ? (p.total_invested_this_hand ?? 0) : 0),
                        0,
                      )}
                    </td>
                    <td
                      className="whitespace-nowrap px-4 py-3 text-right text-sm font-bold text-cream-parchment"
                      style={{ fontFamily: "Roboto Mono, monospace" }}
                    >
                      $
                      {activePlayers.reduce(
                        (sum, p) =>
                          sum +
                          p.chip_stack +
                          (gameState ? (p.total_invested_this_hand ?? 0) : 0) -
                          p.total_buy_in,
                        0,
                      )}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="mt-4">
              <button
                onClick={() => setShowStatsModal(false)}
                className="w-full rounded-md bg-black/40 border border-white/10 px-4 py-2 text-cream-parchment hover:border-whiskey-gold/50 transition-colors"
                style={{ fontFamily: "Lato, sans-serif" }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
