-- Archive player sessions for leave tracking

create table if not exists public.player_sessions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms on delete cascade,
  auth_user_id uuid null,
  display_name text not null,
  seat_number int not null,
  total_buy_in int not null default 0,
  final_chip_stack int not null default 0,
  net_profit_loss int not null default 0,
  hands_played int not null default 0,
  joined_at timestamptz not null default now(),
  left_at timestamptz not null default now(),
  left_during_hand boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists player_sessions_room_id_idx on public.player_sessions(room_id);
create index if not exists player_sessions_auth_user_id_idx on public.player_sessions(auth_user_id);

alter table public.player_sessions replica identity full;

alter publication supabase_realtime add table public.player_sessions;

-- RLS
alter table public.player_sessions enable row level security;

create policy "player_sessions_read" on public.player_sessions for select using (true);
create policy "player_sessions_write_service" on public.player_sessions for all
  using (auth.role() = 'service_role');
