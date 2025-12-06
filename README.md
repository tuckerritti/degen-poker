# Poker App Monorepo

This repo uses Turborepo with a Next.js frontend (`apps/web`), an Express-based engine service (`apps/engine`), Supabase schema/migrations, and shared types.

## Structure
- `apps/web` – Next.js UI (consumes engine API + Supabase realtime)
- `apps/engine` – Express engine service (Supabase service-role)
- `packages/shared` – shared enums/payload types
- `supabase/` – config + migrations (schema, RLS)

## Commands
- `npm run dev` – start engine (3001) and web (3000) via Turbo
- `npm run dev --workspace apps/engine` – engine dev with hot reload (tsx watch)
- `npm run dev --workspace apps/web` – web dev (Turbopack)
- `npm run build` – Turbo build (runs all package `build` scripts)
- `npm run lint` – Turbo lint
- `npm run format` / `npm run format:check` – Prettier at repo root
- `npm run update-types` – regenerate Supabase types into `apps/web/src/types/database.types.ts` (uses local Supabase project)
- `npm run lint --workspace apps/engine` – engine lint/typecheck
- `npm run lint --workspace apps/web` – web lint

## Env setup
Copy sample files and fill in values:

- `apps/engine/env.sample` → `apps/engine/.env.local`
  - `SUPABASE_URL` (e.g., http://127.0.0.1:54321)
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `ENGINE_PORT=3001`
- `apps/web/env.sample` → `apps/web/.env.local`
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
  - `NEXT_PUBLIC_ENGINE_URL` (e.g., http://localhost:3001)

## Supabase
- Migrations live in `supabase/migrations/` (schema/RLS).
- Run `supabase start`, then `supabase db reset` to apply migrations locally.
- Regenerate typed client models for the web app after migrations: `npm run update-types`.
