-- Remove legacy session-based columns; pivot fully to auth_user_id

ALTER TABLE player_actions ADD COLUMN IF NOT EXISTS auth_user_id UUID;
ALTER TABLE player_actions DROP COLUMN IF EXISTS session_id;

ALTER TABLE room_players DROP COLUMN IF EXISTS session_id;
ALTER TABLE player_hands DROP COLUMN IF EXISTS session_id;
ALTER TABLE rooms DROP COLUMN IF EXISTS owner_session_id;

-- Backfill new columns from existing auth_user_id where needed
UPDATE player_actions SET auth_user_id = auth_user_id WHERE auth_user_id IS NULL;

-- Ensure constraints/indexes updated
DROP INDEX IF EXISTS idx_room_players_session;
CREATE INDEX IF NOT EXISTS idx_room_players_auth_user ON room_players(auth_user_id);

DROP INDEX IF EXISTS idx_player_hands_session;
CREATE INDEX IF NOT EXISTS idx_player_hands_auth_user ON player_hands(auth_user_id);

DROP INDEX IF EXISTS idx_player_actions_session;
CREATE INDEX IF NOT EXISTS idx_player_actions_auth_user ON player_actions(auth_user_id);
