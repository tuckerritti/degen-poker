-- Backfill auth_user_id from session_id for development reset
-- Backfill only where session_id looks like a UUID to avoid type errors
UPDATE room_players
SET auth_user_id = session_id::uuid
WHERE auth_user_id IS NULL
  AND session_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

UPDATE player_hands
SET auth_user_id = session_id::uuid
WHERE auth_user_id IS NULL
  AND session_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

UPDATE rooms
SET owner_auth_user_id = owner_session_id::uuid
WHERE owner_auth_user_id IS NULL
  AND owner_session_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

-- RLS tightening: updates restricted to service_role; reads public where intended

-- room_players
DROP POLICY IF EXISTS "Public read players" ON room_players;
CREATE POLICY "Public read players" ON room_players FOR SELECT USING (true);

DROP POLICY IF EXISTS "Server can update players" ON room_players;
CREATE POLICY "Service update players" ON room_players FOR UPDATE TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public join tables" ON room_players;
CREATE POLICY "Public join tables" ON room_players FOR INSERT WITH CHECK (true);

-- rooms
DROP POLICY IF EXISTS "Public read rooms" ON rooms;
CREATE POLICY "Public read rooms" ON rooms FOR SELECT USING (true);

DROP POLICY IF EXISTS "Server can update rooms" ON rooms;
CREATE POLICY "Service update rooms" ON rooms FOR UPDATE TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public create rooms" ON rooms;
CREATE POLICY "Public create rooms" ON rooms FOR INSERT WITH CHECK (true);

-- game_states
DROP POLICY IF EXISTS "Public read game states" ON game_states;
CREATE POLICY "Public read game states" ON game_states FOR SELECT USING (true);

DROP POLICY IF EXISTS "Server can update game states" ON game_states;
CREATE POLICY "Service update game states" ON game_states FOR UPDATE TO service_role USING (true) WITH CHECK (true);

-- player_actions
DROP POLICY IF EXISTS "Public submit actions" ON player_actions;
CREATE POLICY "Public submit actions" ON player_actions FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Server can update actions" ON player_actions;
CREATE POLICY "Service update actions" ON player_actions FOR UPDATE TO service_role USING (true) WITH CHECK (true);

-- hand_results
DROP POLICY IF EXISTS "Public read hand results" ON hand_results;
CREATE POLICY "Public read hand results" ON hand_results FOR SELECT USING (true);
