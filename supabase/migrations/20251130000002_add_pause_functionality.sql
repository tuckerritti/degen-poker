-- Add is_paused column to rooms table
-- This allows the room owner to pause the game before dealing the next hand

ALTER TABLE rooms
ADD COLUMN is_paused BOOLEAN NOT NULL DEFAULT false;

-- Add comment for clarity
COMMENT ON COLUMN rooms.is_paused IS 'When true, the owner cannot deal a new hand until unpaused';
