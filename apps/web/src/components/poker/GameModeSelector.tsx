"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import type { GameMode } from "@/types/database";

interface GameModeSelectorProps {
  currentMode: GameMode;
  nextMode: GameMode | null;
  onChange: (mode: GameMode) => void;
  disabled?: boolean;
}

export function GameModeSelector({
  currentMode,
  nextMode,
  onChange,
  disabled = false,
}: GameModeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selected, setSelected] = useState<GameMode>(nextMode ?? currentMode);

  const options: Array<{
    value: GameMode;
    label: string;
    description: string;
  }> = [
    {
      value: "double_board_bomb_pot_plo",
      label: "Double Board PLO",
      description: "Pot-limit, two boards, bomb pot every hand",
    },
    {
      value: "texas_holdem",
      label: "Texas Hold'em",
      description: "No-limit, single board",
    },
  ];

  const handleOpen = () => {
    if (disabled) return;
    setSelected(nextMode ?? currentMode);
    setIsOpen(true);
  };

  const handleApply = () => {
    onChange(selected);
    setIsOpen(false);
  };

  return (
    <>
      <button
        onClick={handleOpen}
        disabled={disabled}
        className={`w-full sm:w-auto rounded-md border px-3 py-2 text-xs sm:text-sm font-semibold transition-colors ${
          disabled
            ? "bg-black/20 text-cream-parchment/50 border-white/10 cursor-not-allowed"
            : "bg-black/40 text-cream-parchment border-white/10 hover:border-whiskey-gold/50"
        }`}
        style={{ fontFamily: "Lato, sans-serif" }}
      >
        <span className="text-sm sm:text-base font-bold">Game Mode</span>
      </button>

      {isOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-50 grid place-items-center px-4">
            <div
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
              onClick={() => setIsOpen(false)}
            />

            <div
              role="dialog"
              aria-modal="true"
              className="relative z-10 w-full max-w-md max-h-[80vh] overflow-y-auto rounded-xl bg-[#0c0f1a] border border-white/10 shadow-2xl"
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                <div>
                  <p className="text-xs uppercase tracking-[0.1em] text-cream-parchment/70">
                    Game Mode
                  </p>
                  <p className="text-lg font-bold text-cream-parchment">
                    Choose the next mode
                  </p>
                </div>
                <button
                  aria-label="Close"
                  className="text-cream-parchment/70 hover:text-cream-parchment text-lg"
                  onClick={() => setIsOpen(false)}
                >
                  ×
                </button>
              </div>

              <div className="p-4 space-y-3">
                {options.map((option) => {
                  const isActive = selected === option.value;
                  const isCurrent = currentMode === option.value;
                  return (
                    <button
                      key={option.value}
                      onClick={() => setSelected(option.value)}
                      className={`w-full text-left rounded-lg border px-3 py-3 transition-colors ${
                        isActive
                          ? "border-whiskey-gold bg-whiskey-gold/10 text-cream-parchment"
                          : "border-white/10 bg-black/20 text-cream-parchment/80 hover:border-whiskey-gold/40"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-semibold">
                          {option.label}
                        </div>
                        {isCurrent && (
                          <span className="text-[11px] text-whiskey-gold font-semibold">
                            Current
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-cream-parchment/70">
                        {option.description}
                      </p>
                    </button>
                  );
                })}

                <p className="text-[11px] text-cream-parchment/60">
                  The switch takes effect at the start of the next hand.
                  Selecting the current mode clears any pending switch.
                </p>
              </div>

              <div className="flex justify-end gap-2 px-4 py-3 border-t border-white/10 bg-black/30">
                <button
                  onClick={() => setIsOpen(false)}
                  className="rounded-md px-3 py-2 text-sm text-cream-parchment/80 hover:text-cream-parchment"
                >
                  Cancel
                </button>
                <button
                  onClick={handleApply}
                  className="rounded-md bg-whiskey-gold px-3 py-2 text-sm font-semibold text-tokyo-night hover:bg-whiskey-gold/90"
                >
                  Apply
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
