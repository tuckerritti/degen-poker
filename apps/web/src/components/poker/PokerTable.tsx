import { useCallback, useEffect, useSyncExternalStore, useState } from "react";
import type { GameMode, RoomPlayer } from "@/types/database";
import { Card } from "./Card";
import { CommunityCards } from "./CommunityCards";

interface PokerTableProps {
  players: RoomPlayer[];
  maxPlayers: number;
  myPlayerId?: string;
  myHoleCards?: string[];
  currentActorSeat?: number | null;
  buttonSeat?: number | null;
  boardA?: string[];
  boardB?: string[];
  boardC?: string[];
  potSize?: number;
  sidePots?: Array<{ amount: number; eligibleSeats: number[] }>;
  phase?: string;
  gameMode?: GameMode | "game_mode_321";
  visiblePlayerCards?: Record<string, string[]>;
  playerPartitions?: Record<
    string,
    {
      threeBoardCards: string[];
      twoBoardCards: string[];
      oneBoardCard: string[];
    }
  >;
  showdownProgress?: number | null;
  showdownTransitionMs?: number;
  board1Winners?: number[] | null;
  board2Winners?: number[] | null;
  board3Winners?: number[] | null;
  onSeatClick: (seatNumber: number) => void;
}

export function PokerTable({
  players,
  maxPlayers,
  myPlayerId,
  myHoleCards = [],
  currentActorSeat,
  buttonSeat,
  boardA = [],
  boardB = [],
  boardC = [],
  potSize = 0,
  sidePots = [],
  phase,
  gameMode,
  visiblePlayerCards = {},
  playerPartitions = {},
  onSeatClick,
  showdownProgress = null,
  showdownTransitionMs = 0,
  board1Winners = null,
  board2Winners = null,
  board3Winners = null,
}: PokerTableProps) {
  // Detect mobile viewport without triggering hydration mismatch
  const subscribeToMobile = useCallback((callback: () => void) => {
    if (typeof window === "undefined") return () => {};
    const mediaQuery = window.matchMedia("(max-width: 640px)");
    mediaQuery.addEventListener("change", callback);
    return () => mediaQuery.removeEventListener("change", callback);
  }, []);

  const getMobileSnapshot = useCallback(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 640px)").matches,
    [],
  );

  const isMobile = useSyncExternalStore(
    subscribeToMobile,
    getMobileSnapshot,
    () => false,
  );

  // Portrait-friendly rectangular table on mobile
  const tableRotation = isMobile ? 0 : 90;
  const tableScale = 1;
  const seatBoxWidth = isMobile
    ? "clamp(56px, 18vw, 92px)"
    : "clamp(84px, 12vw, 120px)";

  // Hole card count depends on game type (1 for Indian Poker, 2 for Hold'em, 4 for PLO, 6 for 321)
  const isIndianPoker = gameMode === "indian_poker";
  const is321 = gameMode === "game_mode_321";
  const holeCardCount = isIndianPoker
    ? 1
    : gameMode === "texas_holdem"
      ? 2
      : is321
        ? 6
        : 4;
  const holeCardRotationStep =
    holeCardCount === 2
      ? 6
      : holeCardCount === 1
        ? 0
        : holeCardCount === 6
          ? 6
          : 8;
  const holeCardSpread =
    holeCardCount === 2
      ? isMobile
        ? 14
        : 18
      : holeCardCount === 1
        ? 0
        : holeCardCount === 6
          ? isMobile
            ? 10
            : 14
          : isMobile
            ? 12
            : 16;

  // State for fold card reveal (Indian Poker)
  const [revealedFoldedCard, setRevealedFoldedCard] = useState<{
    seat: number;
    card: string;
  } | null>(null);

  // Memoize player's fold status to avoid effect re-runs on players array changes
  const myPlayer = players.find((p) => p.id === myPlayerId);
  const myHasFolded = myPlayer?.has_folded ?? false;
  const mySeatNumber = myPlayer?.seat_number;

  // Helper function to group 321 cards by partition
  const getGroupedCards = (
    cards: string[],
    seatNumber: number,
  ): { group3: string[]; group2: string[]; group1: string[] } => {
    const partition = playerPartitions[seatNumber.toString()];
    if (partition) {
      return {
        group3: partition.threeBoardCards,
        group2: partition.twoBoardCards,
        group1: partition.oneBoardCard,
      };
    }
    // Fallback: split by position if no partition data
    return {
      group3: cards.slice(0, 3),
      group2: cards.slice(3, 5),
      group1: cards.slice(5, 6),
    };
  };

  // Handle fold card reveal for Indian Poker
  useEffect(() => {
    if (!isIndianPoker || !myPlayerId) return;

    // Exit early if player hasn't folded or has no cards
    if (
      !myHasFolded ||
      !myHoleCards ||
      myHoleCards.length === 0 ||
      !mySeatNumber
    ) {
      return;
    }

    const myCard = myHoleCards[0];

    // Reveal card immediately (using setTimeout to avoid cascading render warning)
    const revealTimer = setTimeout(() => {
      setRevealedFoldedCard({ seat: mySeatNumber, card: myCard });
    }, 0);

    // Hide card after 3 seconds
    const hideTimer = setTimeout(() => {
      setRevealedFoldedCard(null);
    }, 3000);

    return () => {
      clearTimeout(revealTimer);
      clearTimeout(hideTimer);
    };
  }, [isIndianPoker, myPlayerId, myHasFolded, mySeatNumber, myHoleCards]);

  // Get seated players (not spectators)
  const seatedPlayers = players.filter((p) => !p.is_spectating);
  const occupiedSeats = new Map(seatedPlayers.map((p) => [p.seat_number, p]));

  // Check if current user already has a seat
  const userHasSeat = seatedPlayers.some((p) => p.id === myPlayerId);
  const shouldHideEmptySeats = userHasSeat && !!phase && phase !== "waiting";

  // Determine if we should show side pots separately
  // Only show side pots if there's an all-in situation
  const hasAllInPlayers = seatedPlayers.some((p) => p.is_all_in);
  const shouldShowSidePots = hasAllInPlayers && sidePots.length > 1;

  // Calculate pot display values
  const mainPotAmount =
    sidePots.length > 0
      ? sidePots.reduce((sum, pot) => sum + pot.amount, 0)
      : potSize;

  const rotatePoint = (x: number, y: number, degrees: number) => {
    const rad = (degrees * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const dx = x - 50;
    const dy = y - 50;
    return {
      x: 50 + dx * cos - dy * sin,
      y: 50 + dx * sin + dy * cos,
    };
  };

  // Calculate seat positions on a flattened "stadium" path so ends feel rounded
  const getSeatPosition = (seatNumber: number) => {
    if (isMobile && maxPlayers === 9) {
      const mobileMap: Array<{ x: number; y: number }> = [
        { x: 50, y: 12 }, // top
        { x: 18, y: 26 },
        { x: 18, y: 48 },
        { x: 18, y: 70 },
        { x: 82, y: 24 },
        { x: 82, y: 42 },
        { x: 82, y: 60 },
        { x: 82, y: 78 },
        { x: 50, y: 88 }, // bottom
      ];
      const base = mobileMap[seatNumber] ?? { x: 50, y: 50 };
      return tableRotation !== 0
        ? rotatePoint(base.x, base.y, tableRotation)
        : base;
    }

    if (!isMobile && maxPlayers === 9) {
      const desktopMap: Array<{ x: number; y: number }> = [
        { x: 50, y: 16 }, // top
        { x: 22, y: 26 },
        { x: 22, y: 50 },
        { x: 22, y: 74 },
        { x: 78, y: 26 },
        { x: 78, y: 42 },
        { x: 78, y: 58 },
        { x: 78, y: 74 },
        { x: 50, y: 88 }, // bottom
      ];
      const base = desktopMap[seatNumber] ?? { x: 50, y: 50 };
      return tableRotation !== 0
        ? rotatePoint(base.x, base.y, tableRotation)
        : base;
    }

    const angle = (seatNumber / maxPlayers) * 2 * Math.PI - Math.PI / 2;
    // "Superellipse" keeps top/bottom tight while giving straight-ish sides
    // Mobile: pull seats inward on the x-axis, stretch on y-axis to use vertical space
    const radiusX = isMobile ? 31 : 46;
    const radiusY = isMobile ? 56 : 40;
    const n = 4; // higher = squarer sides
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const x = 50 + radiusX * Math.sign(cos) * Math.pow(Math.abs(cos), 2 / n);
    const y = 50 + radiusY * Math.sign(sin) * Math.pow(Math.abs(sin), 2 / n);
    const base = { x, y };
    return tableRotation !== 0
      ? rotatePoint(base.x, base.y, tableRotation)
      : base;
  };

  // Helper function to determine winner status for a seat
  const getWinnerStatus = (seatNumber: number) => {
    const wonBoards: string[] = [];

    if (board1Winners?.includes(seatNumber)) wonBoards.push("1");
    if (board2Winners?.includes(seatNumber)) wonBoards.push("2");
    if (board3Winners?.includes(seatNumber)) wonBoards.push("3");

    const isWinner = wonBoards.length > 0;

    let displayText = "";
    if (wonBoards.length === 1) {
      displayText = `Board ${wonBoards[0]}`;
    } else if (wonBoards.length === 2) {
      displayText = `Board ${wonBoards[0]} & ${wonBoards[1]}`;
    } else if (wonBoards.length === 3) {
      displayText = `Board ${wonBoards.join(", ")}`;
    }

    return { isWinner, wonBoards, displayText };
  };

  return (
    <div
      className="relative mx-auto aspect-[3/5] sm:aspect-[4/3] w-full overflow-visible"
      style={{
        maxWidth: isMobile ? "min(460px, 92vw)" : "min(1240px, 96vw)",
        maxHeight: isMobile ? "52vh" : "82vh",
        minHeight: isMobile ? "300px" : "440px",
        height: "100%",
      }}
    >
      {/* Poker table surface */}
      <div className="absolute inset-0 flex items-center justify-center p-0 sm:p-8">
        <div
          className="relative h-full w-full transition-transform duration-500"
          style={{
            transform: `rotate(${tableRotation}deg) scale(${tableScale})`,
          }}
        >
          <svg
            className="h-full w-full"
            viewBox="0 0 100 160"
            preserveAspectRatio="xMidYMid meet"
            style={{ overflow: "visible" }}
          >
            <defs>
              <linearGradient id="felt" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#1c7b32" />
                <stop offset="100%" stopColor="#0f4d22" />
              </linearGradient>
              <linearGradient id="rail" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#1b1b1f" />
                <stop offset="100%" stopColor="#0f1014" />
              </linearGradient>
            </defs>

            {/* Outer rail - rounded rectangle */}
            <rect
              x="5"
              y="5"
              width="90"
              height="150"
              rx="14"
              ry="14"
              fill="url(#rail)"
              stroke="#2a2a2f"
              strokeWidth="1.5"
            />

            {/* Inner felt */}
            <rect
              x="12"
              y="12"
              width="76"
              height="136"
              rx="12"
              ry="12"
              fill="url(#felt)"
              stroke="#e0c58f"
              strokeWidth="0.8"
              strokeOpacity="0.6"
            />

            {/* Inscription */}
            <text
              x="50"
              y="85"
              textAnchor="middle"
              fontSize="5"
              fontFamily="Cinzel, serif"
              letterSpacing="0.25"
              fill="#0b4120"
              opacity="0.7"
            >
              DEGENERATE
            </text>
          </svg>
        </div>
      </div>

      {/* Seats around the table */}
      {Array.from({ length: maxPlayers }, (_, i) => {
        const seatNumber = i;
        const player = occupiedSeats.get(seatNumber);
        const position = getSeatPosition(seatNumber);
        const isMyPlayer = player?.id === myPlayerId;
        const isCurrentActor = currentActorSeat === seatNumber;
        const isEmpty = !player;
        const isShowdownPhase = phase === "showdown" || phase === "complete";
        const visibleCards = visiblePlayerCards?.[seatNumber.toString()];
        const hasVisibleCards = !!(visibleCards && visibleCards.length > 0);
        const hasButton = buttonSeat === seatNumber;
        const shouldRaiseMyCards =
          !isIndianPoker && isMyPlayer && myHoleCards.length > 0;
        const holeCardsOffsetClass = is321
          ? shouldRaiseMyCards
            ? isMobile
              ? "-top-10"
              : "-top-16"
            : isMobile
              ? "-top-8"
              : "-top-12"
          : shouldRaiseMyCards
            ? isMobile
              ? "-top-16"
              : "-top-28"
            : isMobile
              ? "-top-12"
              : "-top-20";
        const hasFaceUpCards =
          !isEmpty &&
          isShowdownPhase &&
          (hasVisibleCards ||
            (!isIndianPoker && isMyPlayer && myHoleCards.length > 0));
        const baseHoleCardsZClass =
          isIndianPoker || !isMyPlayer || myHoleCards.length === 0
            ? "z-0"
            : "z-50";
        const holeCardsZClass = hasFaceUpCards
          ? isMyPlayer
            ? "z-50"
            : "z-30"
          : baseHoleCardsZClass;
        const seatZClass =
          !isIndianPoker && isMyPlayer && myHoleCards.length > 0
            ? "z-50"
            : "z-10";

        // Winner/loser status for showdown phase
        const winnerStatus = isShowdownPhase && !isEmpty
          ? getWinnerStatus(seatNumber)
          : null;
        const isLoser = isShowdownPhase && !isEmpty && !player.has_folded && !winnerStatus?.isWinner;

        if (shouldHideEmptySeats && isEmpty) {
          return null;
        }

        return (
          <button
            key={seatNumber}
            onClick={() => isEmpty && !userHasSeat && onSeatClick(seatNumber)}
            disabled={!isEmpty || userHasSeat}
            className={`absolute -translate-x-1/2 -translate-y-1/2 transition-all ${seatZClass} ${
              isEmpty && !userHasSeat ? "cursor-pointer" : "cursor-default"
            }`}
            style={{
              left: `${position.x}%`,
              top: `${position.y}%`,
            }}
          >
            {/* Seat container */}
            <div
              className={`relative z-10 rounded-lg border-2 px-1.5 py-1.5 sm:px-3 sm:py-2 shadow-lg backdrop-blur-md ${
                isEmpty && !userHasSeat
                  ? "border-white/20 bg-black/40 hover:border-whiskey-gold/50 hover:bg-black/50"
                  : isEmpty && userHasSeat
                    ? "border-white/20 bg-black/40"
                    : winnerStatus?.isWinner
                      ? "border-green-500/30 bg-green-900/25"
                      : isLoser
                        ? "border-red-500/30 bg-red-900/25"
                        : isMyPlayer
                          ? "border-whiskey-gold bg-whiskey-gold/20"
                          : "border-white/20 bg-black/40"
              } ${
                isCurrentActor
                  ? "ring-2 sm:ring-4 ring-whiskey-gold ring-offset-1 sm:ring-offset-2 ring-offset-royal-blue glow-gold"
                  : ""
              }`}
              style={{ fontFamily: "Lato, sans-serif", width: seatBoxWidth }}
            >
              {isEmpty ? (
                <div className="text-center">
                  <div className="text-[11px] sm:text-xs font-semibold text-cigar-ash">
                    Seat {seatNumber + 1}
                  </div>
                  {!userHasSeat && (
                    <div className="text-[10px] sm:text-[11px] text-cigar-ash hidden sm:block">
                      Click to sit
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center">
                  <div className="text-[10px] sm:text-xs font-bold text-cream-parchment truncate">
                    {player.display_name}
                  </div>
                  <div
                    className="mt-0.5 text-xs sm:text-sm font-bold"
                    style={{ fontFamily: "Lato, sans-serif" }}
                  >
                    {winnerStatus?.isWinner ? (
                      <span className="text-green-400">{winnerStatus.displayText}</span>
                    ) : isShowdownPhase && !player.has_folded ? (
                      <span className="text-red-400">Lost</span>
                    ) : (
                      <span className="text-whiskey-gold" style={{ fontFamily: "Roboto Mono, monospace" }}>
                        ${player.chip_stack}
                      </span>
                    )}
                  </div>
                  {player.has_folded && (
                    <div className="text-xs font-semibold text-velvet-red">
                      Folded
                    </div>
                  )}
                  {player.is_all_in && (
                    <div className="text-xs font-semibold text-whiskey-gold glow-gold">
                      All-In
                    </div>
                  )}
                  {player.waiting_for_next_hand && (
                    <div className="text-xs font-semibold text-cigar-ash">
                      Joining Next Hand
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Current bet chips in front of player */}
            {!isEmpty &&
              (player.current_bet ?? 0) > 0 &&
              !player.has_folded && (
                <div
                  className="mt-1 sm:mt-2 rounded bg-whiskey-gold px-1.5 sm:px-2 py-0.5 sm:py-1 text-xs font-bold text-tokyo-night shadow-lg"
                  style={{ fontFamily: "Roboto Mono, monospace" }}
                >
                  ${player.current_bet}
                </div>
              )}

            {/* Dealer button */}
            {hasButton && (
              <div className="absolute -right-2 -top-2 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-cream-parchment border-2 border-mahogany shadow-lg">
                <span
                  className="text-sm font-bold text-mahogany"
                  style={{ fontFamily: "Cinzel, serif" }}
                >
                  D
                </span>
              </div>
            )}

            {/* Player Hole Cards - hide other players' face-down cards on mobile to save space */}
            {!isEmpty &&
              phase &&
              !player.has_folded &&
              !player.waiting_for_next_hand &&
              (!isMobile || isMyPlayer) && (
                <div
                  className={`absolute left-1/2 -translate-x-1/2 ${holeCardsOffsetClass} ${holeCardsZClass}`}
                >
                  {isIndianPoker
                    ? // Indian Poker: Single card
                      // SECURITY: Use visiblePlayerCards for all players
                      // Show own card face-down during active play, face-up at showdown
                      (() => {
                        const displayCard =
                          visiblePlayerCards?.[
                            player.seat_number.toString()
                          ]?.[0] ?? null;

                        // During active play, show own card face-down
                        // At showdown/complete, show own card face-up
                        const isShowdownPhase =
                          phase === "showdown" || phase === "complete";
                        const showFaceDown = isMyPlayer && !isShowdownPhase;

                        // Always show a card (face-down during play, face-up at showdown for own card)
                        // Other players' cards always face-up
                        return displayCard ? (
                          <Card
                            card={displayCard}
                            faceDown={showFaceDown}
                            size="md"
                          />
                        ) : null;
                      })()
                    : isMyPlayer && myHoleCards.length > 0
                      ? // My cards: grouped for 321 only if partition data exists, otherwise spread
                        (() => {
                          const hasPartition =
                            is321 &&
                            myHoleCards.length === 6 &&
                            playerPartitions[player.seat_number.toString()];

                          if (hasPartition) {
                            const { group3, group2, group1 } = getGroupedCards(
                              myHoleCards,
                              player.seat_number,
                            );
                            return (
                              <div className="flex gap-2 sm:gap-3">
                                <div className="flex gap-0.5 sm:gap-1">
                                  {group3.map((card, idx) => (
                                    <Card key={idx} card={card} size="sm" />
                                  ))}
                                </div>
                                <div className="flex gap-0.5 sm:gap-1">
                                  {group2.map((card, idx) => (
                                    <Card key={idx} card={card} size="sm" />
                                  ))}
                                </div>
                                <div className="flex gap-0.5 sm:gap-1">
                                  {group1.map((card, idx) => (
                                    <Card key={idx} card={card} size="sm" />
                                  ))}
                                </div>
                              </div>
                            );
                          }

                          // Default: all cards together
                          return (
                            <div className="flex gap-0.5 sm:gap-1">
                              {myHoleCards
                                .filter((card) => card != null)
                                .map((card, index) => (
                                  <div
                                    key={index}
                                    className="transition-opacity hover:opacity-60"
                                  >
                                    <Card
                                      card={card}
                                      size={is321 ? "sm" : "md"}
                                    />
                                  </div>
                                ))}
                            </div>
                          );
                        })()
                      : (() => {
                          // Other players: check for visible cards at showdown
                          const visibleCards =
                            visiblePlayerCards?.[player.seat_number.toString()];
                          const isShowdown =
                            phase === "showdown" || phase === "complete";

                          // 321 mode at showdown: show grouped cards
                          if (
                            is321 &&
                            isShowdown &&
                            visibleCards &&
                            visibleCards.length === 6
                          ) {
                            const { group3, group2, group1 } = getGroupedCards(
                              visibleCards,
                              player.seat_number,
                            );
                            return (
                              <div className="flex gap-2 sm:gap-3">
                                <div className="flex gap-0.5 sm:gap-1">
                                  {group3.map((card, idx) => (
                                    <Card key={idx} card={card} size="sm" />
                                  ))}
                                </div>
                                <div className="flex gap-0.5 sm:gap-1">
                                  {group2.map((card, idx) => (
                                    <Card key={idx} card={card} size="sm" />
                                  ))}
                                </div>
                                <div className="flex gap-0.5 sm:gap-1">
                                  {group1.map((card, idx) => (
                                    <Card key={idx} card={card} size="sm" />
                                  ))}
                                </div>
                              </div>
                            );
                          }

                          // Default: fanned out face-down cards
                          return (
                            <div
                              className="relative flex items-center justify-center"
                              style={{
                                width: isMobile
                                  ? "clamp(64px, 24vw, 96px)"
                                  : "clamp(96px, 18vw, 120px)",
                                height: isMobile ? "52px" : "64px",
                              }}
                            >
                              {Array.from(
                                { length: holeCardCount },
                                (_, cardIndex) => {
                                  const centerOffset = (holeCardCount - 1) / 2;
                                  const rotation =
                                    (cardIndex - centerOffset) *
                                    holeCardRotationStep;
                                  const xOffset =
                                    (cardIndex - centerOffset) * holeCardSpread;

                                  return (
                                    <div
                                      key={cardIndex}
                                      className="absolute"
                                      style={{
                                        transform: `translateX(${xOffset}px) rotate(${rotation}deg)`,
                                        zIndex: cardIndex,
                                      }}
                                    >
                                      <Card
                                        card="Ah"
                                        faceDown={true}
                                        size={is321 ? "sm" : "md"}
                                      />
                                    </div>
                                  );
                                },
                              )}
                            </div>
                          );
                        })()}
                </div>
              )}

            {/* Indian Poker: Show folded card temporarily */}
            {!isEmpty &&
              player.has_folded &&
              isIndianPoker &&
              isMyPlayer &&
              revealedFoldedCard?.seat === player.seat_number && (
                <div className="absolute -top-16 left-1/2 -translate-x-1/2 z-50">
                  <Card
                    card={revealedFoldedCard.card}
                    faceDown={false}
                    size="md"
                  />
                </div>
              )}
          </button>
        );
      })}

      {/* Center - Community Cards and Pot */}
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center sm:flex-row sm:items-center gap-3 sm:gap-6 z-30"
        style={{ maxWidth: "min(90vw, 880px)" }}
      >
        {/* Pot Display (left on desktop, below on mobile) */}
        <div className="order-2 sm:order-1 flex flex-col gap-2 w-full sm:w-auto max-w-[min(82vw,320px)]">
          {/* Main pot */}
          <div className="glass rounded-lg px-3 sm:px-4 py-1 sm:py-1.5 border border-whiskey-gold/30 shadow-lg w-fit max-w-full mx-auto">
            <div className="text-center">
              <div
                className="text-base sm:text-xl font-bold text-whiskey-gold glow-gold"
                style={{ fontFamily: "Roboto Mono, monospace" }}
              >
                ${mainPotAmount}
              </div>
              {shouldShowSidePots && (
                <div className="text-xs text-cigar-ash mt-0.5">Main Pot</div>
              )}
            </div>
          </div>

          {/* Side pots - only show if there's an all-in situation */}
          {shouldShowSidePots &&
            sidePots.slice(1).map((sidePot, idx) => (
              <div
                key={idx}
                className="glass rounded-lg px-3 sm:px-4 py-1 sm:py-1.5 border border-whiskey-gold/20 shadow-lg w-fit max-w-full mx-auto"
              >
                <div className="text-center">
                  <div
                    className="text-sm sm:text-base font-bold text-whiskey-gold/80"
                    style={{ fontFamily: "Roboto Mono, monospace" }}
                  >
                    ${sidePot.amount}
                  </div>
                  <div className="text-xs text-cigar-ash">
                    Side Pot {idx + 1}
                  </div>
                </div>
              </div>
            ))}
        </div>

        {/* Community Cards */}
        {boardA.length > 0 && phase && (
          <div className="order-1 sm:order-2 scale-95 sm:scale-100 flex flex-col items-center gap-3 sm:gap-4">
            <CommunityCards
              boardA={boardA}
              boardB={boardB}
              boardC={boardC}
              phase={phase}
              myHoleCards={myHoleCards}
              gameMode={gameMode}
            />
            {showdownProgress !== null && (
              <div className="w-full flex justify-center">
                <div className="w-[min(92vw,360px)] sm:w-[420px] rounded-full bg-white/15 border border-whiskey-gold/30 shadow-lg overflow-hidden backdrop-blur-sm">
                  <div
                    className="h-3 bg-whiskey-gold shadow-[0_0_14px_rgba(255,196,90,0.65)]"
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
          </div>
        )}
      </div>
    </div>
  );
}
