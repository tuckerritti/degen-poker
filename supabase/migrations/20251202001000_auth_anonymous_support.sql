-- Add auth-based identity columns
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS owner_auth_user_id UUID;
ALTER TABLE room_players ADD COLUMN IF NOT EXISTS auth_user_id UUID;
ALTER TABLE player_hands ADD COLUMN IF NOT EXISTS auth_user_id UUID;

-- Enable and redefine RLS for player_hands to rely on auth.uid()
ALTER TABLE player_hands ENABLE ROW LEVEL SECURITY;

-- Clean up prior policies
DROP POLICY IF EXISTS "Service role can read hands" ON player_hands;
DROP POLICY IF EXISTS "Players can only see their own hands" ON player_hands;
DROP POLICY IF EXISTS "Service role can insert hands" ON player_hands;
DROP POLICY IF EXISTS "Server can insert hands" ON player_hands;

-- Allow authenticated users to read only their own hands via auth.uid()
CREATE POLICY "Players read own hands"
  ON player_hands FOR SELECT
  TO authenticated
  USING (auth.uid() = auth_user_id);

-- Allow service role to read/insert for server-side dealing
CREATE POLICY "Service role read hands"
  ON player_hands FOR SELECT
  TO service_role
  USING (true);

CREATE POLICY "Service role insert hands"
  ON player_hands FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Optional: allow service role to delete for cleanup
CREATE POLICY "Service role delete hands"
  ON player_hands FOR DELETE
  TO service_role
  USING (true);
