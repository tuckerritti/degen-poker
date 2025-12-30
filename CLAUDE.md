# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **Double Board Bomb Pot PLO (Pot-Limit Omaha)** poker application built as a Turborepo monorepo. The architecture separates game logic into an Express engine service and a Next.js web frontend, with Supabase providing database and real-time subscriptions.

We want the simplest change possible. We don't care about migration. Code readability matters most, and we're happy to make bigger changes to achieve it.

**Key Innovation:** Security-first architecture where hole cards are stored server-side in RLS-protected tables, preventing players from seeing each other's hands via client-side manipulation.

## Development Commands

```bash
# Development
npm run dev                           # Start both engine (3001) and web (3000)
npm run dev --workspace apps/engine   # Engine only with hot reload (tsx watch)
npm run dev --workspace apps/web      # Web only (Next.js Turbopack)

# Building & Linting
npm run build                         # Turbo build all workspaces
npm run lint                          # Turbo lint all workspaces
npm run lint --workspace apps/engine  # Engine lint + typecheck
npm run lint --workspace apps/web     # Web lint only

# Code Formatting
npm run format                        # Format code with Prettier
npm run format:check                  # Check formatting without writing

# Testing
npm run test                          # Run all tests (Turbo)
npm run test --workspace apps/engine  # Run engine tests (Vitest)
npm run test:watch --workspace apps/engine  # Watch mode
npm run test:coverage --workspace apps/engine  # Coverage report
npm run test:unit --workspace apps/engine  # Unit tests only

# Supabase
npm run update-types                  # Generate TypeScript types from local Supabase
supabase db reset                     # Reset local DB and apply migrations
```

**IMPORTANT:** Always run `npm run build` and `npm run lint` after making changes. Fix all errors before committing.

## Project Structure

```
apps/
├── engine/          Express service with game logic (uses service role)
│   └── src/
│       ├── index.ts      # REST API routes
│       ├── logic.ts      # Core game logic (dealHand, applyAction, payouts)
│       ├── deck.ts       # Card shuffling with deterministic seed
│       ├── secrets.ts    # Fetch game_state_secrets (full board, deck seed)
│       ├── supabase.ts   # Supabase client (service role)
│       └── types.ts      # Engine-specific types
├── web/             Next.js 16 frontend
│   └── src/
│       ├── app/          # Next.js app router
│       ├── components/   # React components
│       ├── lib/
│       │   ├── hooks/        # Real-time subscription hooks
│       │   ├── poker/        # Client-side poker utilities
│       │   ├── supabase/     # Supabase client setup
│       │   └── engineClient.ts  # Helper to call engine API
│       └── types/        # Database types (auto-generated)
packages/
└── shared/          Shared enums and payload types
supabase/
└── migrations/      SQL migrations (schema + RLS policies)
```

## Core Architecture

### Service Separation

**Engine Service** (`apps/engine`, port 3001):

- Express REST API with Zod validation
- Uses Supabase **service role** key to bypass RLS
- Handles all game logic (dealing, action processing, payouts)
- Manages secrets (deck seeds, full boards) via `game_state_secrets` table
- No authentication - players identified by seat number + optional `auth_user_id`

**Web Frontend** (`apps/web`, port 3000):

- Next.js 16 with app router
- Calls engine API via `engineClient.ts` helper
- Subscribes to Supabase real-time updates for UI reactivity
- Uses Supabase **publishable key** (limited by RLS)

### Security Model: Preventing Hole Card Leaks

The application prevents players from seeing each other's hole cards through a **server-authoritative** architecture:

1. **`game_state_secrets` table** (server-only):
   - Stores `deck_seed`, `full_board1`, `full_board2` for each hand
   - RLS policy: only `service_role` can read/write
   - Never exposed to clients

2. **`player_hands` table** (RLS-protected):
   - Each player's 4 hole cards stored as JSONB
   - RLS policy: players can only query rows where `auth_user_id = auth.uid()`
   - Real-time subscriptions filtered by `auth_user_id`
   - Server uses service role to read all hands during showdown

3. **`game_states` table** (public, no secrets):
   - Contains `board_state` JSONB with visible community cards
   - Reveals cards progressively: 3 on flop, 4 on turn, 5 on river
   - Does NOT contain `deck_seed` (shows `"hidden"` instead)
   - Everyone can subscribe to this table

