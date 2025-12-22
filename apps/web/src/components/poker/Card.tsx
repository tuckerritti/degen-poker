import Image from "next/image";

interface CardProps {
  card: string; // e.g., "Ah", "Kd", "7s", "3c"
  faceDown?: boolean;
  size?: "sm" | "md" | "lg";
}

export function Card({ card, faceDown = false, size = "md" }: CardProps) {
  const baseSize = {
    container: "w-10 sm:w-12 h-14 sm:h-16",
    cornerRank: "text-xs",
    cornerSuit: "text-sm",
    centerSuit: "text-xl sm:text-2xl",
    backIcon: "text-lg sm:text-xl",
    padding: "p-0.5",
    border: "border-[1.5px]",
    rounded: "rounded-md",
  };
  const sizeConfig = {
    sm: baseSize,
    md: baseSize,
    lg: baseSize,
  };

  const config = sizeConfig[size];

  if (faceDown) {
    return (
      <div
        className={`${config.container} ${config.rounded} ${config.border} relative z-40 overflow-hidden border-slate-600 bg-slate-900 shadow-lg`}
      >
        <Image
          src="/card-back.jpg"
          alt="Card back"
          fill
          sizes="(max-width: 640px) 64px, 128px"
          className="object-cover"
          priority
        />
        {/* Outer inset frame to give structure over the image */}
        <div className="pointer-events-none absolute inset-[7%] rounded-md border border-slate-200/50 shadow-inner" />
        {/* Subtle vignette */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-black/10 via-transparent to-black/20" />
      </div>
    );
  }

  // Safety check for null/undefined cards
  if (!card || card.length < 2) {
    console.error("Invalid card value:", card);
    return null;
  }

  const rank = card[0];
  const suit = card[1];

  const suitSymbols: Record<string, string> = {
    h: "♥",
    d: "♦",
    c: "♣",
    s: "♠",
  };

  const rankNames: Record<string, string> = {
    T: "10",
    J: "J",
    Q: "Q",
    K: "K",
    A: "A",
  };

  const isRed = suit === "h" || suit === "d";
  const displayRank = rankNames[rank] || rank;
  const suitSymbol = suitSymbols[suit];

  return (
    <div
      className={`${config.container} ${config.rounded} ${config.border} relative z-40 border-gray-300 bg-white shadow-lg`}
    >
      {/* Center - Rank and Suit */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
        <div
          className={`${config.cornerRank} font-bold leading-none ${isRed ? "text-red-600" : "text-black"}`}
        >
          {displayRank}
        </div>
        <div
          className={`${config.centerSuit} ${isRed ? "text-red-600" : "text-black"}`}
        >
          {suitSymbol}
        </div>
      </div>
    </div>
  );
}
