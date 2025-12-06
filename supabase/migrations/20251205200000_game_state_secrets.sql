-- Secrets table to keep full board and deck seed hidden from clients
create table if not exists public.game_state_secrets (
  id uuid primary key default gen_random_uuid(),
  game_state_id uuid not null references public.game_states on delete cascade,
  deck_seed text not null,
  full_board1 text[] not null,
  full_board2 text[] not null,
  created_at timestamptz not null default now(),
  unique(game_state_id)
);

alter table public.game_state_secrets enable row level security;

-- Only service role can read/write
create policy "gss_service_all" on public.game_state_secrets
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- Default privileges for future tables in schema already defined; no public grants here.
