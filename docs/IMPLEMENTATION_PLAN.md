# Implementation Plan

This document outlines how we will rebuild the poker platform into a Turborepo monorepo with a clean separation of concerns across the Engine (Node service), Supabase (data + auth + realtime), and the Web frontend (Next.js). The goal is to reintroduce backend capabilities with a more maintainable architecture while preserving the redesigned frontend.

---

## High-Level Responsibilities

- **Engine (`apps/engine`)**
  - Stateless, idempotent business logic service (Node/TypeScript).
  - Handles game orchestration: table lifecycle, hand flow, action validation, pot calculations, showdown resolution, timers.
  - Exposes a typed API (tRPC/HTTP) consumed by the web app; emits events to Supabase realtime channels or a dedicated event bus.
  - Owns deterministic randomness (seeded deck), anti-cheat checks, and reconciliation of state transitions.
  - Runs background jobs (hand auto-resolve, blinds/antes enforcement, pause scheduling).

- **Supabase (`supabase/`)**
  - Source-of-truth Postgres schema for rooms, seats, actions, game states, hand history, and audit trails.
  - Row Level Security: isolates private data (player hole cards) per session/user.
  - Realtime: broadcasts table/game state changes to clients via `postgres_changes`.
  - Auth: anonymous sessions with optional account upgrade; stores session_id for RLS.
  - Edge functions (optional): thin wrappers for public webhooks (join table, create room) if we want to avoid exposing engine directly.
  - Storage (optional): avatars, hand history exports.

- **Web Frontend (`apps/web`)**
  - Next.js app consuming the Engine API and Supabase realtime feeds.
  - Client hooks manage subscriptions to realtime updates and render table UI.
  - Handles optimistic UX (e.g., action buttons) while deferring truth to engine-confirmed state.
  - Provides room management flows, seating, rebuy UI, pause controls, and stats display.

---

## Architecture Blueprint

1) **Data Flow**
   - Web sends intent (join, action, pause) → Engine validates → writes authoritative rows to Supabase → Supabase realtime notifies web → web updates UI.
   - Private info (hole cards) stored in `player_hands` with RLS on `session_id`; public state in `game_states`.
   - Deterministic deck seeds stored per hand for auditability.

2) **APIs**
   - Engine exposes `POST /rooms`, `POST /rooms/{id}/join`, `POST /actions`, `POST /hands/{id}/resolve`, etc., or tRPC equivalents.
   - Web never writes directly to tables (except minimal auth/session bootstrap if kept).

3) **State Machines**
   - Engine maintains a finite-state machine for hand phases: `preflop → flop → turn → river → showdown → cleanup`.
   - Timers for action deadlines and auto-resolve handled by engine; stored deadlines mirrored in DB for transparency.

4) **Observability**
   - Structured logging (pino) with request IDs; audit tables for critical transitions.
   - Metrics hooks (later): action latency, hand duration, rake (if added).

---

## Implementation Plan (Phased)

### Phase 0 – Repo Scaffolding (current)
- ✅ Turborepo layout (`apps/web`, `apps/engine`, `packages/shared`, `supabase/`).
- ✅ Frontend preserved; backend code removed; migrations cleared except `config.toml`.
- ✅ Shared package stubbed; engine placeholder present.

### Phase 1 – Schema & Types
- Recreate Supabase schema:
  - Tables: `rooms`, `room_players`, `game_states`, `player_hands`, `player_actions`, `hand_results`.
  - RLS: ensure `player_hands` filtered by `session_id`; `room_players` filtered by `room_id` and ownership rules.
  - Policies for inserts/updates aligned with engine service role vs. anon clients.
- Migrations: add SQL files under `supabase/migrations/`.
- Regenerate types: `npm run update-types` (writes to `apps/web/src/types/database.types.ts`).
- Publish shared enums/constants to `packages/shared` (game modes, phases, action types).

### Phase 2 – Engine Service
- Choose transport: start with REST (Express/Fastify) or tRPC; keep interfaces in `packages/shared`.
- Implement modules:
  - `deck`: deterministic shuffler by seed.
  - `hand-state`: FSM, action validation, min-raise logic, side pots, showdown resolution (reuse or replace current evaluator).
  - `persistence`: Supabase client with service role; repository layer per table.
  - `actions`: endpoints for deal-hand, submit-action, resolve-hand, pause/unpause, rebuy.
  - `jobs`: timers for action deadlines and auto-resolve; can be in-process initially.
- Error handling: idempotency keys for actions; validation via zod.
- Logging: pino with requestId; emit structured events for auditing.

### Phase 3 – Frontend Wiring
- Replace direct Supabase writes with Engine API calls (fetch/tRPC).
- Keep realtime subscriptions for `game_states` and `room_players`; hook updates remain similar.
- Update hooks to read from `@shared` types and generated Supabase types.
- Add config for engine base URL (env in `apps/web/.env`).

### Phase 4 – Testing & Quality
- Unit tests for engine state machine and pot splitting.
- Contract tests between web and engine (mock Supabase).
- Migration tests: `supabase db lint` or local `supabase db diff`.
- Lint/typecheck in CI via Turbo pipelines.

### Phase 5 – Deployment Readiness
- Containerize engine; define Fly/Render/Vercel functions deployment (TBD).
- Supabase project setup and secrets management.
- Edge cache rules for static assets; incremental static regeneration if needed.

---

## Deliverables Checklist
- [ ] Supabase schema migrations reintroduced under `supabase/migrations/`
- [ ] Generated types in `apps/web/src/types/`
- [ ] Shared enums/constants in `packages/shared`
- [ ] Engine endpoints and state machine implemented in `apps/engine`
- [ ] Frontend hooked to engine APIs and Supabase realtime
- [ ] CI: lint, typecheck, engine unit tests, migration checks

---

## Open Decisions
- Transport choice: REST vs. tRPC; lean REST if external integrations expected.
- Reuse existing hand evaluator vs. custom evaluator; confirm licensing and performance needs.
- Hosting model for engine (serverless vs. long-lived timers). Initial path: long-lived service to manage timers reliably.
