-- Add indian_poker to game_mode enum
ALTER TYPE game_mode ADD VALUE IF NOT EXISTS 'indian_poker';

-- No table structure changes needed.
-- visible_player_cards will be stored in existing game_states.board_state JSONB field.
-- This field will be populated for indian_poker games to show other players' cards.
