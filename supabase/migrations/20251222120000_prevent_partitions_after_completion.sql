-- Prevent partition submissions after a hand is marked complete

CREATE OR REPLACE FUNCTION public.ensure_hand_not_completed()
RETURNS trigger AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.game_states gs
    WHERE gs.id = NEW.game_state_id
      AND gs.hand_completed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'hand already completed';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ensure_partition_hand_not_completed
  ON public.player_partitions;

CREATE TRIGGER ensure_partition_hand_not_completed
  BEFORE INSERT OR UPDATE ON public.player_partitions
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_hand_not_completed();
