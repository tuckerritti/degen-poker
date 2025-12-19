-- Squashed schema for Degen Poker (engine + security + realtime)
-- Generated on 2025-12-06

-- Extensions
create extension if not exists "pgcrypto";

create type action_type as enum ('fold','check','call','bet','raise','all_in');
create type game_mode as enum ('double_board_bomb_pot_plo','texas_holdem');
create type game_phase as enum ('waiting','dealing','flop','turn','river','showdown','complete','preflop');

-- Helper function for updated_at
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Rooms
create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  owner_auth_user_id uuid null,
  game_mode game_mode not null default 'double_board_bomb_pot_plo',
  max_players int not null default 9,
  min_buy_in int not null,
  max_buy_in int not null,
  small_blind int not null,
  big_blind int not null,
  button_seat int null,
  current_hand_number int not null default 0,
  inter_hand_delay int not null default 5,
  is_paused boolean not null default false,
  pause_after_hand boolean not null default false,
  is_active boolean not null default true,
  last_activity_at timestamptz null,
  constraint big_blind_gt_small_blind check (big_blind > small_blind),
  constraint buy_in_range check (max_buy_in >= min_buy_in)
);
create trigger rooms_updated_at before update on public.rooms
  for each row execute function public.set_updated_at();

-- Room players
create table public.room_players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms on delete cascade,
  seat_number int not null,
  auth_user_id uuid null,
  display_name text not null,
  chip_stack int not null,
  total_buy_in int not null default 0,
  total_invested_this_hand int default 0,
  current_bet int default 0,
  has_folded boolean default false,
  is_all_in boolean default false,
  is_sitting_out boolean default false,
  is_spectating boolean default false,
  connected_at timestamptz default now(),
  last_action_at timestamptz null,
  unique(room_id, seat_number)
);
create index room_players_room_id_idx on public.room_players(room_id);

-- Game states
create table public.game_states (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms on delete cascade,
  hand_number int not null,
  deck_seed text not null,
  button_seat int not null,
  phase game_phase not null default 'waiting',
  pot_size int default 0,
  current_bet int default 0,
  min_raise int null,
  current_actor_seat int null,
  last_aggressor_seat int null,
  last_raise_amount int null,
  action_deadline_at timestamptz null,
  action_reopened_to int[] null,
  seats_to_act int[] null,
  seats_acted int[] null,
  burned_card_indices int[] null,
  board_state jsonb null,
  side_pots jsonb null,
  action_history jsonb null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(room_id, hand_number)
);
create index game_states_room_id_idx on public.game_states(room_id);
create trigger game_states_updated_at before update on public.game_states
  for each row execute function public.set_updated_at();

-- Player hands
create table public.player_hands (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms on delete cascade,
  game_state_id uuid not null references public.game_states on delete cascade,
  seat_number int not null,
  cards jsonb not null,
  auth_user_id uuid null,
  created_at timestamptz not null default now(),
  unique(game_state_id, seat_number)
);
create index player_hands_gs_idx on public.player_hands(game_state_id);
create index player_hands_room_idx on public.player_hands(room_id);

-- Player actions
create table public.player_actions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms on delete cascade,
  game_state_id uuid references public.game_states on delete cascade,
  seat_number int not null,
  action_type action_type not null,
  amount int null,
  processed boolean default false,
  processed_at timestamptz null,
  error_message text null,
  auth_user_id uuid null,
  idempotency_key text null,
  created_at timestamptz not null default now()
);
create index player_actions_room_id_idx on public.player_actions(room_id);
create index player_actions_gs_idx on public.player_actions(game_state_id);
create unique index player_actions_idem_idx
  on public.player_actions (room_id, seat_number, idempotency_key)
  where idempotency_key is not null;

-- Hand results
create table public.hand_results (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms on delete cascade,
  hand_number int not null,
  final_pot int not null,
  board_a text[] null,
  board_b text[] null,
  winners jsonb not null,
  shown_hands jsonb null,
  action_history jsonb null,
  created_at timestamptz not null default now(),
  unique(room_id, hand_number)
);
create index hand_results_room_id_idx on public.hand_results(room_id);

-- Game state secrets
create table public.game_state_secrets (
  id uuid primary key default gen_random_uuid(),
  game_state_id uuid not null references public.game_states on delete cascade,
  deck_seed text not null,
  full_board1 text[] not null,
  full_board2 text[] null,
  created_at timestamptz not null default now(),
  unique(game_state_id)
);

-- Realtime replication
alter table public.rooms replica identity full;
alter table public.room_players replica identity full;
alter table public.game_states replica identity full;
alter table public.player_hands replica identity full;
alter table public.player_actions replica identity full;
alter table public.hand_results replica identity full;
alter table public.game_state_secrets replica identity full;

alter publication supabase_realtime add table public.rooms;
alter publication supabase_realtime add table public.room_players;
alter publication supabase_realtime add table public.game_states;
alter publication supabase_realtime add table public.player_hands;
alter publication supabase_realtime add table public.player_actions;
alter publication supabase_realtime add table public.hand_results;
alter publication supabase_realtime add table public.game_state_secrets;

-- Grants (read for anon/authenticated, write only for service_role)
grant usage on schema public to anon, authenticated, service_role;
grant select on all tables in schema public to anon, authenticated, service_role;
grant insert, update, delete on all tables in schema public to service_role;
revoke insert, update, delete on all tables in schema public from anon, authenticated;

-- RLS
alter table public.rooms enable row level security;
alter table public.room_players enable row level security;
alter table public.game_states enable row level security;
alter table public.player_hands enable row level security;
alter table public.player_actions enable row level security;
alter table public.hand_results enable row level security;
alter table public.game_state_secrets enable row level security;

-- Policies
create policy "rooms_read" on public.rooms for select using (true);
create policy "rooms_write_service" on public.rooms for all using (auth.role() = 'service_role');

create policy "room_players_read" on public.room_players for select using (true);
create policy "room_players_write_service" on public.room_players for all using (auth.role() = 'service_role');

create policy "game_states_read" on public.game_states for select using (true);
create policy "game_states_write_service" on public.game_states for all using (auth.role() = 'service_role');

create policy "player_hands_service" on public.player_hands for all using (auth.role() = 'service_role');
create policy "player_hands_self_view" on public.player_hands for select using (auth.uid() = auth_user_id);

create policy "player_actions_service" on public.player_actions for all using (auth.role() = 'service_role');
create policy "player_actions_service_read" on public.player_actions for select using (auth.role() = 'service_role');

create policy "hand_results_read" on public.hand_results for select using (true);
create policy "hand_results_write_service" on public.hand_results for all using (auth.role() = 'service_role');

create policy "gss_service_all" on public.game_state_secrets
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- Default privileges for future tables
alter default privileges in schema public grant select on tables to anon, authenticated, service_role;
alter default privileges in schema public grant insert, update, delete on tables to service_role;
alter default privileges in schema public revoke insert, update, delete on tables from anon, authenticated;
