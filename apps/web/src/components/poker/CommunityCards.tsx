import { Card } from "./Card";
import { evaluatePLOHandPartial, evaluateHoldemHandPartial } from "@/lib/poker/hand-evaluator";

interface CommunityCardsProps {
  boardA: string[];
  boardB: string[];
  phase: string;
  myHoleCards?: string[];
}

export function CommunityCards({
  boardA,
  boardB,
  myHoleCards,
}: CommunityCardsProps) {
  const isPLO = myHoleCards && myHoleCards.length === 4;
  const isHoldem = myHoleCards && myHoleCards.length === 2;

  return (
    <div className="flex flex-col gap-1 sm:gap-2">
      {/* Board A */}
      <div className="flex flex-col items-center gap-1">
        {/* Hand evaluation for Board A */}
        {myHoleCards && boardA.length >= 3 && (isPLO || isHoldem) && (
          <div className="text-xs sm:text-sm font-bold text-cream-parchment">
            {isPLO
              ? evaluatePLOHandPartial(myHoleCards, boardA).description
              : evaluateHoldemHandPartial(myHoleCards, boardA).description}
          </div>
        )}

        <div className="flex gap-0.5 sm:gap-1 rounded-lg glass border border-whiskey-gold/30 p-1.5 sm:p-2 shadow-lg">
          {boardA
            .filter((card) => card != null)
            .map((card, index) => (
              <Card key={`a-${index}`} card={card} size="md" />
            ))}
        </div>
      </div>

      {/* Board B - only show for PLO (double board) */}
      {boardB.length > 0 && (
        <div className="flex flex-col items-center gap-1">
          {/* Hand evaluation for Board B */}
          {myHoleCards && isPLO && boardB.length >= 3 && (
            <div className="text-xs sm:text-sm font-bold text-cream-parchment">
              {evaluatePLOHandPartial(myHoleCards, boardB).description}
            </div>
          )}

          <div className="flex gap-0.5 sm:gap-1 rounded-lg glass border border-whiskey-gold/30 p-1.5 sm:p-2 shadow-lg">
            {boardB
              .filter((card) => card != null)
              .map((card, index) => (
                <Card key={`b-${index}`} card={card} size="md" />
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
