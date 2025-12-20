-- Add partial index on hand_completed_at column for performance optimization
-- This index is used by the cleanup scheduler to efficiently find completed hands
-- that need to be deleted. Only indexes non-null values (partial index).

CREATE INDEX IF NOT EXISTS game_states_hand_completed_at_idx
ON game_states(hand_completed_at)
WHERE hand_completed_at IS NOT NULL;
