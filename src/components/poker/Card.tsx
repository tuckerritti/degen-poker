interface CardProps {
  card: string; // e.g., "Ah", "Kd", "7s", "3c"
  faceDown?: boolean;
  size?: "sm" | "md" | "lg";
}

export function Card({ card, faceDown = false, size = "md" }: CardProps) {
  const sizeConfig = {
    sm: {
      container: "w-10 sm:w-12 h-14 sm:h-16",
      cornerRank: "text-xs",
      cornerSuit: "text-sm",
      centerSuit: "text-xl sm:text-2xl",
      backIcon: "text-lg sm:text-xl",
      padding: "p-0.5",
      border: "border-[1.5px]",
      rounded: "rounded-md",
    },
    md: {
      container: "w-12 sm:w-16 h-16 sm:h-24",
      cornerRank: "text-xs sm:text-base",
      cornerSuit: "text-base sm:text-xl",
      centerSuit: "text-3xl sm:text-4xl",
      backIcon: "text-2xl sm:text-3xl",
      padding: "p-0.5 sm:p-1",
      border: "border-2",
      rounded: "rounded-lg",
    },
    lg: {
      container: "w-16 sm:w-20 h-20 sm:h-28",
      cornerRank: "text-sm sm:text-lg",
      cornerSuit: "text-lg sm:text-2xl",
      centerSuit: "text-4xl sm:text-5xl",
      backIcon: "text-3xl sm:text-4xl",
      padding: "p-1 sm:p-1.5",
      border: "border-2",
      rounded: "rounded-lg",
    },
  };

  const config = sizeConfig[size];

  if (faceDown) {
    return (
      <div
        className={`${config.container} ${config.rounded} ${config.border} border-gray-600 shadow-lg overflow-hidden`}
      >
        <img
          src="/card-back.jpg"
          alt="Card back"
          className="h-full w-full object-cover"
        />
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
      className={`${config.container} ${config.rounded} ${config.border} relative border-gray-300 bg-white shadow-lg transition-transform hover:scale-105`}
    >
      {/* Center - Rank and Suit */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
        <div className={`${config.cornerRank} font-bold leading-none ${isRed ? "text-red-600" : "text-black"}`}>
          {displayRank}
        </div>
        <div className={`${config.centerSuit} ${isRed ? "text-red-600" : "text-black"}`}>
          {suitSymbol}
        </div>
      </div>
    </div>
  );
}
