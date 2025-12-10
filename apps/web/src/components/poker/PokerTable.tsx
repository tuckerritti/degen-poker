import { useState, useEffect } from "react";
import type { RoomPlayer } from "@/types/database";
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
  potSize?: number;
  sidePots?: Array<{ amount: number; eligibleSeats: number[] }>;
  phase?: string;
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
  potSize = 0,
  sidePots = [],
  phase,
  onSeatClick,
}: PokerTableProps) {
  // Detect mobile viewport
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window !== "undefined") {
      return window.matchMedia("(max-width: 640px)").matches;
    }
    return false;
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 640px)");
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, []);

  // Rotate felt sideways on mobile for better use of vertical space; seats stay upright
  const tableRotation = isMobile ? 90 : 0;
  // Enlarge felt on mobile only (cards/seats unaffected)
  const tableScale = isMobile ? 1.3 : 1;

  // Get seated players (not spectators)
  const seatedPlayers = players.filter((p) => !p.is_spectating);
  const occupiedSeats = new Map(seatedPlayers.map((p) => [p.seat_number, p]));

  // Check if current user already has a seat
  const userHasSeat = seatedPlayers.some((p) => p.id === myPlayerId);

  // Helper function to find next occupied seat clockwise from a position
  const findNextOccupiedSeat = (startSeat: number): number | null => {
    if (seatedPlayers.length === 0) return null;

    for (let i = 1; i <= maxPlayers; i++) {
      const nextSeat = (startSeat + i) % maxPlayers;
      if (occupiedSeats.has(nextSeat)) {
        return nextSeat;
      }
    }
    return null;
  };

  // Calculate small blind and big blind positions (next occupied seats clockwise)
  let smallBlindSeat: number | null = null;
  let bigBlindSeat: number | null = null;

  if (buttonSeat !== null && buttonSeat !== undefined) {
    smallBlindSeat = findNextOccupiedSeat(buttonSeat);
    if (smallBlindSeat !== null) {
      bigBlindSeat = findNextOccupiedSeat(smallBlindSeat);
    }
  }

  // Calculate seat positions on a flattened "stadium" path so ends feel rounded
  const getSeatPosition = (seatNumber: number) => {
    const angle = (seatNumber / maxPlayers) * 2 * Math.PI - Math.PI / 2;
    // "Superellipse" keeps top/bottom tight while giving straight-ish sides
    // Mobile: pull seats inward on the x-axis, stretch on y-axis to use vertical space
    const radiusX = isMobile ? 38 : 48;
    const radiusY = isMobile ? 52 : 38;
    const n = 4; // higher = squarer sides
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const x =
      50 +
      radiusX *
        Math.sign(cos) *
        Math.pow(Math.abs(cos), 2 / n);
    const y =
      50 +
      radiusY *
        Math.sign(sin) *
        Math.pow(Math.abs(sin), 2 / n);
    return { x, y };
  };

  return (
    <div className="relative mx-auto aspect-[3/2] sm:aspect-[4/3] w-full max-w-[100vw] sm:max-w-5xl max-h-[98vh] sm:max-h-none overflow-visible">
      {/* Poker table surface */}
      <div className="absolute inset-0 flex items-center justify-center p-0 sm:p-8">
        <div
          className="relative h-full w-full transition-transform duration-500"
          style={{ transform: `rotate(${tableRotation}deg) scale(${tableScale})` }}
        >
          <svg
            className="h-full w-full"
            viewBox="-4 -4 108 68"
            preserveAspectRatio="xMidYMid meet"
            style={{ overflow: "visible" }}
          >
            <defs>
              <linearGradient id="felt" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#14213d" />
                <stop offset="100%" stopColor="#0f1b33" />
              </linearGradient>
              <linearGradient id="rail" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#4f1b1b" />
                <stop offset="100%" stopColor="#2d0f0f" />
              </linearGradient>
            </defs>

            {/* Outer rail with stadium silhouette */}
            <path
              d="M25 5 H75 A25 25 0 0 1 100 30 A25 25 0 0 1 75 55 H25 A25 25 0 0 1 0 30 A25 25 0 0 1 25 5 Z"
              fill="url(#rail)"
              stroke="#5e2525"
              strokeWidth="1.5"
            />

            {/* Inner felt */}
            <path
              d="M28 10 H72 A20 20 0 0 1 92 30 A20 20 0 0 1 72 50 H28 A20 20 0 0 1 8 30 A20 20 0 0 1 28 10 Z"
              fill="url(#felt)"
              stroke="#e0c58f"
              strokeWidth="0.8"
              strokeOpacity="0.6"
            />

            {/* Inscription */}
            <text
              x="50"
              y="33"
              textAnchor="middle"
              fontSize="5"
              fontFamily="Cinzel, serif"
              letterSpacing="0.25"
              fill="#0b152a" // slightly darker than the felt for subtle emboss
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
        const hasButton = buttonSeat === seatNumber;
        const isSmallBlind = smallBlindSeat === seatNumber;
        const isBigBlind = bigBlindSeat === seatNumber;

        return (
          <button
            key={seatNumber}
            onClick={() => isEmpty && !userHasSeat && onSeatClick(seatNumber)}
            disabled={!isEmpty || userHasSeat}
            className={`absolute -translate-x-1/2 -translate-y-1/2 transition-all ${
              isEmpty && !userHasSeat
                ? "cursor-pointer hover:scale-105"
                : "cursor-default"
            }`}
            style={{
              left: `${position.x}%`,
              top: `${position.y}%`,
            }}
          >
            {/* Seat container */}
            <div
              className={`relative z-10 min-w-20 sm:min-w-28 lg:min-w-32 rounded-lg border-2 px-2 py-2 sm:px-4 sm:py-3 shadow-lg backdrop-blur-md ${
                isEmpty && !userHasSeat
                  ? "border-white/20 bg-black/40 hover:border-whiskey-gold/50 hover:bg-black/50"
                  : isEmpty && userHasSeat
                    ? "border-white/20 bg-black/40"
                    : isMyPlayer
                      ? "border-whiskey-gold bg-whiskey-gold/20"
                      : "border-white/20 bg-black/40"
              } ${
                isCurrentActor
                  ? "ring-2 sm:ring-4 ring-whiskey-gold ring-offset-1 sm:ring-offset-2 ring-offset-royal-blue glow-gold"
                  : ""
              }`}
              style={{ fontFamily: "Lato, sans-serif" }}
            >
              {isEmpty ? (
                <div className="text-center">
                  <div className="text-xs font-semibold text-cigar-ash">
                    Seat {seatNumber + 1}
                  </div>
                  {!userHasSeat && (
                    <div className="text-xs text-cigar-ash hidden sm:block">
                      Click to sit
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center">
                  <div className="text-xs sm:text-sm font-bold text-cream-parchment truncate">
                    {player.display_name}
                  </div>
                  <div
                    className="mt-1 text-base sm:text-lg font-bold text-whiskey-gold"
                    style={{ fontFamily: "Roboto Mono, monospace" }}
                  >
                    ${player.chip_stack}
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

            {/* Small Blind indicator */}
            {isSmallBlind && !hasButton && (
              <div className="absolute -left-2 -top-2 z-20 flex h-7 w-7 items-center justify-center rounded-full bg-royal-blue border-2 border-whiskey-gold shadow-lg">
                <span
                  className="text-xs font-bold text-whiskey-gold"
                  style={{ fontFamily: "Lato, sans-serif" }}
                >
                  SB
                </span>
              </div>
            )}

            {/* Big Blind indicator */}
            {isBigBlind && !hasButton && (
              <div className="absolute -left-2 -top-2 z-20 flex h-7 w-7 items-center justify-center rounded-full bg-royal-blue border-2 border-whiskey-gold shadow-lg">
                <span
                  className="text-xs font-bold text-whiskey-gold"
                  style={{ fontFamily: "Lato, sans-serif" }}
                >
                  BB
                </span>
              </div>
            )}

            {/* Player Hole Cards - shown above seat */}
            {!isEmpty && phase && !player.has_folded && (
              <div
                className={`absolute left-1/2 -translate-x-1/2 ${
                  isMyPlayer && myHoleCards.length > 0
                    ? "-top-18 sm:-top-28 z-10"
                    : "-top-14 sm:-top-20 z-0"
                }`}
              >
                {isMyPlayer && myHoleCards.length > 0 ? (
                  // My cards: spread out horizontally
                  <div className="flex gap-0.5 sm:gap-1">
                    {myHoleCards
                      .filter((card) => card != null)
                      .map((card, index) => (
                        <Card key={index} card={card} size="md" />
                      ))}
                  </div>
                ) : (
                  // Other players: fanned out face-down cards
                  <div
                    className="relative flex items-center justify-center"
                    style={{
                      width: isMobile ? "80px" : "100px",
                      height: isMobile ? "52px" : "64px",
                    }}
                  >
                    {[0, 1, 2, 3].map((cardIndex) => {
                      const rotation = (cardIndex - 1.5) * 8; // -12deg, -4deg, 4deg, 12deg
                      const xOffset = (cardIndex - 1.5) * (isMobile ? 12 : 16); // Horizontal spacing

                      return (
                        <div
                          key={cardIndex}
                          className="absolute"
                          style={{
                            transform: `translateX(${xOffset}px) rotate(${rotation}deg)`,
                            zIndex: cardIndex,
                          }}
                        >
                          <Card card="Ah" faceDown={true} size="md" />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </button>
        );
      })}

      {/* Center - Community Cards and Pot */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
        {/* Pot Display (left on desktop, below on mobile) */}
        <div className="order-2 sm:order-1 flex flex-col gap-2">
          {/* Main pot */}
          <div className="glass rounded-lg px-3 sm:px-4 py-1 sm:py-1.5 border border-whiskey-gold/30 shadow-lg">
            <div className="text-center">
              <div
                className="text-base sm:text-xl font-bold text-whiskey-gold glow-gold"
                style={{ fontFamily: "Roboto Mono, monospace" }}
              >
                ${potSize}
              </div>
              {sidePots && sidePots.length > 1 && (
                <div className="text-xs text-cigar-ash mt-0.5">Main Pot</div>
              )}
            </div>
          </div>

          {/* Side pots */}
          {sidePots && sidePots.length > 1 && sidePots.slice(1).map((sidePot, idx) => (
            <div
              key={idx}
              className="glass rounded-lg px-3 sm:px-4 py-1 sm:py-1.5 border border-whiskey-gold/20 shadow-lg"
            >
              <div className="text-center">
                <div
                  className="text-sm sm:text-base font-bold text-whiskey-gold/80"
                  style={{ fontFamily: "Roboto Mono, monospace" }}
                >
                  ${sidePot.amount}
                </div>
                <div className="text-xs text-cigar-ash">Side Pot {idx + 1}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Community Cards */}
        {boardA.length > 0 && phase && (
          <div className="order-1 sm:order-2 scale-95 sm:scale-100">
            <CommunityCards
              boardA={boardA}
              boardB={boardB}
              phase={phase}
              myHoleCards={myHoleCards}
            />
          </div>
        )}
      </div>
    </div>
  );
}
