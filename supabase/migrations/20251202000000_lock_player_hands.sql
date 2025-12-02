-- Harden player_hands access: only service_role can read
-- This prevents clients with the anon key from selecting any hole cards.

ALTER TABLE player_hands DISABLE ROW LEVEL SECURITY;

ALTER TABLE player_hands ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Players can only see their own hands" ON player_hands;

CREATE POLICY "Service role can read hands"
  ON player_hands FOR SELECT
  TO service_role
  USING (true);

-- Keep inserts restricted to service role as well (explicit for clarity)
DROP POLICY IF EXISTS "Server can insert hands" ON player_hands;
CREATE POLICY "Service role can insert hands"
  ON player_hands FOR INSERT
  TO service_role
  WITH CHECK (true);
