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
      "w-full rounded-lg border px-3 py-3 text-sm font-semibold transition-all touch-target pointer-events-auto";
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
        className="glass absolute inset-x-0 bottom-0 z-30 pointer-events-auto border-t border-whiskey-gold/20 p-3 shadow-[0_-8px_30px_rgba(0,0,0,0.45)] rounded-t-xl max-w-[520px] mx-auto w-full"
        style={{
          fontFamily: "Lato, sans-serif",
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
      className="glass absolute inset-x-0 bottom-0 z-30 pointer-events-auto border-t border-whiskey-gold/20 p-2 sm:p-3 shadow-[0_-8px_30px_rgba(0,0,0,0.45)] rounded-t-xl sm:rounded-none w-full"
      style={{
        fontFamily: "Lato, sans-serif",
      }}
    >
      <div className="mx-auto max-w-full sm:max-w-6xl">
        {/* Desktop: Single compact row layout */}
        <div className="flex flex-row items-center gap-2 sm:gap-3">
          {/* Left: Action Buttons (Fold/Check/Call) */}
          <div className="flex flex-row gap-2 sm:gap-2">
            {limits.canFold && (
              <button
                onClick={() => handleAction("fold")}
                disabled={disabled || isSubmitting}
                className="pointer-events-auto rounded-lg bg-velvet-red border border-velvet-red px-4 sm:px-8 py-2 sm:py-2.5 font-bold text-sm sm:text-base text-cream-parchment shadow-lg transition-all hover:bg-velvet-red/90 disabled:opacity-50"
              >
                Fold
              </button>
            )}

            {limits.canCheck && (
              <button
                onClick={() => handleAction("check")}
                disabled={disabled || isSubmitting}
                className="pointer-events-auto rounded-lg bg-black/40 border border-white/20 px-4 sm:px-8 py-2 sm:py-2.5 font-bold text-sm sm:text-base text-cream-parchment shadow-lg transition-all hover:bg-black/60 hover:border-whiskey-gold/50 disabled:opacity-50"
              >
                Check
              </button>
            )}

            {limits.canCall && !limits.canCheck && (
              <button
                onClick={() => handleAction("call")}
                disabled={disabled || isSubmitting}
                className="pointer-events-auto rounded-lg bg-whiskey-gold border border-whiskey-gold px-4 sm:px-8 py-2 sm:py-2.5 font-bold text-sm sm:text-base text-tokyo-night shadow-lg transition-all hover:bg-whiskey-gold/90 disabled:opacity-50"
                style={{ fontFamily: "Roboto Mono, monospace" }}
              >
                <span>Call ${limits.callAmount}</span>
              </button>
            )}
          </div>

          {/* Center: Bet/Raise Controls */}
          {limits.canRaise && (
            <>
              {/* Quick Bet Buttons */}
              <div className="hidden sm:flex gap-1.5">
                <button
                  onClick={() => handleQuickBet(0.5)}
                  disabled={disabled || isSubmitting}
                  className="pointer-events-auto rounded bg-mahogany border border-white/10 px-3 py-2 text-xs text-cream-parchment hover:border-whiskey-gold/50 disabled:opacity-50 transition-colors whitespace-nowrap"
                >
                  <span>½ Pot</span>
                </button>
                <button
                  onClick={() => handleQuickBet(0.75)}
                  disabled={disabled || isSubmitting}
                  className="pointer-events-auto rounded bg-mahogany border border-white/10 px-3 py-2 text-xs text-cream-parchment hover:border-whiskey-gold/50 disabled:opacity-50 transition-colors whitespace-nowrap"
                >
                  <span>¾ Pot</span>
                </button>
                <button
                  onClick={() => handleQuickBet(1)}
                  disabled={disabled || isSubmitting}
                  className="pointer-events-auto rounded bg-mahogany border border-white/10 px-3 py-2 text-xs text-cream-parchment hover:border-whiskey-gold/50 disabled:opacity-50 transition-colors whitespace-nowrap"
                >
                  <span>Pot</span>
                </button>
                <button
                  onClick={() => setExtraAmount(extraMax)}
                  disabled={
                    disabled || isSubmitting || playerChips > limits.maxBet
                  }
                  className="pointer-events-auto rounded bg-mahogany border border-white/10 px-3 py-2 text-xs text-cream-parchment hover:border-whiskey-gold/50 disabled:opacity-50 transition-colors whitespace-nowrap"
                >
                  <span>All-In</span>
                </button>
              </div>

              {/* Slider + Label */}
              <div className="flex-1 flex flex-col gap-0.5 min-w-[200px]">
                <input
                  type="range"
                  min={extraMin}
                  max={extraMax}
                  value={extraAmount}
                  onChange={(e) => setExtraAmount(Number(e.target.value))}
                  className="w-full accent-whiskey-gold h-6"
                  disabled={disabled || isSubmitting}
                />
                <div className="text-[10px] sm:text-xs text-cream-parchment/70 flex justify-between">
                  <span>+${extraAmount}</span>
                  <span>Total: ${targetTotalBet}</span>
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
                className="pointer-events-auto rounded-lg bg-whiskey-gold border border-whiskey-gold px-4 sm:px-8 py-2 sm:py-2.5 font-bold text-sm sm:text-base text-tokyo-night shadow-lg transition-all hover:bg-whiskey-gold/90 disabled:opacity-50 whitespace-nowrap"
                style={{ fontFamily: "Roboto Mono, monospace" }}
              >
                <span>
                  {currentBet === 0 ? "Bet" : "Raise"} ${targetTotalBet}
                </span>
              </button>
            </>
          )}

          {/* All-In (when can't raise normally) */}
          {!limits.canRaise && playerChips > 0 && (
            <button
              onClick={() => handleAction("all_in")}
              disabled={disabled || isSubmitting}
              className="pointer-events-auto rounded-lg bg-whiskey-gold border border-whiskey-gold px-4 sm:px-8 py-2 sm:py-2.5 font-bold text-sm sm:text-base text-tokyo-night shadow-lg transition-all hover:bg-whiskey-gold/90 disabled:opacity-50"
              style={{ fontFamily: "Roboto Mono, monospace" }}
            >
              <span>All-In ${playerChips}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
