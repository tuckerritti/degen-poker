# Poker App Monorepo

This repo now uses Turborepo with a Next.js frontend under `apps/web`. The backend/engine and shared packages are placeholders for the redesign.

## Structure
- `apps/web` – Next.js UI (kept intact from the previous app)
- `apps/engine` – backend service placeholder for upcoming redesign
- `packages/shared` – shared types/constants placeholder
- `supabase/` – keeps `config.toml`; migrations folder is currently empty

## Commands
- `npm run dev` – start web app via Turbo (`--filter=web`)
- `npm run build` – Turbo build (runs all package `build` scripts)
- `npm run lint` – Turbo lint
- `npm run format` / `npm run format:check` – Prettier at repo root

From the repo root, env files should live at `apps/web/.env` for Next.js.
