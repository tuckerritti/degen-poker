import { Card } from "./Card";
import { evaluatePLOHandPartial } from "@/lib/poker/hand-evaluator";

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
  return (
    <div className="flex flex-col gap-1 sm:gap-2">
      {/* Board A */}
      <div className="flex flex-col items-center gap-1">
        {/* Hand evaluation for Board A */}
        {myHoleCards && myHoleCards.length === 4 && boardA.length >= 3 && (
          <div className="text-xs sm:text-sm font-bold text-cream-parchment">
            {evaluatePLOHandPartial(myHoleCards, boardA).description}
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

      {/* Board B */}
      <div className="flex flex-col items-center gap-1">
        {/* Hand evaluation for Board B */}
        {myHoleCards && myHoleCards.length === 4 && boardB.length >= 3 && (
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
    </div>
  );
}
