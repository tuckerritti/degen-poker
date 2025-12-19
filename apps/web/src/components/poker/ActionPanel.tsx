"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { getBettingLimits } from "@/lib/poker/betting";

interface ActionPanelProps {
  playerChips: number;
  playerCurrentBet: number;
  currentBet: number;
  potSize: number;
  bigBlind: number;
  lastRaiseAmount?: number;
  gameMode?: string;
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
  gameMode = "double_board_bomb_pot_plo",
  onAction,
  disabled = false,
}: ActionPanelProps) {
  const subscribeToMobile = useCallback((callback: () => void) => {
    if (typeof window === "undefined") return () => {};
    const mq = window.matchMedia("(max-width: 640px)");
    mq.addEventListener("change", callback);
    return () => mq.removeEventListener("change", callback);
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

  // Determine if this is a pot-limit game (PLO) or no-limit game (Hold'em)
  const isPotLimit = gameMode === "double_board_bomb_pot_plo";

  // Slider reflects *additional* chips the player will put in (not total committed)
  const limits = getBettingLimits(
    playerChips,
    playerCurrentBet,
    currentBet,
    potSize,
    lastRaiseAmount,
    bigBlind,
    isPotLimit,
  );

  const extraMin = useMemo(
    () => Math.max(limits.minBet - playerCurrentBet, 0),
    [limits.minBet, playerCurrentBet],
  );
  const extraMax = useMemo(
    () => Math.max(limits.maxBet - playerCurrentBet, 0),
    [limits.maxBet, playerCurrentBet],
  );

  const [extraAmount, setExtraAmount] = useState(extraMin);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Keep slider value within new bounds when state updates (e.g., after a bet)
  useEffect(() => {
    setExtraAmount((prev) => {
      if (prev < extraMin) return extraMin;
      if (prev > extraMax) return extraMax;
      return prev;
    });
  }, [extraMin, extraMax]);

  const targetTotalBet = extraAmount + playerCurrentBet;

  const handleAction = async (actionType: string, amount?: number) => {
    setIsSubmitting(true);
    try {
      await onAction(actionType, amount);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQuickBet = (multiplier: number) => {
    const toCall = Math.max(currentBet - playerCurrentBet, 0);

    if (isPotLimit) {
      // Pot-limit: limits.maxBet already equals pot-size (call + pot after call)
      const potSizedBet = limits.maxBet;
      const minBet = limits.minBet;
      const range = potSizedBet - minBet;
      const quickTotalBet = Math.floor(minBet + range * multiplier);
      const quickExtra = Math.max(quickTotalBet - playerCurrentBet, 0);
      const cappedExtra = Math.min(Math.max(quickExtra, extraMin), extraMax);
      setExtraAmount(cappedExtra);
      return;
    }

    // No-limit: quick buttons based on pot math (call first, then % of pot after call)
    const potAfterCall = potSize + toCall;
    const desiredTotal = Math.floor(
      playerCurrentBet + toCall + potAfterCall * multiplier,
    );
    const clampedTotal = Math.min(
      Math.max(desiredTotal, limits.minBet),
      limits.maxBet,
    );
    const clampedExtra = Math.min(
      Math.max(clampedTotal - playerCurrentBet, extraMin),
      extraMax,
    );
    setExtraAmount(clampedExtra);
  };

  const mobileActions: Array<{
    key: string;
    label: string;
    onClick: () => void;
    disabled?: boolean;
    accent?: "primary" | "danger" | "neutral";
  }> = [];

  if (limits.canFold) {
    mobileActions.push({
      key: "fold",
      label: "Fold",
      onClick: () => handleAction("fold"),
      disabled: disabled || isSubmitting,
      accent: "danger",
    });
  }

  if (limits.canCheck) {
    mobileActions.push({
      key: "check",
      label: "Check",
      onClick: () => handleAction("check"),
      disabled: disabled || isSubmitting,
      accent: "neutral",
    });
  } else if (limits.canCall) {
    mobileActions.push({
      key: "call",
      label: `Call $${limits.callAmount}`,
      onClick: () => handleAction("call"),
      disabled: disabled || isSubmitting,
      accent: "neutral",
    });
  }

  if (limits.canRaise) {
    mobileActions.push({
      key: "raise",
      label:
        currentBet === 0
          ? `Bet $${targetTotalBet}`
          : `Raise $${targetTotalBet}`,
      onClick: () =>
        handleAction(currentBet === 0 ? "bet" : "raise", targetTotalBet),
      disabled:
        disabled ||
        isSubmitting ||
        targetTotalBet < limits.minBet ||
        targetTotalBet > limits.maxBet,
      accent: "primary",
    });
  } else if (!limits.canRaise && playerChips > 0) {
    mobileActions.push({
      key: "allin",
      label: `All-In $${playerChips}`,
      onClick: () => handleAction("all_in"),
      disabled: disabled || isSubmitting,
      accent: "primary",
    });
  }

  const mobileButtonClasses = (accent?: "primary" | "danger" | "neutral") => {
    const base =
      "w-full rounded-lg border px-3 py-3 text-sm font-semibold transition-all touch-target";
    const palette =
      accent === "primary"
        ? "bg-whiskey-gold text-tokyo-night border-whiskey-gold hover:bg-whiskey-gold/90"
        : accent === "danger"
          ? "bg-velvet-red/90 text-cream-parchment border-velvet-red hover:bg-velvet-red"
          : "bg-black/30 text-cream-parchment border-white/15 hover:border-whiskey-gold/40";
    return `${base} ${palette}`;
  };

  if (isMobile) {
    return (
      <div
        className="glass border-t border-whiskey-gold/20 p-3 shadow-[0_-8px_30px_rgba(0,0,0,0.45)] rounded-t-xl max-w-[520px] mx-auto w-full"
        style={{
          fontFamily: "Lato, sans-serif",
          paddingBottom: "max(env(safe-area-inset-bottom), 0px)",
        }}
      >
        <div className="flex flex-col gap-3">
          {limits.canRaise && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs text-cream-parchment/80">
                <span className="font-semibold">Adding ${extraAmount}</span>
                <span>Total after: ${targetTotalBet}</span>
              </div>
              <input
                type="range"
                min={extraMin}
                max={extraMax}
                value={extraAmount}
                onChange={(e) => setExtraAmount(Number(e.target.value))}
                className="w-full accent-whiskey-gold h-8"
                disabled={disabled || isSubmitting}
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            {mobileActions.map((action) => (
              <button
                key={action.key}
                onClick={action.onClick}
                disabled={action.disabled}
                className={`${mobileButtonClasses(action.accent)} ${
                  action.disabled ? "opacity-60" : ""
                }`}
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="glass border-t border-whiskey-gold/20 p-3 sm:p-4 shadow-[0_-8px_30px_rgba(0,0,0,0.45)] rounded-t-xl sm:rounded-none max-w-[640px] mx-auto w-full"
      style={{
        fontFamily: "Lato, sans-serif",
        paddingBottom: "max(env(safe-area-inset-bottom), 0px)",
      }}
    >
      <div className="mx-auto max-w-full sm:max-w-4xl">
        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
          {/* Row 1: Fold + Check/Call */}
          <div className="grid grid-cols-1 sm:flex sm:flex-row gap-2 sm:gap-3 w-full sm:w-auto">
            {/* Fold */}
            {limits.canFold && (
              <button
                onClick={() => handleAction("fold")}
                disabled={disabled || isSubmitting}
                className="w-full sm:w-auto rounded-lg bg-velvet-red border border-velvet-red px-6 sm:px-12 py-3 font-bold text-cream-parchment shadow-lg transition-all hover:bg-velvet-red/90 hover:scale-105 disabled:opacity-50 disabled:hover:scale-100 touch-target"
              >
                Fold
              </button>
            )}

            {/* Check */}
            {limits.canCheck && (
              <button
                onClick={() => handleAction("check")}
                disabled={disabled || isSubmitting}
                className="w-full sm:w-auto rounded-lg bg-black/40 border border-white/20 px-6 sm:px-12 py-3 font-bold text-cream-parchment shadow-lg transition-all hover:border-whiskey-gold/50 hover:scale-105 disabled:opacity-50 disabled:hover:scale-100 touch-target"
              >
                Check
              </button>
            )}

            {/* Call */}
            {limits.canCall && !limits.canCheck && (
              <button
                onClick={() => handleAction("call")}
                disabled={disabled || isSubmitting}
                className="w-full sm:w-auto rounded-lg bg-whiskey-gold border border-whiskey-gold px-6 sm:px-12 py-3 font-bold text-tokyo-night shadow-lg transition-all hover:bg-whiskey-gold/90 hover:scale-105 disabled:opacity-50 disabled:hover:scale-100 touch-target"
                style={{ fontFamily: "Roboto Mono, monospace" }}
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
                  min={extraMin}
                  max={extraMax}
                  value={extraAmount}
                  onChange={(e) => setExtraAmount(Number(e.target.value))}
                  className="w-full accent-whiskey-gold h-8"
                  disabled={disabled || isSubmitting}
                />
                <div className="text-xs sm:text-sm text-cream-parchment/80 flex flex-wrap justify-between gap-1">
                  <span className="font-semibold">Adding ${extraAmount}</span>
                  <span>Total after raise: ${targetTotalBet}</span>
                </div>

                {/* Quick bet buttons */}
                <div className="hidden sm:grid sm:grid-cols-4 gap-2">
                  <button
                    onClick={() => handleQuickBet(0.5)}
                    disabled={disabled || isSubmitting}
                    className="rounded bg-mahogany border border-white/10 px-2 py-2 text-xs sm:text-xs text-cream-parchment hover:border-whiskey-gold/50 disabled:opacity-50 transition-colors"
                  >
                    1/2 Pot
                  </button>
                  <button
                    onClick={() => handleQuickBet(0.75)}
                    disabled={disabled || isSubmitting}
                    className="rounded bg-mahogany border border-white/10 px-2 py-2 text-xs sm:text-xs text-cream-parchment hover:border-whiskey-gold/50 disabled:opacity-50 transition-colors"
                  >
                    3/4 Pot
                  </button>
                  <button
                    onClick={() => handleQuickBet(1)}
                    disabled={disabled || isSubmitting}
                    className="rounded bg-mahogany border border-white/10 px-2 py-2 text-xs sm:text-xs text-cream-parchment hover:border-whiskey-gold/50 disabled:opacity-50 transition-colors"
                  >
                    Pot
                  </button>
                  <button
                    onClick={() => setExtraAmount(extraMax)}
                    disabled={
                      disabled || isSubmitting || playerChips > limits.maxBet
                    }
                    className="rounded bg-mahogany border border-white/10 px-2 py-2 text-xs sm:text-xs text-cream-parchment hover:border-whiskey-gold/50 disabled:opacity-50 transition-colors"
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
                    targetTotalBet,
                  )
                }
                disabled={
                  disabled ||
                  isSubmitting ||
                  targetTotalBet < limits.minBet ||
                  targetTotalBet > limits.maxBet
                }
                className="w-full sm:w-auto rounded-lg bg-whiskey-gold border border-whiskey-gold px-6 sm:px-12 py-3 font-bold text-tokyo-night shadow-lg transition-all hover:bg-whiskey-gold/90 hover:scale-105 disabled:opacity-50 disabled:hover:scale-100 touch-target"
              >
                <div className="text-xs">
                  {currentBet === 0 ? "Bet" : "Raise"}
                </div>
                <div
                  className="text-lg"
                  style={{ fontFamily: "Roboto Mono, monospace" }}
                >
                  ${targetTotalBet}
                </div>
              </button>
            </div>
          )}

          {/* All-In (when can't raise normally) */}
          {!limits.canRaise && playerChips > 0 && (
            <button
              onClick={() => handleAction("all_in")}
              disabled={disabled || isSubmitting}
              className="w-full sm:w-auto rounded-lg bg-whiskey-gold border border-whiskey-gold px-8 sm:px-12 py-3 font-bold text-tokyo-night shadow-lg transition-all hover:bg-whiskey-gold/90 hover:scale-105 disabled:opacity-50 disabled:hover:scale-100 touch-target"
              style={{ fontFamily: "Roboto Mono, monospace" }}
            >
              All-In ${playerChips}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
