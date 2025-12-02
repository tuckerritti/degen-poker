# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **Double Board Bomb Pot PLO (Pot-Limit Omaha)** poker application built with Next.js 16, Supabase, and TypeScript. Players can create rooms, join tables, and play hands with real-time updates. The core innovation is a security-first architecture using Row Level Security (RLS) to prevent players from seeing each other's hole cards.

## Development Commands

```bash
# Development
npm run dev              # Start dev server at http://localhost:3000

# Building
npm run build            # Production build
npm start                # Start production server

# Code quality
npm run lint             # Run ESLint
npm run format           # Format code with Prettier
npm run format:check     # Check formatting without writing

# Supabase
npm run update-types     # Generate TypeScript types from local Supabase schema
supabase db reset        # Reset local database with migrations
```

## Core Architecture

### Security Model (Critical)

This application follows a **security-first poker architecture** where private information is strictly separated from public game state:

1. **Public Game State** (`game_states` table)
   - Contains pot size, current bet, phase, button position
   - Contains community cards in `board_state` JSONB field
   - Does NOT contain any player hole cards
   - Everyone can subscribe to this table

2. **Private Player Hands** (`player_hands` table)
   - Contains hole cards for each player in the current hand
   - Protected by Row Level Security (RLS)
   - Players can only query their own session_id
   - Realtime subscriptions are filtered by `session_id`
   - Server routes use service role to access all hands during showdown

3. **Anonymous Sessions**
   - No authentication - players identified by browser `session_id`
   - Session IDs stored in cookies and used for RLS filtering
   - Owner of room tracks via `owner_session_id`

### Database Schema

**Tables:**

- `rooms` - Poker tables/lobbies with game configuration
- `room_players` - Players seated at tables with chip stacks
- `game_states` - Current hand state (PUBLIC, no hole cards)
- `player_hands` - Private hole cards (RLS protected)
- `player_actions` - Action queue for processing
- `hand_results` - Archive of completed hands

**Key JSONB Fields:**

- `game_states.board_state` - `{"board1": ["Ah", "Kh", "7d"], "board2": ["2s", "9c", "Qd"]}`
- `player_hands.cards` - `["As", "Ks", "Qh", "Jh"]` (4 cards for PLO)
- `game_states.action_history` - Array of action objects

### Real-time Architecture

The app uses Supabase Realtime with `postgres_changes` subscriptions:

1. **Game State Hook** (`useGameState`)
   - Subscribes to `game_states` table filtered by `room_id`
   - Updates when pot, phase, or board cards change
   - Handles DELETE events when hand completes

2. **Player Hand Hook** (`usePlayerHand`)
   - Subscribes to `player_hands` filtered by `session_id=eq.${sessionId}`
   - RLS ensures players only receive their own cards
   - Critical for anti-cheating

3. **Room Players Hook** (`useRoomPlayers`)
   - Subscribes to `room_players` table
   - Updates when players join/leave or chip stacks change

### Data Flow

**Dealing a Hand:**

1. Frontend calls `/api/game/deal-hand` (owner only)
2. Server collects antes from all players
3. Server generates `deck_seed`, shuffles deterministically
4. Server deals 4 hole cards to each player
5. Server inserts into `player_hands` table (one row per player)
6. Server deals flop to both boards, stores in `board_state` JSONB
7. Server creates `game_states` record
8. Clients receive updates via Realtime subscriptions

**Player Action Flow:**

1. Frontend submits action via `/api/game/submit-action`
2. Server validates it's player's turn
3. Server inserts into `player_actions` queue
4. Server immediately processes action (updates chip stacks, pot, phase)
5. If betting round complete, server deals next street
6. If river complete, advances to showdown
7. Clients receive updates via `game_states` subscription

**Showdown Resolution:**

1. Auto-triggers after 5 seconds in showdown phase
2. Frontend calls `/api/game/resolve-hand`
3. Server fetches all `player_hands` using service role
4. Server evaluates winners (currently placeholder - splits pot equally)
5. Server updates chip stacks
6. Server archives to `hand_results`
7. Server deletes `game_states` record (triggers real-time DELETE event)

### Type Generation

Database types are auto-generated from the Supabase schema:

