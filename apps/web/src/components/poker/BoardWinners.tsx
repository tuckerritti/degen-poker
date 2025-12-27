import type { RoomPlayer } from "@/types/database";

interface BoardWinnersProps {
  board1Winners: number[] | null;
  board2Winners: number[] | null;
  board3Winners: number[] | null;
  gameMode: string | null | undefined;
  players: RoomPlayer[];
}

export function BoardWinners({
  board1Winners,
  board2Winners,
  board3Winners,
  gameMode,
  players,
}: BoardWinnersProps) {
  const seatName = (seatNumber: number) => {
    const player = players.find((p) => p.seat_number === seatNumber);
    return player?.display_name || `Seat ${seatNumber}`;
  };

  const formatWinners = (winners: number[] | null) => {
    if (!winners || winners.length === 0) return "Pending";
    return winners.map(seatName).join(", ");
  };

  const is321 = gameMode === "game_mode_321";
  const isDoubleBoard = gameMode === "double_board_bomb_pot_plo";

  const rows = is321
    ? [
        { label: "Board 1 (3-card)", winners: board1Winners },
        { label: "Board 2 (2-card)", winners: board2Winners },
        { label: "Board 3 (1-card)", winners: board3Winners },
      ]
    : isDoubleBoard
      ? [
          { label: "Board 1", winners: board1Winners },
          { label: "Board 2", winners: board2Winners },
        ]
      : [{ label: "Winner", winners: board1Winners }];

  return (
    <div className="absolute top-32 left-1/2 -translate-x-1/2 z-20 w-[min(90vw,520px)] px-4 pointer-events-none">
      <div className="glass border border-whiskey-gold/40 shadow-xl rounded-xl px-4 py-3">
        <div
          className="text-center text-sm sm:text-base font-bold text-whiskey-gold mb-2"
          style={{ fontFamily: "Playfair Display, serif" }}
        >
          Hand Winners
        </div>
        <div className="space-y-1.5">
          {rows.map((row) => (
            <div
              key={row.label}
              className="flex items-center justify-between gap-2 text-xs sm:text-sm"
            >
              <span
                className="text-cigar-ash/70"
                style={{ fontFamily: "Lato, sans-serif" }}
              >
                {row.label}
              </span>
              <span
                className="text-cream-parchment font-semibold text-right"
                style={{ fontFamily: "Lato, sans-serif" }}
              >
                {formatWinners(row.winners)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
