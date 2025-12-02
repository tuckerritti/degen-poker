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

  // Calculate seat positions in an ellipse around the table
  const getSeatPosition = (seatNumber: number) => {
    const angle = (seatNumber / maxPlayers) * 2 * Math.PI - Math.PI / 2;
    // Mobile: Portrait oval (taller than wide)
    // Desktop: Landscape oval (wider than tall)
    const radiusX = isMobile ? 40 : 45;
    const radiusY = isMobile ? 42 : 35;
    const x = 50 + radiusX * Math.cos(angle);
    const y = 50 + radiusY * Math.sin(angle);
    return { x, y };
  };

  return (
    <div className="relative mx-auto aspect-[3/4] sm:aspect-[4/3] w-full max-w-5xl">
      {/* Poker table surface */}
      <div className="absolute inset-0 flex items-center justify-center p-4 sm:p-8">
        <div className="h-full w-full rounded-[50%] border-4 sm:border-8 border-mahogany bg-royal-blue shadow-2xl">
          {/* Table inner border */}
          <div className="h-full w-full rounded-[50%] border-2 sm:border-4 border-mahogany/50"></div>
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
            onClick={() => isEmpty && onSeatClick(seatNumber)}
            disabled={!isEmpty}
            className={`absolute -translate-x-1/2 -translate-y-1/2 transition-all ${
              isEmpty ? "cursor-pointer hover:scale-105" : "cursor-default"
            }`}
            style={{
              left: `${position.x}%`,
              top: `${position.y}%`,
            }}
          >
            {/* Seat container */}
            <div
              className={`relative z-10 min-w-24 sm:min-w-32 rounded-lg border-2 px-2 py-2 sm:px-4 sm:py-3 shadow-lg backdrop-blur-md ${
                isEmpty
                  ? "border-white/20 bg-black/40 hover:border-whiskey-gold/50 hover:bg-black/50"
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
                className={`absolute left-1/2 -translate-x-1/2 ${isMyPlayer && myHoleCards.length > 0 ? "-top-20 sm:-top-28 z-10" : "-top-16 sm:-top-20 z-0"}`}
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
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-2">
        {/* Community Cards */}
        {boardA.length > 0 && phase && (
          <CommunityCards
            boardA={boardA}
            boardB={boardB}
            phase={phase}
            myHoleCards={myHoleCards}
          />
        )}

        {/* Pot Display */}
        <div className="glass rounded-lg px-3 sm:px-4 py-1 sm:py-1.5 border border-whiskey-gold/30 shadow-lg">
          <div className="text-center">
            <div
              className="text-base sm:text-xl font-bold text-whiskey-gold glow-gold"
              style={{ fontFamily: "Roboto Mono, monospace" }}
            >
              ${potSize}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