- **Source:** `supabase/migrations/20251130000000_initial_schema.sql`
- **Generated:** `src/types/database.types.ts` (via `npm run update-types`)
- **Wrapper:** `src/types/database.ts` (convenience type exports)

Always regenerate types after schema changes.

### Card Representation

Cards are stored as **2-character strings**: `"Ah"`, `"Kd"`, `"7s"`, `"2c"`

- First character: rank (`A`, `K`, `Q`, `J`, `T`, `9`-`2`)
- Second character: suit (`h`=hearts, `d`=diamonds, `c`=clubs, `s`=spades)

The deck is shuffled deterministically using a `deck_seed` (UUID) stored in `game_states`. This allows for hand reconstruction and auditing.

## File Organization

```
src/
├── app/
│   ├── api/              # Next.js API routes (server-side only)
│   │   ├── game/         # Game actions (deal, submit-action, resolve)
│   │   ├── rooms/        # Room management (create, join)
│   │   └── players/      # Player actions (rebuy)
│   ├── room/[roomId]/    # Dynamic room page
│   └── page.tsx          # Home page (room creation)
├── components/
│   └── poker/            # Poker-specific UI components
├── lib/
│   ├── poker/            # Core poker logic (deck, betting, pot-splitter)
│   ├── hooks/            # React hooks for Realtime subscriptions
│   ├── supabase/         # Supabase client setup (browser vs server)
│   └── validation/       # Zod schemas for API validation
└── types/
    ├── database.types.ts # Auto-generated from Supabase
    └── database.ts       # Convenience type exports
```

## Important Patterns

### Supabase Client Usage

**Browser (Client Components):**

```typescript
import { getBrowserClient } from "@/lib/supabase/client";
const supabase = getBrowserClient();
```

**Server (API Routes):**

```typescript
import { getServerClient } from "@/lib/supabase/server";
const supabase = await getServerClient(); // Note: async!
```

Server routes use the **publishable key** (not service role) but benefit from cookie-based auth. Service role access happens implicitly via RLS policies.

### Real-time Subscription Pattern

All hooks follow this pattern:

1. Initial fetch with `.single()` or `.maybeSingle()`
2. Subscribe to `postgres_changes` with filter
3. Handle INSERT/UPDATE/DELETE events
4. Return cleanup function to unsubscribe

### API Route Pattern

1. Parse and validate request body with Zod schema
2. Get server Supabase client
3. Verify authorization (session_id, ownership, etc.)
4. Execute database operations
5. Return JSON response with proper status codes
6. Catch Zod errors separately from other errors

## Common Pitfalls

1. **Board not showing when joining:** The board only appears after the owner clicks "Deal Hand". Before that, `gameState` is null. The UI checks `gameState && boardA.length > 0` before rendering community cards.

2. **Type casting JSONB fields:** Supabase returns JSONB as `unknown`, so cast explicitly:

   ```typescript
   const boardState = gameState.board_state as unknown as BoardState;
   const cards = playerHand.cards as unknown as string[];
   ```

3. **RLS vs Service Role:** The schema uses RLS policies that allow public reads (`USING (true)`) but filtering happens at the application layer via Supabase subscriptions. The server uses the publishable key, not a service role key.

4. **Deck shuffling:** Always use `shuffleDeck(seed)` with the seed from `game_states.deck_seed`. Never generate a new seed when dealing turn/river.

5. **JSONB updates:** When updating `board_state`, create a new object:
   ```typescript
   const updatedBoardState: BoardState = {
     board1: [...board1, deck[cardIndex++]],
     board2: [...board2, deck[cardIndex++]],
   };
   await supabase
     .from("game_states")
     .update({ board_state: updatedBoardState as unknown as any });
   ```

## TODO / Known Limitations

- **Hand evaluation:** The `splitPot()` function currently splits pots equally among all players. Actual PLO hand evaluation needs to be implemented.
- **Side pots:** `createSidePots()` logic exists but is not integrated into the hand resolution flow.
- **Timeouts:** Action deadlines are set but not enforced (no auto-fold on timeout).
- **Disconnection handling:** No reconnection logic or sitting out due to disconnect.
- **Rebuy functionality:** API route exists but UI is not implemented.
- alwyas use supabase migrations for database updates