4. **Card dealing flow**:
   - Engine generates `deck_seed`, shuffles deck deterministically
   - Deals 4 cards to each player, stores in `player_hands`
   - Deals 10 cards (5 per board), stores full boards in `game_state_secrets`
   - Writes partial boards (3 cards each) to `game_states.board_state`
   - As betting rounds complete, reveals 4th and 5th cards by updating `board_state`

### Real-time Architecture

All real-time updates use Supabase `postgres_changes` subscriptions:

**`useGameState(roomId)`** (`apps/web/src/lib/hooks/useGameState.ts`):

- Subscribes to `game_states` filtered by `room_id`
- Updates on pot changes, phase transitions, board reveals
- Handles DELETE events when hand completes

**`usePlayerHand(roomId, authUserId)`**:

- Subscribes to `player_hands` filtered by `auth_user_id`
- RLS ensures players only receive their own cards
- Critical anti-cheating measure

**`useRoomPlayers(roomId)`**:

- Subscribes to `room_players` table
- Updates when players join/leave or chip stacks change

### Data Flow

**Starting a Hand:**

1. Web calls `POST /rooms/:roomId/start-hand` on engine
2. Engine calls `dealHand()` from `logic.ts`:
   - Generates `deck_seed` (UUID)
   - Shuffles deck deterministically
   - Deals 4 cards to each active player
   - Deals 5 cards to each of two boards
   - Collects antes, updates chip stacks
3. Engine writes to DB:
   - `game_state_secrets` (full boards, seed)
   - `player_hands` (one row per player)
   - `game_states` (partial boards, pot, phase)
   - `room_players` (updated chip stacks)
4. Web receives real-time updates via subscriptions

**Processing Actions:**

1. Web calls `POST /rooms/:roomId/actions` on engine
2. Engine validates turn order, fetches `game_state_secrets`
3. Engine calls `applyAction()` from `logic.ts`:
   - Updates pot, bets, chip stacks
   - Determines if street is complete
   - If complete, advances phase and reveals next board cards
   - If hand complete, triggers payout
4. Engine writes `player_actions` log and updates `game_states`
5. Web receives real-time update with new phase/board

**Hand Completion:**

- Triggered automatically when only one player remains or river completes
- Engine determines winners (currently splits pot equally - **TODO: implement PLO hand evaluation**)
- Engine calls `endOfHandPayout()` to distribute pot
- Engine updates `room_players` chip stacks
- Engine writes `hand_results` archive
- Engine deletes `game_states` row (triggers real-time DELETE event)

## Important Patterns

### Supabase Client Usage

**Engine (server-side):**

```typescript
import { supabase } from "./supabase.js"; // Uses service role key
```

**Web (client-side):**

```typescript
import { getBrowserClient } from "@/lib/supabase/client";
const supabase = getBrowserClient(); // Uses publishable key
```

### Calling Engine API from Web

```typescript
import { engineFetch } from "@/lib/engineClient";

const response = await engineFetch("/rooms/abc-123/start-hand", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ deckSeed: "optional-seed" }),
});
```

### Real-time Subscription Pattern

All hooks in `apps/web/src/lib/hooks/` follow this pattern:

1. Initial fetch with `.single()` or `.maybeSingle()`
2. Subscribe to `postgres_changes` with filter
3. Handle INSERT/UPDATE/DELETE events in callback
4. Return cleanup function to unsubscribe

### Engine API Route Pattern

See `apps/engine/src/index.ts`:

1. Define Zod schema for request validation
2. Parse request with `schema.parse()` or `.safeParse()`
3. Fetch required data from Supabase
4. Call pure logic functions from `logic.ts`
5. Write results to DB with error handling
6. Return JSON response with proper status codes

### Type Generation

Database types are auto-generated from Supabase schema:

- **Source:** `supabase/migrations/*.sql`
- **Generated:** `apps/web/src/types/database.types.ts`
- **Command:** `npm run update-types`

**ALWAYS regenerate types after schema changes.**

### Card Representation

Cards are **2-character strings**: `"Ah"`, `"Kd"`, `"7s"`, `"2c"`

- First character: rank (`A`, `K`, `Q`, `J`, `T`, `9`-`2`)
- Second character: suit (`h`=hearts, `d`=diamonds, `c`=clubs, `s`=spades)

Decks are shuffled deterministically using `seedrandom` with a UUID seed stored in `game_state_secrets.deck_seed`. This allows hand reconstruction and auditing.

### JSONB Fields

Supabase returns JSONB as `unknown`, so explicit casting is required:

