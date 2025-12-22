-- Migration: Add 321 Game Mode
-- This migration adds support for the "321" game mode, a 3-board bomb pot variant
-- where players partition 6 hole cards across boards with different evaluation rules.

-- Add 321 to game_mode enum
ALTER TYPE game_mode ADD VALUE 'game_mode_321';

-- Add partition phase to game_phase enum
ALTER TYPE game_phase ADD VALUE 'partition';

-- Extend game_state_secrets for 3rd board
ALTER TABLE public.game_state_secrets
  ADD COLUMN full_board3 text[] NULL;

COMMENT ON COLUMN public.game_state_secrets.full_board3 IS
  'Full 5-card board for the third board in 321 mode (NULL for other game modes)';

-- Create player_partitions table (RLS-protected)
CREATE TABLE public.player_partitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.rooms ON DELETE CASCADE,
  game_state_id uuid NOT NULL REFERENCES public.game_states ON DELETE CASCADE,
  seat_number int NOT NULL,
  auth_user_id uuid NULL,

  -- Card allocations (stored as JSONB arrays of card strings)
  three_board_cards jsonb NOT NULL,  -- 3 cards for 3-board (holdem rules)
  two_board_cards jsonb NOT NULL,    -- 2 cards for 2-board (PLO rules)
  one_board_card jsonb NOT NULL,     -- 1 card for 1-board (modified rules)

  is_submitted boolean NOT NULL DEFAULT false,
  submitted_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE(game_state_id, seat_number),

  -- Constraint: must have exactly 3+2+1 = 6 cards total
  CONSTRAINT partition_card_count CHECK (
    jsonb_array_length(three_board_cards) = 3 AND
    jsonb_array_length(two_board_cards) = 2 AND
    jsonb_array_length(one_board_card) = 1
  )
);

CREATE INDEX player_partitions_gs_idx ON public.player_partitions(game_state_id);
CREATE INDEX player_partitions_room_idx ON public.player_partitions(room_id);

COMMENT ON TABLE public.player_partitions IS
  'Stores player card partitions for 321 mode - how each player allocated their 6 hole cards across 3 boards';

-- RLS policies for player_partitions
ALTER TABLE public.player_partitions ENABLE ROW LEVEL SECURITY;

-- Service role has full access
CREATE POLICY "player_partitions_service"
  ON public.player_partitions
  FOR ALL
  USING (auth.role() = 'service_role');

-- Players can only see their own partitions
CREATE POLICY "player_partitions_self_view"
  ON public.player_partitions
  FOR SELECT
  USING (auth.uid() = auth_user_id);

-- Enable realtime for player_partitions
ALTER TABLE public.player_partitions REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.player_partitions;

-- Grant permissions
GRANT SELECT ON public.player_partitions TO anon, authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON public.player_partitions TO service_role;

-- Add metadata to rooms for two-deck mode
ALTER TABLE public.rooms
  ADD COLUMN uses_two_decks boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.rooms.uses_two_decks IS
  'Indicates if this room requires two decks (321 mode with many players: 6×players + 15 > 52)';

-- Extend hand_results to support 3rd board
ALTER TABLE public.hand_results
  ADD COLUMN board_c text[] NULL;

COMMENT ON COLUMN public.hand_results.board_c IS
  'Third board community cards for 321 mode (NULL for other game modes)';
