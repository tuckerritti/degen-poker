-- Add waiting_for_next_hand column to room_players table
-- This tracks players who joined during an active hand and should wait until the next hand to play

ALTER TABLE public.room_players
ADD COLUMN waiting_for_next_hand boolean NOT NULL DEFAULT false;

-- Create index for efficient queries when filtering waiting players
CREATE INDEX room_players_waiting_idx
ON public.room_players(room_id, waiting_for_next_hand)
WHERE waiting_for_next_hand = true;
