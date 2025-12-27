import { Card } from "./Card";
import {
  evaluatePLOHandPartial,
  evaluateHoldemHandPartial,
} from "@/lib/poker/hand-evaluator";

interface CommunityCardsProps {
  boardA: string[];
  boardB: string[];
  boardC?: string[];
  phase: string;
  myHoleCards?: string[];
  gameMode?: string;
}

export function CommunityCards({
  boardA,
  boardB,
  boardC = [],
  myHoleCards,
  gameMode,
}: CommunityCardsProps) {
  const isPLO = myHoleCards && myHoleCards.length === 4;
  const isHoldem = myHoleCards && myHoleCards.length === 2;
  const is321 = gameMode === "game_mode_321";

  return (
    <div
      className={`relative z-40 flex flex-col items-center justify-center ${is321 ? "gap-1 sm:gap-1.5" : "gap-2 sm:gap-3"}`}
    >
      {/* Board A */}
      <div className="flex flex-1 min-w-[220px] max-w-[360px] flex-col items-center gap-1 sm:gap-1.5">
        {/* Hand evaluation for Board A */}
        {myHoleCards && boardA.length >= 3 && (isPLO || isHoldem) && (
          <div className="text-xs sm:text-sm font-bold text-cream-parchment text-center sm:text-left">
            {isPLO
              ? evaluatePLOHandPartial(myHoleCards, boardA).description
              : evaluateHoldemHandPartial(myHoleCards, boardA).description}
          </div>
        )}

        <div className="flex items-center gap-2">
          <div className="flex flex-wrap justify-center gap-0.5 sm:gap-1 rounded-lg glass border border-whiskey-gold/30 p-1.5 sm:p-2 shadow-lg">
            {boardA
              .filter((card) => card != null)
              .map((card, index) => (
                <Card
                  key={`a-${index}`}
                  card={card}
                  size={is321 ? "sm" : "md"}
                />
              ))}
          </div>
          {is321 && (
            <span className="text-sm text-cigar-ash/50 font-mono">3</span>
          )}
        </div>
      </div>

      {/* Board B - only show for PLO (double board) or 321 */}
      {boardB.length > 0 && (
        <div className="flex flex-1 min-w-[220px] max-w-[360px] flex-col items-center gap-1 sm:gap-1.5">
          {/* Hand evaluation for Board B */}
          {myHoleCards && isPLO && boardB.length >= 3 && (
            <div className="text-xs sm:text-sm font-bold text-cream-parchment text-center sm:text-left">
              {evaluatePLOHandPartial(myHoleCards, boardB).description}
            </div>
          )}

          <div className="flex items-center gap-2">
            <div className="flex flex-wrap justify-center gap-0.5 sm:gap-1 rounded-lg glass border border-whiskey-gold/30 p-1.5 sm:p-2 shadow-lg">
              {boardB
                .filter((card) => card != null)
                .map((card, index) => (
                  <Card
                    key={`b-${index}`}
                    card={card}
                    size={is321 ? "sm" : "md"}
                  />
                ))}
            </div>
            {is321 && (
              <span className="text-sm text-cigar-ash/50 font-mono">2</span>
            )}
          </div>
        </div>
      )}

      {/* Board C - only show for 321 mode */}
      {is321 && boardC && boardC.length > 0 && (
        <div className="flex flex-1 min-w-[220px] max-w-[360px] flex-col items-center gap-1 sm:gap-1.5">
          <div className="flex items-center gap-2">
            <div className="flex flex-wrap justify-center gap-0.5 sm:gap-1 rounded-lg glass border border-whiskey-gold/30 p-1.5 sm:p-2 shadow-lg">
              {boardC
                .filter((card) => card != null)
                .map((card, index) => (
                  <Card key={`c-${index}`} card={card} size="sm" />
                ))}
            </div>
            <span className="text-sm text-cigar-ash/50 font-mono">1</span>
          </div>
        </div>
      )}
    </div>
  );
}
