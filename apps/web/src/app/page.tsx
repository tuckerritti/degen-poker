"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/hooks/useSession";

type GameMode =
  | "double-board-plo"
  | "indian-poker"
  | "holdem-flips"
  | "321"
  | "54321";

interface GameModeConfig {
  id: GameMode;
  name: string;
  enabled: boolean;
}

const GAME_MODES: GameModeConfig[] = [
  {
    id: "double-board-plo",
    name: "Double Board Bomb Pot PLO",
    enabled: true,
  },
  {
    id: "indian-poker",
    name: "Indian Poker",
    enabled: false,
  },
  {
    id: "holdem-flips",
    name: "Texas Hold'em Flips",
    enabled: false,
  },
  {
    id: "321",
    name: "321",
    enabled: false,
  },
  {
    id: "54321",
    name: "54321",
    enabled: false,
  },
];

export default function Home() {
  const router = useRouter();
  const { sessionId, accessToken } = useSession();
  const [selectedMode, setSelectedMode] =
    useState<GameMode>("double-board-plo");
  const [isCreating, setIsCreating] = useState(false);

  // Create room form state
  const [smallBlind, setSmallBlind] = useState(5);
  const [bigBlind, setBigBlind] = useState(10);
  const [minBuyIn, setMinBuyIn] = useState(200);
  const [maxBuyIn, setMaxBuyIn] = useState(1000);

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionId) return;
    if (!process.env.NEXT_PUBLIC_ENGINE_URL) {
      alert("Engine URL not configured");
      return;
    }

    const selectedConfig = GAME_MODES.find((mode) => mode.id === selectedMode);
    if (!selectedConfig?.enabled) return;

    setIsCreating(true);

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_ENGINE_URL.replace(/\/+$/, "")}/rooms`,
        {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          smallBlind,
          bigBlind,
          minBuyIn,
          maxBuyIn,
          bombPotAnte: bigBlind * 2, // Bomb pot ante = 2x big blind
          ownerAuthUserId: sessionId,
        }),
        },
      );

      const data = await response.json();

      if (response.ok) {
        router.push(`/room/${data.room.id}`);
      } else {
        alert(data.error || "Failed to create room");
      }
    } catch (error) {
      console.error("Error creating room:", error);
      alert("Failed to create room");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-tokyo-night p-4">
      <main className="w-full max-w-4xl">
        <div className="mb-6 sm:mb-8 text-center">
          <h1
            className="mb-2 text-4xl sm:text-6xl font-bold text-cream-parchment glow-gold"
            style={{ fontFamily: "Cinzel, serif" }}
          >
            DEGEN POKER
          </h1>
        </div>

        <div className="glass rounded-lg p-4 sm:p-8 shadow-2xl">
          <h2
            className="mb-4 sm:mb-6 text-xl sm:text-2xl font-bold text-cream-parchment"
            style={{ fontFamily: "Playfair Display, serif" }}
          >
            Select Game Mode
          </h2>

          <div className="mb-6 sm:mb-8 grid gap-3 sm:gap-4 md:grid-cols-2">
            {GAME_MODES.map((mode) => (
              <button
                key={mode.id}
                onClick={() => setSelectedMode(mode.id)}
                disabled={!mode.enabled}
                className={`rounded-lg border-2 p-3 sm:p-4 text-center transition-all ${
                  selectedMode === mode.id && mode.enabled
                    ? "border-whiskey-gold bg-royal-blue/30 shadow-lg"
                    : mode.enabled
                      ? "border-white/10 bg-black/20 hover:border-whiskey-gold/50 hover:bg-royal-blue/20"
                      : "border-white/5 bg-black/10 cursor-not-allowed opacity-40"
                }`}
              >
                <h3
                  className={`text-sm sm:text-base font-bold ${selectedMode === mode.id && mode.enabled ? "text-whiskey-gold" : "text-cream-parchment"}`}
                  style={{ fontFamily: "Lato, sans-serif" }}
                >
                  {mode.name}
                </h3>
                {!mode.enabled && (
                  <span className="mt-2 inline-block text-xs font-semibold text-cigar-ash">
                    COMING SOON
                  </span>
                )}
              </button>
            ))}
          </div>

          <form onSubmit={handleCreateRoom} className="space-y-3 sm:space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <div>
                <label
                  className="block text-sm font-medium text-cigar-ash"
                  style={{ fontFamily: "Lato, sans-serif" }}
                >
                  Small Blind
                </label>
                <input
                  type="number"
                  value={smallBlind}
                  onChange={(e) => setSmallBlind(Number(e.target.value))}
                  className="mt-1 block w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-cream-parchment shadow-sm focus:border-whiskey-gold focus:outline-none focus:ring-1 focus:ring-whiskey-gold backdrop-blur-sm"
                  style={{ fontFamily: "Roboto Mono, monospace" }}
                  min="1"
                  required
                />
              </div>
              <div>
                <label
                  className="block text-sm font-medium text-cigar-ash"
                  style={{ fontFamily: "Lato, sans-serif" }}
                >
                  Big Blind
                </label>
                <input
                  type="number"
                  value={bigBlind}
                  onChange={(e) => setBigBlind(Number(e.target.value))}
                  className="mt-1 block w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-cream-parchment shadow-sm focus:border-whiskey-gold focus:outline-none focus:ring-1 focus:ring-whiskey-gold backdrop-blur-sm"
                  style={{ fontFamily: "Roboto Mono, monospace" }}
                  min={smallBlind + 1}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <div>
                <label
                  className="block text-sm font-medium text-cigar-ash"
                  style={{ fontFamily: "Lato, sans-serif" }}
                >
                  Min Buy-in
                </label>
                <input
                  type="number"
                  value={minBuyIn}
                  onChange={(e) => setMinBuyIn(Number(e.target.value))}
                  className="mt-1 block w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-cream-parchment shadow-sm focus:border-whiskey-gold focus:outline-none focus:ring-1 focus:ring-whiskey-gold backdrop-blur-sm"
                  style={{ fontFamily: "Roboto Mono, monospace" }}
                  min={bigBlind * 20}
                  required
                />
              </div>
              <div>
                <label
                  className="block text-sm font-medium text-cigar-ash"
                  style={{ fontFamily: "Lato, sans-serif" }}
                >
                  Max Buy-in
                </label>
                <input
                  type="number"
                  value={maxBuyIn}
                  onChange={(e) => setMaxBuyIn(Number(e.target.value))}
                  className="mt-1 block w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-cream-parchment shadow-sm focus:border-whiskey-gold focus:outline-none focus:ring-1 focus:ring-whiskey-gold backdrop-blur-sm"
                  style={{ fontFamily: "Roboto Mono, monospace" }}
                  min={minBuyIn + 1}
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={
                isCreating ||
                !GAME_MODES.find((mode) => mode.id === selectedMode)?.enabled
              }
              className="w-full rounded-md bg-whiskey-gold px-4 py-3 font-bold text-tokyo-night shadow-lg hover:bg-whiskey-gold/90 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-whiskey-gold focus:ring-offset-2 focus:ring-offset-tokyo-night disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              style={{ fontFamily: "Lato, sans-serif" }}
            >
              {isCreating ? "Creating..." : "Create Room"}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
