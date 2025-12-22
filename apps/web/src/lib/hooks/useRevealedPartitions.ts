import { useGameState } from "./useGameState";

export type RevealedPartition = {
  three_board_cards: string[];
  two_board_cards: string[];
  one_board_card: string[];
};

export function useRevealedPartitions(roomId: string | null): {
  revealedPartitions: Record<number, RevealedPartition> | null;
  loading: boolean;
} {
  const { gameState, loading } = useGameState(roomId);

  if (!gameState || !gameState.board_state) {
    return { revealedPartitions: null, loading };
  }

  const boardState = gameState.board_state as unknown as {
    revealed_partitions?: Record<string, RevealedPartition>;
  };

  // Convert string keys to number keys and ensure type safety
  const revealedPartitions = boardState.revealed_partitions
    ? Object.entries(boardState.revealed_partitions).reduce(
        (acc, [seat, partition]) => {
          acc[parseInt(seat, 10)] = partition;
          return acc;
        },
        {} as Record<number, RevealedPartition>,
      )
    : null;

  return { revealedPartitions, loading };
}
