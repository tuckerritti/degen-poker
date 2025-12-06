-- Enable realtime replication for poker tables
-- This allows Supabase realtime subscriptions to receive INSERT/UPDATE/DELETE events

-- Set replica identity to FULL so realtime can send complete row data
alter table public.rooms replica identity full;
alter table public.room_players replica identity full;
alter table public.game_states replica identity full;
alter table public.player_hands replica identity full;
alter table public.player_actions replica identity full;
alter table public.hand_results replica identity full;

-- Add tables to the supabase_realtime publication
-- This enables real-time broadcasts for these tables
alter publication supabase_realtime add table public.rooms;
alter publication supabase_realtime add table public.room_players;
alter publication supabase_realtime add table public.game_states;
alter publication supabase_realtime add table public.player_hands;
alter publication supabase_realtime add table public.player_actions;
alter publication supabase_realtime add table public.hand_results;
