"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useSession } from "@/lib/hooks/useSession";
import { useRoomPlayers } from "@/lib/hooks/useRoomPlayers";
import { useGameState } from "@/lib/hooks/useGameState";
import { usePlayerHand } from "@/lib/hooks/usePlayerHand";
import { getBrowserClient } from "@/lib/supabase/client";
import { ActionPanel } from "@/components/poker/ActionPanel";
import { PokerTable } from "@/components/poker/PokerTable";
import type { Room, BoardState } from "@/types/database";

export default function RoomPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = use(params);
  const { sessionId, isLoading: sessionLoading } = useSession();
  const { players, loading: playersLoading } = useRoomPlayers(roomId);
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

  const myPlayer = players.find((p) => p.session_id === sessionId);
  const isMyTurn =
    gameState && myPlayer && gameState.current_actor_seat === myPlayer.seat_number;

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

  const handleResolveHand = useCallback(async () => {
    try {
      const response = await fetch("/api/game/resolve-hand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId }),
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.error || "Failed to resolve hand");
      }
    } catch (error) {
      console.error("Error resolving hand:", error);
      alert("Failed to resolve hand");
    }
  }, [roomId]);

  // Auto-resolve showdown after 5 seconds
  useEffect(() => {
    if (gameState?.phase === "showdown") {
      const timer = setTimeout(() => {
        handleResolveHand();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [gameState?.phase, handleResolveHand]);

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
      const response = await fetch(`/api/rooms/${roomId}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          displayName,
          seatNumber: selectedSeat,
          buyInAmount,
          isSpectating: false,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setShowJoinModal(false);
        setDisplayName("");
        setSelectedSeat(null);
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
    if (!myPlayer || !sessionId) return;

    setIsRebuying(true);

    try {
      const response = await fetch(`/api/players/${myPlayer.id}/rebuy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: rebuyAmount,
          sessionId,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setShowRebuyModal(false);
        setRebuyAmount(100);
      } else {
        alert(data.error || "Failed to rebuy");
      }
    } catch (error) {
      console.error("Error rebuying:", error);
      alert("Failed to rebuy");
    } finally {
      setIsRebuying(false);
    }
  };

  const handleDealHand = async () => {
    try {
      const response = await fetch("/api/game/deal-hand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId, sessionId }),
      });

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
    try {
      const response = await fetch(`/api/rooms/${roomId}/pause`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.error || "Failed to toggle pause state");
      }
    } catch (error) {
      console.error("Error toggling pause:", error);
      alert("Failed to toggle pause state");
    }
  };

  const handleAction = async (actionType: string, amount?: number) => {
    if (!myPlayer) return;

    try {
      const response = await fetch("/api/game/submit-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId,
          sessionId,
          seatNumber: myPlayer.seat_number,
          actionType,
          amount,
        }),
      });

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
        <div className="text-2xl text-cream-parchment" style={{ fontFamily: 'Playfair Display, serif' }}>Loading...</div>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-tokyo-night">
        <div className="text-2xl text-cream-parchment" style={{ fontFamily: 'Playfair Display, serif' }}>Room not found</div>
      </div>
    );
  }

  // Get my hole cards from PRIVATE player_hands table (per POKER_PLAN.md)
  // RLS ensures we only see our own cards
  const myHoleCards: string[] = playerHand?.cards as unknown as string[] || [];

  // Get community cards from board_state JSONB (per POKER_PLAN.md)
  let boardA: string[] = [];
  let boardB: string[] = [];
  if (gameState?.board_state) {
    const boardState = gameState.board_state as unknown as BoardState;
    boardA = boardState.board1 || [];
    boardB = boardState.board2 || [];
    console.log("Board state received:", { boardA, boardB, boardALength: boardA.length, boardBLength: boardB.length });
  }

  const seatedPlayers = players.filter((p) => !p.is_spectating).length;
  const isOwner = room.owner_session_id === sessionId;
  const canDeal = !gameState && seatedPlayers >= 2 && isOwner && !room.is_paused;

  return (
    <div className="h-screen bg-royal-blue flex flex-col overflow-hidden relative">
      {/* Vignette Effect */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse at center, transparent 0%, transparent 40%, rgba(0,0,0,0.4) 70%, rgba(0,0,0,0.8) 100%)'
      }} />

      {/* Header */}
      <div className="flex-shrink-0 p-2 sm:p-3 relative z-10">
        <div className="glass rounded-lg p-2 sm:p-3">
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-cream-parchment" style={{ fontFamily: 'Playfair Display, serif' }}>
              Double Board Bomb Pot PLO
            </h1>
            <p className="text-xs text-cigar-ash" style={{ fontFamily: 'Roboto Mono, monospace' }}>
              Blinds: {room.small_blind}/{room.big_blind} • Ante:{" "}
              {room.bomb_pot_ante}
            </p>
            {isOwner && (
              <p className="text-xs text-whiskey-gold" style={{ fontFamily: 'Lato, sans-serif' }}>
                You are the table owner
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2 mt-2 sm:mt-3">
            <button
              onClick={() => setShowStatsModal(true)}
              className="rounded-md bg-royal-blue border border-white/10 px-2 py-1.5 sm:px-3 sm:py-2 text-xs sm:text-sm text-cream-parchment hover:border-whiskey-gold/50 transition-colors"
              style={{ fontFamily: 'Lato, sans-serif' }}
            >
              Stats
            </button>
            {myPlayer && room && myPlayer.chip_stack < room.max_buy_in && (
              <button
                onClick={() => setShowRebuyModal(true)}
                className="rounded-md bg-whiskey-gold px-2 py-1.5 sm:px-3 sm:py-2 text-xs sm:text-sm font-semibold text-tokyo-night hover:bg-whiskey-gold/90 transition-colors"
                style={{ fontFamily: 'Lato, sans-serif' }}
              >
                Add Chips
              </button>
            )}
            <button
              onClick={copyRoomLink}
              className="rounded-md bg-black/40 border border-white/10 px-2 py-1.5 sm:px-3 sm:py-2 text-xs sm:text-sm text-cream-parchment hover:border-whiskey-gold/50 transition-colors"
              style={{ fontFamily: 'Lato, sans-serif' }}
            >
              Share
            </button>
            {isOwner && !gameState && (
              <button
                onClick={handleTogglePause}
                className={`rounded-md px-2 py-1.5 sm:px-3 sm:py-2 text-xs sm:text-sm font-semibold border transition-colors ${
                  room.is_paused
                    ? "bg-whiskey-gold text-tokyo-night border-whiskey-gold hover:bg-whiskey-gold/90"
                    : "bg-black/40 text-cream-parchment border-white/10 hover:border-whiskey-gold/50"
                }`}
                style={{ fontFamily: 'Lato, sans-serif' }}
              >
                {room.is_paused ? "Unpause" : "Pause"}
              </button>
            )}
            {canDeal && (
              <button
                onClick={handleDealHand}
                className="animate-pulse rounded-md bg-whiskey-gold px-2 py-1.5 sm:px-3 sm:py-2 text-xs sm:text-sm font-bold text-tokyo-night shadow-lg glow-gold hover:bg-whiskey-gold/90 transition-colors"
                style={{ fontFamily: 'Lato, sans-serif' }}
              >
                Deal Hand
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Table Area - fills remaining space */}
      <div className="flex-1 flex items-center justify-center px-4 pb-4 relative z-10">
        <div className="w-full h-full max-w-6xl flex items-center justify-center">
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
            phase={gameState?.phase}
            onSeatClick={handleSeatClick}
          />
        </div>
      </div>

      {/* Game Status Messages - Overlays */}
      {!gameState && room.is_paused && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center glass px-4 py-3 sm:px-6 sm:py-4 rounded-lg z-20 max-w-sm">
          <p className="text-lg sm:text-2xl font-bold text-whiskey-gold glow-gold" style={{ fontFamily: 'Playfair Display, serif' }}>
            ⏸ GAME PAUSED
          </p>
          <p className="text-xs sm:text-sm mt-2 text-cream-parchment" style={{ fontFamily: 'Lato, sans-serif' }}>
            {isOwner
              ? "Click 'Unpause' to resume"
              : "Waiting for owner to unpause..."}
          </p>
        </div>
      )}

      {!gameState && seatedPlayers < 2 && !room.is_paused && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center glass px-4 py-3 sm:px-6 sm:py-4 rounded-lg z-20 max-w-sm">
          <p className="text-sm sm:text-lg text-cream-parchment" style={{ fontFamily: 'Lato, sans-serif' }}>
            Waiting for players... ({seatedPlayers}/2 minimum)
          </p>
        </div>
      )}

      {gameState?.phase === "showdown" && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center glass px-6 py-4 sm:px-8 sm:py-6 rounded-lg z-20 max-w-sm">
          <p className="text-xl sm:text-2xl font-bold text-whiskey-gold glow-gold" style={{ fontFamily: 'Playfair Display, serif' }}>
            SHOWDOWN!
          </p>
          <p className="text-sm text-cream-parchment mt-2" style={{ fontFamily: 'Lato, sans-serif' }}>Determining winners...</p>
        </div>
      )}

      {/* Action Panel - Fixed at bottom */}
      {isMyTurn && myPlayer && gameState && room && (
        <div className="flex-shrink-0">
          <ActionPanel
            playerChips={myPlayer.chip_stack}
            playerCurrentBet={myPlayer.current_bet ?? 0}
            currentBet={gameState.current_bet ?? 0}
            potSize={gameState.pot_size ?? 0}
            bigBlind={room.big_blind}
            lastRaiseAmount={gameState.min_raise ?? room.big_blind}
            onAction={handleAction}
          />
        </div>
      )}

      {/* Join Modal */}
      {showJoinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-tokyo-night/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-lg glass border border-whiskey-gold/30 p-4 sm:p-6 shadow-2xl">
            <h2 className="mb-4 text-xl sm:text-2xl font-bold text-cream-parchment" style={{ fontFamily: 'Playfair Display, serif' }}>
              Join Table
            </h2>
            <form onSubmit={handleJoinTable} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-cigar-ash" style={{ fontFamily: 'Lato, sans-serif' }}>
                  Display Name
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-cream-parchment focus:border-whiskey-gold focus:outline-none focus:ring-1 focus:ring-whiskey-gold backdrop-blur-sm"
                  style={{ fontFamily: 'Lato, sans-serif' }}
                  required
                  maxLength={20}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-cigar-ash" style={{ fontFamily: 'Lato, sans-serif' }}>
                  Buy-in Amount (${room.min_buy_in} - ${room.max_buy_in})
                </label>
                <input
                  type="number"
                  value={buyInAmount}
                  onChange={(e) => setBuyInAmount(Number(e.target.value))}
                  className="mt-1 block w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-cream-parchment focus:border-whiskey-gold focus:outline-none focus:ring-1 focus:ring-whiskey-gold backdrop-blur-sm"
                  style={{ fontFamily: 'Roboto Mono, monospace' }}
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
                  style={{ fontFamily: 'Lato, sans-serif' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isJoining}
                  className="flex-1 rounded-md bg-whiskey-gold px-4 py-2 font-bold text-tokyo-night hover:bg-whiskey-gold/90 disabled:opacity-50 transition-colors"
                  style={{ fontFamily: 'Lato, sans-serif' }}
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
            <h2 className="mb-4 text-xl sm:text-2xl font-bold text-cream-parchment" style={{ fontFamily: 'Playfair Display, serif' }}>
              Add Chips
            </h2>
            <div className="mb-4 text-sm text-cigar-ash" style={{ fontFamily: 'Roboto Mono, monospace' }}>
              <p>Current stack: <span className="font-semibold text-cream-parchment">${myPlayer.chip_stack}</span></p>
              <p>Maximum stack: <span className="font-semibold text-cream-parchment">${room.max_buy_in}</span></p>
              <p>Maximum you can add: <span className="font-semibold text-whiskey-gold">${room.max_buy_in - myPlayer.chip_stack}</span></p>
            </div>
            <form onSubmit={handleRebuy} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-cigar-ash" style={{ fontFamily: 'Lato, sans-serif' }}>
                  Amount to Add
                </label>
                <input
                  type="number"
                  value={rebuyAmount}
                  onChange={(e) => setRebuyAmount(Number(e.target.value))}
                  className="mt-1 block w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-cream-parchment focus:border-whiskey-gold focus:outline-none focus:ring-1 focus:ring-whiskey-gold backdrop-blur-sm"
                  style={{ fontFamily: 'Roboto Mono, monospace' }}
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
                  style={{ fontFamily: 'Lato, sans-serif' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isRebuying}
                  className="flex-1 rounded-md bg-whiskey-gold px-4 py-2 font-bold text-tokyo-night hover:bg-whiskey-gold/90 disabled:opacity-50 transition-colors"
                  style={{ fontFamily: 'Lato, sans-serif' }}
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
              <h2 className="text-xl sm:text-2xl font-bold text-cream-parchment" style={{ fontFamily: 'Playfair Display, serif' }}>
                Buy-in Statistics
              </h2>
              <button
                onClick={() => setShowStatsModal(false)}
                className="text-cigar-ash hover:text-cream-parchment transition-colors"
              >
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-cigar-ash" style={{ fontFamily: 'Lato, sans-serif' }}>
                      Seat
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-cigar-ash" style={{ fontFamily: 'Lato, sans-serif' }}>
                      Player
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-cigar-ash" style={{ fontFamily: 'Lato, sans-serif' }}>
                      Buy-in
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-cigar-ash" style={{ fontFamily: 'Lato, sans-serif' }}>
                      Stack
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-cigar-ash" style={{ fontFamily: 'Lato, sans-serif' }}>
                      Profit/Loss
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {players
                    .filter((p) => !p.is_spectating)
                    .sort((a, b) => a.seat_number - b.seat_number)
                    .map((player) => {
                      const profitLoss = player.chip_stack - player.total_buy_in;
                      const isProfit = profitLoss > 0;
                      const isLoss = profitLoss < 0;
                      const isMe = player.id === myPlayer?.id;

                      return (
                        <tr key={player.id} className={isMe ? "bg-whiskey-gold/10" : ""}>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-cream-parchment" style={{ fontFamily: 'Roboto Mono, monospace' }}>
                            {player.seat_number + 1}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-cream-parchment" style={{ fontFamily: 'Lato, sans-serif' }}>
                            {player.display_name}
                            {isMe && (
                              <span className="ml-2 text-xs text-whiskey-gold">(You)</span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-cream-parchment" style={{ fontFamily: 'Roboto Mono, monospace' }}>
                            ${player.total_buy_in}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-cream-parchment" style={{ fontFamily: 'Roboto Mono, monospace' }}>
                            ${player.chip_stack}
                          </td>
                          <td className={`whitespace-nowrap px-4 py-3 text-right text-sm font-semibold ${
                            isProfit ? "text-whiskey-gold" : isLoss ? "text-velvet-red" : "text-cream-parchment"
                          }`} style={{ fontFamily: 'Roboto Mono, monospace' }}>
                            {profitLoss > 0 ? "+" : ""}${profitLoss}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
                <tfoot className="border-t border-whiskey-gold/30">
                  <tr>
                    <td colSpan={2} className="px-4 py-3 text-sm font-bold text-cream-parchment" style={{ fontFamily: 'Lato, sans-serif' }}>
                      Total
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-bold text-cream-parchment" style={{ fontFamily: 'Roboto Mono, monospace' }}>
                      ${players
                        .filter((p) => !p.is_spectating)
                        .reduce((sum, p) => sum + p.total_buy_in, 0)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-bold text-cream-parchment" style={{ fontFamily: 'Roboto Mono, monospace' }}>
                      ${players
                        .filter((p) => !p.is_spectating)
                        .reduce((sum, p) => sum + p.chip_stack, 0)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-bold text-cream-parchment" style={{ fontFamily: 'Roboto Mono, monospace' }}>
                      $0
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="mt-4">
              <button
                onClick={() => setShowStatsModal(false)}
                className="w-full rounded-md bg-black/40 border border-white/10 px-4 py-2 text-cream-parchment hover:border-whiskey-gold/50 transition-colors"
                style={{ fontFamily: 'Lato, sans-serif' }}
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