```typescript
const boardState = gameState.board_state as unknown as {
  board1?: string[];
  board2?: string[];
};
const cards = playerHand.cards as unknown as string[];
```

**Common JSONB fields:**

- `game_states.board_state`: `{ board1: ["Ah", "Kh", "7d"], board2: [...] }`
- `player_hands.cards`: `["As", "Ks", "Qh", "Jh"]` (4 PLO hole cards)
- `game_states.action_history`: Array of action objects
- `game_states.side_pots`: Array of side pot objects (not yet implemented)

## Database Schema

**Key tables:**

- `rooms` - Poker tables with game configuration (blinds, antes, max players)
- `room_players` - Players seated at tables with chip stacks, current bets
- `game_states` - Current hand state (PUBLIC, no deck seed or full boards)
- `game_state_secrets` - Server-only secrets (deck seed, full boards)
- `player_hands` - Private hole cards (RLS protected by `auth_user_id`)
- `player_actions` - Action queue/log for auditing
- `hand_results` - Archive of completed hands

**RLS Policies:**

- Most tables allow public reads (`for select using (true)`)
- Writes restricted to `service_role`
- `player_hands` has special policy: `for select using (auth.uid() = auth_user_id)`
- `game_state_secrets` completely blocked from non-service-role clients

## Shared Package

`packages/shared` exports TypeScript types and enums used by both engine and web:

- `ActionType`, `GamePhase`, `GameMode` enums
- Payload interfaces: `CreateRoomPayload`, `JoinRoomPayload`, `ActionRequestPayload`, etc.
- Ensures type consistency across services

## Environment Setup

**Engine** (`apps/engine/.env.local`):

```
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
ENGINE_PORT=3001
NODE_ENV=development
ENGINE_CORS_ORIGIN=http://localhost:3000
```

**Web** (`apps/web/.env.local`):

```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-anon-key
NEXT_PUBLIC_ENGINE_URL=http://localhost:3001
```

Copy from `apps/engine/env.sample` and `apps/web/env.sample`.

## Common Pitfalls

1. **Board not showing:** Boards only appear after calling `POST /start-hand`. Check `gameState && boardState.board1?.length > 0` before rendering.

2. **Type casting JSONB:** Always cast JSONB fields explicitly (Supabase returns `unknown`).

3. **RLS vs Service Role:** Engine uses service role to bypass RLS. Web uses publishable key and is restricted by RLS policies.

4. **Deck shuffling:** Always use `shuffleDeck(seed)` with the seed from `game_state_secrets.deck_seed`. Never generate new seeds when revealing turn/river cards.

5. **JSONB updates:** Create new objects when updating board state:

   ```typescript
   const updatedBoardState = {
     board1: [...existingBoard1, newCard],
     board2: [...existingBoard2, newCard],
   };
   await supabase
     .from("game_states")
     .update({ board_state: updatedBoardState as unknown as any })
     .eq("id", gameStateId);
   ```

6. **Database changes:** ALWAYS use Supabase migrations (`supabase/migrations/*.sql`). Never modify schema manually.

7. **After schema changes:** Run `npm run update-types` to regenerate TypeScript types.

## Testing

Engine tests use Vitest with coverage thresholds (80% lines/functions, 75% branches):

**Test structure** (`apps/engine/tests/`):
- `unit/` - Pure logic tests (deck, hand evaluation, action processing)
- `integration/` - Database integration tests
- `fixtures/` - Test data and helper functions
- `setup.ts` - Global test setup

**Running specific tests:**
```bash
npm run test:unit --workspace apps/engine              # Unit tests only
npx vitest run tests/unit/dealHand.test.ts --workspace apps/engine  # Single file
npm run test:watch --workspace apps/engine             # Watch mode
npm run test:coverage --workspace apps/engine          # Coverage report
```

**Test aliases:**
- `@/` → `apps/engine/src/`
- `@tests/` → `apps/engine/tests/`

## Known Limitations / TODOs

- **Hand evaluation:** `endOfHandPayout()` currently splits pots equally among all non-folded players. Actual PLO hand evaluation using `@poker-apprentice/hand-evaluator` needs implementation.
- **Side pots:** Logic exists in `game_states.side_pots` JSONB field but is not calculated or awarded.
- **Action timeouts:** `action_deadline_at` is set but not enforced (no auto-fold).
- **Disconnection handling:** No reconnection logic or auto-sit-out.
- **Authentication:** Currently anonymous (players identified by seat only). `auth_user_id` fields exist but are optional.
