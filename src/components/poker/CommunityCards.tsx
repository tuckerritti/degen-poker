import { Card } from "./Card";

interface CommunityCardsProps {
  boardA: string[];
  boardB: string[];
  phase: string;
}

export function CommunityCards({ boardA, boardB }: CommunityCardsProps) {
  return (
    <div className="flex flex-col gap-1 sm:gap-2">
      {/* Board A */}
      <div className="flex flex-col items-center gap-1">
        <div className="flex gap-0.5 sm:gap-1 rounded-lg glass border border-whiskey-gold/30 p-1.5 sm:p-2 shadow-lg">
          {boardA.filter((card) => card != null).map((card, index) => (
            <Card key={`a-${index}`} card={card} size="md" />
          ))}
        </div>
      </div>

      {/* Board B */}
      <div className="flex flex-col items-center gap-1">
        <div className="flex gap-0.5 sm:gap-1 rounded-lg glass border border-whiskey-gold/30 p-1.5 sm:p-2 shadow-lg">
          {boardB.filter((card) => card != null).map((card, index) => (
            <Card key={`b-${index}`} card={card} size="md" />
          ))}
        </div>
      </div>
    </div>
  );
}
