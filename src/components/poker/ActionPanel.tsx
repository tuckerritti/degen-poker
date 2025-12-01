"use client";

import { useState } from "react";
import { getBettingLimits } from "@/lib/poker/betting";

interface ActionPanelProps {
  playerChips: number;
  playerCurrentBet: number;
  currentBet: number;
  potSize: number;
  bigBlind: number;
  lastRaiseAmount?: number;
  onAction: (actionType: string, amount?: number) => void;
  disabled?: boolean;
}

export function ActionPanel({
  playerChips,
  playerCurrentBet,
  currentBet,
  potSize,
  bigBlind,
  lastRaiseAmount = 0,
  onAction,
  disabled = false,
}: ActionPanelProps) {
  const [betAmount, setBetAmount] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const limits = getBettingLimits(
    playerChips,
    playerCurrentBet,
    currentBet,
    potSize,
    lastRaiseAmount,
    bigBlind,
  );

  const handleAction = async (actionType: string, amount?: number) => {
    setIsSubmitting(true);
    try {
      await onAction(actionType, amount);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQuickBet = (multiplier: number) => {
    // In PLO, pot-sized bet = call + pot after call
    // limits.maxBet already uses the correct formula
    const potSizedBet = limits.maxBet;
    const minBet = limits.minBet;

    // Calculate fractional bet between min and pot-sized
    const range = potSizedBet - minBet;
    const quickBet = Math.floor(minBet + (range * multiplier));

    const capped = Math.min(Math.max(quickBet, limits.minBet), limits.maxBet);
    setBetAmount(capped);
  };

  return (
    <div className="glass border-t border-whiskey-gold/20 p-3 sm:p-4" style={{ fontFamily: 'Lato, sans-serif' }}>
      <div className="mx-auto max-w-full sm:max-w-4xl">
        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
          {/* Row 1: Fold + Check/Call */}
          <div className="flex gap-2">
            {/* Fold */}
            {limits.canFold && (
              <button
                onClick={() => handleAction("fold")}
                disabled={disabled || isSubmitting}
                className="flex-1 sm:flex-none rounded-lg bg-velvet-red border border-velvet-red px-8 sm:px-12 py-3 font-bold text-cream-parchment shadow-lg transition-all hover:bg-velvet-red/90 hover:scale-105 disabled:opacity-50 disabled:hover:scale-100 touch-target"
              >
                Fold
              </button>
            )}

            {/* Check */}
            {limits.canCheck && (
              <button
                onClick={() => handleAction("check")}
                disabled={disabled || isSubmitting}
                className="flex-1 sm:flex-none rounded-lg bg-black/40 border border-white/20 px-8 sm:px-12 py-3 font-bold text-cream-parchment shadow-lg transition-all hover:border-whiskey-gold/50 hover:scale-105 disabled:opacity-50 disabled:hover:scale-100 touch-target"
              >
                Check
              </button>
            )}

            {/* Call */}
            {limits.canCall && !limits.canCheck && (
              <button
                onClick={() => handleAction("call")}
                disabled={disabled || isSubmitting}
                className="flex-1 sm:flex-none rounded-lg bg-whiskey-gold border border-whiskey-gold px-8 sm:px-12 py-3 font-bold text-tokyo-night shadow-lg transition-all hover:bg-whiskey-gold/90 hover:scale-105 disabled:opacity-50 disabled:hover:scale-100 touch-target"
                style={{ fontFamily: 'Roboto Mono, monospace' }}
              >
                Call ${limits.callAmount}
              </button>
            )}
          </div>

          {/* Row 2: Bet/Raise Section */}
          {limits.canRaise && (
            <div className="flex flex-col sm:flex-row flex-1 gap-2">
              <div className="flex flex-1 flex-col gap-2">
                {/* Slider */}
                <input
                  type="range"
                  min={limits.minBet}
                  max={limits.maxBet}
                  value={betAmount}
                  onChange={(e) => setBetAmount(Number(e.target.value))}
                  className="w-full accent-whiskey-gold h-8"
                  disabled={disabled || isSubmitting}
                />

                {/* Quick bet buttons */}
                <div className="flex gap-2">
                  <button
                    onClick={() => handleQuickBet(0.5)}
                    disabled={disabled || isSubmitting}
                    className="flex-1 rounded bg-mahogany border border-white/10 px-2 py-2 text-xs sm:text-xs text-cream-parchment hover:border-whiskey-gold/50 disabled:opacity-50 transition-colors"
                  >
                    1/2 Pot
                  </button>
                  <button
                    onClick={() => handleQuickBet(0.75)}
                    disabled={disabled || isSubmitting}
                    className="flex-1 rounded bg-mahogany border border-white/10 px-2 py-2 text-xs sm:text-xs text-cream-parchment hover:border-whiskey-gold/50 disabled:opacity-50 transition-colors"
                  >
                    3/4 Pot
                  </button>
                  <button
                    onClick={() => handleQuickBet(1)}
                    disabled={disabled || isSubmitting}
                    className="flex-1 rounded bg-mahogany border border-white/10 px-2 py-2 text-xs sm:text-xs text-cream-parchment hover:border-whiskey-gold/50 disabled:opacity-50 transition-colors"
                  >
                    Pot
                  </button>
                  <button
                    onClick={() => setBetAmount(playerChips)}
                    disabled={disabled || isSubmitting || playerChips > limits.maxBet}
                    className="flex-1 rounded bg-mahogany border border-white/10 px-2 py-2 text-xs sm:text-xs text-cream-parchment hover:border-whiskey-gold/50 disabled:opacity-50 transition-colors"
                  >
                    All-In
                  </button>
                </div>
              </div>

              {/* Bet/Raise Button */}
              <button
                onClick={() =>
                  handleAction(
                    currentBet === 0 ? "bet" : "raise",
                    betAmount,
                  )
                }
                disabled={
                  disabled ||
                  isSubmitting ||
                  betAmount < limits.minBet ||
                  betAmount > limits.maxBet
                }
                className="rounded-lg bg-whiskey-gold border border-whiskey-gold px-8 sm:px-12 py-3 font-bold text-tokyo-night shadow-lg transition-all hover:bg-whiskey-gold/90 hover:scale-105 disabled:opacity-50 disabled:hover:scale-100 touch-target"
              >
                <div className="text-xs">
                  {currentBet === 0 ? "Bet" : "Raise"}
                </div>
                <div className="text-lg" style={{ fontFamily: 'Roboto Mono, monospace' }}>${betAmount}</div>
              </button>
            </div>
          )}

          {/* All-In (when can't raise normally) */}
          {!limits.canRaise && playerChips > 0 && (
            <button
              onClick={() => handleAction("all_in")}
              disabled={disabled || isSubmitting}
              className="w-full sm:w-auto rounded-lg bg-whiskey-gold border border-whiskey-gold px-8 sm:px-12 py-3 font-bold text-tokyo-night shadow-lg transition-all hover:bg-whiskey-gold/90 hover:scale-105 disabled:opacity-50 disabled:hover:scale-100 touch-target"
              style={{ fontFamily: 'Roboto Mono, monospace' }}
            >
              All-In ${playerChips}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
