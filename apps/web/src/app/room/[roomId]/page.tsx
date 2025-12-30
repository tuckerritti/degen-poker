"use client";

import { use, useEffect, useMemo, useState } from "react";
import { useSession } from "@/lib/hooks/useSession";
import { useRoomPlayers } from "@/lib/hooks/useRoomPlayers";
import { useGameState } from "@/lib/hooks/useGameState";
import { usePlayerHand } from "@/lib/hooks/usePlayerHand";
import { useLatestHandResult } from "@/lib/hooks/useLatestHandResult";
import { useIndianPokerVisibleCards } from "@/lib/hooks/useIndianPokerVisibleCards";
import { getBrowserClient } from "@/lib/supabase/client";
import { ActionPanel } from "@/components/poker/ActionPanel";
import { PokerTable } from "@/components/poker/PokerTable";
import { Card } from "@/components/poker/Card";
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
  const { handResult } = useLatestHandResult(roomId);

  const [room, setRoom] = useState<Room | null>(null);
  const [roomLoading, setRoomLoading] = useState(true);

  const myPlayer = players.find((p) => p.auth_user_id === sessionId);
  const isIndianPoker = room?.game_mode === "indian_poker";
  const canSeeIndianPokerCards =
    isIndianPoker && !!myPlayer && !myPlayer.is_spectating;

  // SECURITY: For Indian Poker, fetch visible cards from secure endpoint
  // This ensures players only see other players' cards, never their own
  const { visibleCards: indianPokerVisibleCards } = useIndianPokerVisibleCards(
    roomId,
    gameState?.id ?? null,
    accessToken || null,
    canSeeIndianPokerCards,
  );
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [selectedSeat, setSelectedSeat] = useState<number | null>(null);
  const [buyInAmount, setBuyInAmount] = useState(200);
  const [isJoining, setIsJoining] = useState(false);
  const [showRebuyModal, setShowRebuyModal] = useState(false);
  const [rebuyAmount, setRebuyAmount] = useState(100);
  const [isRebuying, setIsRebuying] = useState(false);
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [, setNextHandCountdown] = useState<number | null>(null);
  const [, setHandCompletionCountdown] = useState<number | null>(null);
  const [showdownProgress, setShowdownProgress] = useState(1);
  const [showdownTransitionMs, setShowdownTransitionMs] = useState(0);
  const [partitionAssignment, setPartitionAssignment] = useState<
    Array<"board1" | "board2" | "board3">
  >([]);
  const [partitionSubmitting, setPartitionSubmitting] = useState(false);
  const [, setPartitionStatus] = useState<string | null>(null);
  const [, setPartitionError] = useState<string | null>(null);
  const [hasSubmittedPartition, setHasSubmittedPartition] = useState(false);

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
    // Use longer delay for 321 mode to give players time to see all partitions
    const is321Mode = room?.game_mode === "game_mode_321";
    const delayMs = is321Mode ? 15000 : HAND_COMPLETE_DELAY_MS;

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
  }, [gameState?.hand_completed_at, room?.game_mode]);

  // Reset partition submission state when phase changes from partition
  useEffect(() => {
    const isPartition = gameState?.phase === "partition";
    if (!isPartition && hasSubmittedPartition) {
      setHasSubmittedPartition(false);
    }
  }, [gameState?.phase, hasSubmittedPartition]);

  // Shrinking progress bar while showdown resolves
  // Dependencies include hand_completed_at to restart the timer when it changes
  // Phase dependency ensures progress resets when transitioning to/from showdown
  useEffect(() => {
    const isShowdownPhase =
      gameState?.phase === "showdown" || gameState?.phase === "complete";

    if (!isShowdownPhase) {
      setShowdownTransitionMs(0);
      setShowdownProgress(1);
      return;
    }

    // Wait for hand_completed_at to be set before starting animation
    // This prevents race condition where phase updates before timestamp is set
    if (!gameState?.hand_completed_at) {
      setShowdownTransitionMs(0);
      setShowdownProgress(1); // Keep bar at 100% while waiting
      return;
    }

    // Use longer showdown time for 321 mode to give players time to see all partitions
    const is321Mode = room?.game_mode === "game_mode_321";
    const durationMs = is321Mode ? 15000 : HAND_COMPLETE_DELAY_MS;
    const now = Date.now();
    const rawStartedAt = new Date(
      gameState.hand_completed_at as string,
    ).getTime();
    const startedAt = Number.isFinite(rawStartedAt)
      ? Math.min(rawStartedAt, now)
      : now;
    const elapsed = Math.min(Math.max(now - startedAt, 0), durationMs);
    const remainingMs = Math.max(durationMs - elapsed, 0);
    const initialRatio = durationMs > 0 ? remainingMs / durationMs : 0;

    // Apply initial width immediately without animation, then animate to 0 once.
    setShowdownTransitionMs(0);
    setShowdownProgress(initialRatio);

    if (remainingMs <= 0) {
      return;
    }

    const rafId = requestAnimationFrame(() => {
      setShowdownTransitionMs(remainingMs);
      setShowdownProgress(0);
    });

    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [gameState?.phase, gameState?.hand_completed_at, room?.game_mode]);

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
      // Note: Changed from || to ?? to respect explicit 0 value (no delay)
      // Previously 0 would fallback to 3000ms default
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

  const handlePartitionSubmit = async () => {
    if (!canPartition || !myPlayer) return;
    const { b1, b2, b3 } = partitionBoards;
    if (!(b1.length === 3 && b2.length === 2 && b3.length === 1)) {
      setPartitionError("You must assign 3 / 2 / 1 cards to boards A / B / C.");
      return;
    }
    setPartitionError(null);
    setPartitionStatus(null);
    setPartitionSubmitting(true);
    try {
      const response = await engineFetch(
        `/rooms/${roomId}/partitions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            seatNumber: myPlayer.seat_number,
            threeBoardCards: b1,
            twoBoardCards: b2,
            oneBoardCard: b3,
          }),
        },
        accessToken ?? undefined,
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to submit partition");
      }
      // Hide panel immediately after successful submission
      setHasSubmittedPartition(true);
      if (data.completed) {
        setPartitionStatus(
          "Submitted! All players partitioned. Resolving hand...",
        );
      } else if (data.pendingSeats) {
        setPartitionStatus(
          `Submitted. Waiting on seats: ${data.pendingSeats.join(", ")}`,
        );
      } else {
        setPartitionStatus("Submitted.");
      }
    } catch (err) {
      setPartitionError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setPartitionSubmitting(false);
    }
  };

  // Get my hole cards from PRIVATE player_hands table (per POKER_PLAN.md)
  // RLS ensures we only see our own cards
  const myHoleCards: string[] = useMemo(
    () => (playerHand?.cards as unknown as string[]) || [],
    [playerHand],
  );

  // Default partition assignment (first 3 / next 2 / last 1)
  useEffect(() => {
    if (myHoleCards.length !== 6) {
      setPartitionAssignment([]);
      return;
    }
    setPartitionAssignment([
      "board1",
      "board1",
      "board1",
      "board2",
      "board2",
      "board3",
    ]);
  }, [myHoleCards]);

  // Get community cards and visible player cards from board_state JSONB
  const boardStateData = useMemo(() => {
    if (!gameState?.board_state) {
      return {
        boardA: [] as string[],
        boardB: [] as string[],
        boardC: [] as string[],
        visiblePlayerCards: {} as Record<string, string[]>,
        playerPartitions: {} as Record<
          string,
          {
            threeBoardCards: string[];
            twoBoardCards: string[];
            oneBoardCard: string[];
          }
        >,
        reconstructedCards: null as Record<string, string[]> | null,
        hasBoardState: false,
      };
    }

    const boardState = gameState.board_state as unknown as BoardState;
    const boardA = boardState.board1 || [];
    const boardB = boardState.board2 || [];
    const boardC = boardState.board3 || [];

    // SECURITY FIX: For Indian Poker, use secure endpoint data instead of board_state
    // board_state.visible_player_cards should no longer be populated (security vulnerability)
    // Use indianPokerVisibleCards from the secure endpoint instead
    let visiblePlayerCards: Record<string, string[]> = {};
    if (room?.game_mode === "indian_poker") {
      visiblePlayerCards = indianPokerVisibleCards || {};
    }

    // Use revealed_partitions during showdown, otherwise use player_partitions
    const rawPartitions =
      boardState.revealed_partitions || boardState.player_partitions || {};

    // Convert revealed_partitions format (snake_case) to playerPartitions format (camelCase)
    const playerPartitions = Object.entries(rawPartitions).reduce(
      (acc, [seat, partition]) => {
        acc[seat] = {
          threeBoardCards:
            "three_board_cards" in partition
              ? partition.three_board_cards
              : partition.threeBoardCards,
          twoBoardCards:
            "two_board_cards" in partition
              ? partition.two_board_cards
              : partition.twoBoardCards,
          oneBoardCard:
            "one_board_card" in partition
              ? partition.one_board_card
              : partition.oneBoardCard,
        };
        return acc;
      },
      {} as Record<
        string,
        {
          threeBoardCards: string[];
          twoBoardCards: string[];
          oneBoardCard: string[];
        }
      >,
    );

    let reconstructedCards: Record<string, string[]> | null = null;
    // For 321 mode showdown: populate visiblePlayerCards from revealed_partitions
    // This allows all players to see everyone's hole cards during showdown
    if (boardState.revealed_partitions) {
      reconstructedCards = Object.entries(
        boardState.revealed_partitions,
      ).reduce(
        (acc, [seat, partition]) => {
          // Concatenate all partition cards to reconstruct the full 6-card hand
          acc[seat] = [
            ...partition.three_board_cards,
            ...partition.two_board_cards,
            ...partition.one_board_card,
          ];
          return acc;
        },
        {} as Record<string, string[]>,
      );

      // Merge with existing visiblePlayerCards (for Indian Poker compatibility)
      visiblePlayerCards = { ...visiblePlayerCards, ...reconstructedCards };
    }

    return {
      boardA,
      boardB,
      boardC,
      visiblePlayerCards,
      playerPartitions,
      reconstructedCards,
      hasBoardState: true,
    };
  }, [gameState?.board_state, room?.game_mode, indianPokerVisibleCards]);

  const {
    boardA,
    boardB,
    boardC,
    visiblePlayerCards,
    playerPartitions,
    reconstructedCards,
    hasBoardState,
  } = boardStateData;

  useEffect(() => {
    if (!hasBoardState) return;
    if (reconstructedCards) {
      console.log(
        "Revealed partitions found! Reconstructed cards:",
        reconstructedCards,
      );
    }
    console.log("Board state received:", {
      boardA,
      boardB,
      boardC,
      boardALength: boardA.length,
      boardBLength: boardB.length,
      boardCLength: boardC.length,
      visiblePlayerCards,
      playerPartitions,
    });
  }, [
    hasBoardState,
    reconstructedCards,
    boardA,
    boardB,
    boardC,
    visiblePlayerCards,
    playerPartitions,
  ]);

  // Extract side pots from game state
  const sidePots = gameState?.side_pots
    ? (gameState.side_pots as unknown as Array<{
        amount: number;
        eligibleSeats: number[];
      }>)
    : [];

  const partitionBoards = useMemo(() => {
    const b1: string[] = [];
    const b2: string[] = [];
    const b3: string[] = [];
    myHoleCards.forEach((card, index) => {
      const dest = partitionAssignment[index];
      if (dest === "board1") b1.push(card);
      else if (dest === "board2") b2.push(card);
      else if (dest === "board3") b3.push(card);
    });
    return { b1, b2, b3 };
  }, [myHoleCards, partitionAssignment]);

  const playerPartitionsForDisplay = useMemo(() => {
    if (!hasSubmittedPartition || myPlayer?.seat_number === undefined) {
      return playerPartitions;
    }
    const seatKey = myPlayer.seat_number.toString();
    if (
      playerPartitions[seatKey] ||
      partitionBoards.b1.length !== 3 ||
      partitionBoards.b2.length !== 2 ||
      partitionBoards.b3.length !== 1
    ) {
      return playerPartitions;
    }
    return {
      ...playerPartitions,
      [seatKey]: {
        threeBoardCards: partitionBoards.b1,
        twoBoardCards: partitionBoards.b2,
        oneBoardCard: partitionBoards.b3,
      },
    };
  }, [
    hasSubmittedPartition,
    myPlayer?.seat_number,
    partitionBoards,
    playerPartitions,
  ]);

  const roomGameMode = room?.game_mode as unknown as string;
  const isPartitionPhase =
    roomGameMode === "game_mode_321" &&
    (gameState?.phase as string) === "partition";
  const canPartition =
    isPartitionPhase &&
    myPlayer &&
    !myPlayer.has_folded &&
    myHoleCards.length === 6 &&
    !hasSubmittedPartition;

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

  const board1Winners = handResult?.board1_winners as unknown as
    | number[]
    | null;
  const board2Winners = handResult?.board2_winners as unknown as
    | number[]
    | null;
  const board3Winners = handResult?.board3_winners as unknown as
    | number[]
    | null;

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
      <div className="relative flex-shrink-0 p-2 sm:p-3 z-50 bg-royal-blue/85 backdrop-blur-xl border-b border-white/5">
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
            boardC={boardC}
            potSize={gameState?.pot_size ?? 0}
            sidePots={sidePots}
            phase={gameState?.phase}
            gameMode={room.game_mode}
            visiblePlayerCards={visiblePlayerCards}
            playerPartitions={playerPartitionsForDisplay}
            showdownProgress={isShowdownPhase ? showdownProgress : null}
            showdownTransitionMs={isShowdownPhase ? showdownTransitionMs : 0}
            board1Winners={isShowdownPhase ? board1Winners : null}
            board2Winners={isShowdownPhase ? board2Winners : null}
            board3Winners={isShowdownPhase ? board3Winners : null}
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
                transition:
                  showdownTransitionMs > 0
                    ? `width ${showdownTransitionMs}ms linear`
                    : "none",
              }}
            />
          </div>
        </div>
      )}

      {/* Partition assignment for 321 mode */}
      {canPartition && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-4xl border border-whiskey-gold/50 p-4 sm:p-6 shadow-2xl max-h-[80vh] overflow-y-auto backdrop-blur-xl bg-royal-blue/95 rounded-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p
                  className="text-sm sm:text-base font-semibold text-cream-parchment"
                  style={{ fontFamily: "Lato, sans-serif" }}
                >
                  Partition your 6 cards across the 3 boards (3 / 2 / 1).
                </p>
              </div>
            </div>

            {/* Community Cards Display */}
            <div className="mt-4 flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center items-center">
              {boardC.length > 0 && (
                <div className="flex flex-col items-center gap-1">
                  <div className="text-xs font-semibold text-cream-parchment">
                    1 Board
                  </div>
                  <div className="flex gap-1 p-2 rounded-lg bg-black/30 border border-white/10">
                    {boardC.map((card, idx) => (
                      <Card key={idx} card={card} size="sm" />
                    ))}
                  </div>
                </div>
              )}
              {boardB.length > 0 && (
                <div className="flex flex-col items-center gap-1">
                  <div className="text-xs font-semibold text-cream-parchment">
                    2 Board
                  </div>
                  <div className="flex gap-1 p-2 rounded-lg bg-black/30 border border-white/10">
                    {boardB.map((card, idx) => (
                      <Card key={idx} card={card} size="sm" />
                    ))}
                  </div>
                </div>
              )}
              {boardA.length > 0 && (
                <div className="flex flex-col items-center gap-1">
                  <div className="text-xs font-semibold text-cream-parchment">
                    3 Board
                  </div>
                  <div className="flex gap-1 p-2 rounded-lg bg-black/30 border border-white/10">
                    {boardA.map((card, idx) => (
                      <Card key={idx} card={card} size="sm" />
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-4 border-t border-white/10 pt-4">
              <p className="text-xs sm:text-sm font-semibold text-cream-parchment mb-3">
                Assign your 6 cards:
              </p>

              {/* Grouped preview of assigned cards */}
              <div className="flex flex-wrap gap-3 sm:gap-4 justify-center items-center mb-4">
                {/* 3-card group (board1) */}
                <div className="flex gap-0.5 sm:gap-1">
                  {partitionBoards.b1.map((card, idx) => (
                    <Card key={idx} card={card} size="md" />
                  ))}
                  {Array.from({ length: 3 - partitionBoards.b1.length }).map(
                    (_, idx) => (
                      <div
                        key={`empty-b1-${idx}`}
                        className="w-12 h-16 sm:w-16 sm:h-24 border border-dashed border-whiskey-gold/30 rounded-lg"
                      />
                    ),
                  )}
                </div>

                {/* 2-card group (board2) */}
                <div className="flex gap-0.5 sm:gap-1">
                  {partitionBoards.b2.map((card, idx) => (
                    <Card key={idx} card={card} size="md" />
                  ))}
                  {Array.from({ length: 2 - partitionBoards.b2.length }).map(
                    (_, idx) => (
                      <div
                        key={`empty-b2-${idx}`}
                        className="w-12 h-16 sm:w-16 sm:h-24 border border-dashed border-whiskey-gold/30 rounded-lg"
                      />
                    ),
                  )}
                </div>

                {/* 1-card group (board3) */}
                <div className="flex gap-0.5 sm:gap-1">
                  {partitionBoards.b3.map((card, idx) => (
                    <Card key={idx} card={card} size="md" />
                  ))}
                  {Array.from({ length: 1 - partitionBoards.b3.length }).map(
                    (_, idx) => (
                      <div
                        key={`empty-b3-${idx}`}
                        className="w-12 h-16 sm:w-16 sm:h-24 border border-dashed border-whiskey-gold/30 rounded-lg"
                      />
                    ),
                  )}
                </div>
              </div>

              {/* Grid of selectable cards with assignment buttons */}
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 sm:gap-3">
                {myHoleCards.map((card, index) => {
                  const assignment = partitionAssignment[index];
                  const buttonClass = (dest: "board1" | "board2" | "board3") =>
                    `px-2 py-1 rounded-md border text-xs font-semibold transition ${
                      assignment === dest
                        ? "bg-whiskey-gold text-tokyo-night border-whiskey-gold"
                        : "bg-black/40 text-cream-parchment border-white/15 hover:border-whiskey-gold/50"
                    }`;

                  return (
                    <div
                      key={`${card}-${index}`}
                      className="flex w-full flex-col items-center gap-1 rounded-lg border border-white/10 bg-black/30 p-1 sm:p-1.5"
                    >
                      <Card card={card} size="md" />
                      <div className="flex gap-0.5">
                        <button
                          type="button"
                          className={buttonClass("board3")}
                          onClick={() =>
                            setPartitionAssignment((prev) => {
                              const next = [...prev];
                              next[index] = "board3";
                              return next;
                            })
                          }
                        >
                          1
                        </button>
                        <button
                          type="button"
                          className={buttonClass("board2")}
                          onClick={() =>
                            setPartitionAssignment((prev) => {
                              const next = [...prev];
                              next[index] = "board2";
                              return next;
                            })
                          }
                        >
                          2
                        </button>
                        <button
                          type="button"
                          className={buttonClass("board1")}
                          onClick={() =>
                            setPartitionAssignment((prev) => {
                              const next = [...prev];
                              next[index] = "board1";
                              return next;
                            })
                          }
                        >
                          3
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handlePartitionSubmit}
                disabled={
                  partitionSubmitting ||
                  !(
                    partitionBoards.b1.length === 3 &&
                    partitionBoards.b2.length === 2 &&
                    partitionBoards.b3.length === 1
                  )
                }
                className="rounded-md bg-whiskey-gold px-4 py-2 text-sm font-bold text-tokyo-night shadow-lg hover:bg-whiskey-gold/90 disabled:cursor-not-allowed disabled:bg-whiskey-gold/40"
              >
                {partitionSubmitting ? "Submitting..." : "Submit Partition"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Action Panel - Fixed at bottom */}
      {isMyTurn && myPlayer && gameState && room && (
        <div className="flex-shrink-0 w-full sm:max-w-5xl sm:mx-auto px-3 sm:px-6 pb-4 sm:pb-6">
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
