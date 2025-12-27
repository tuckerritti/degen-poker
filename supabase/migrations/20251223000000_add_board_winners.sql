-- Add board-specific winners to hand_results
ALTER TABLE public.hand_results
  ADD COLUMN board1_winners jsonb NULL,
  ADD COLUMN board2_winners jsonb NULL,
  ADD COLUMN board3_winners jsonb NULL;

COMMENT ON COLUMN public.hand_results.board1_winners IS
  'Array of seat numbers winning board 1 (all game modes)';
COMMENT ON COLUMN public.hand_results.board2_winners IS
  'Array of seat numbers winning board 2 (double board PLO, 321 only)';
COMMENT ON COLUMN public.hand_results.board3_winners IS
  'Array of seat numbers winning board 3 (321 only)';
