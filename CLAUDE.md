# CLAUDE.md - DeezStats

## Project Overview

DeezStats is a live sports betting edge finder for NBA and NFL games. It exploits the lag in sportsbook live player prop adjustments for players with limited sample sizes (rookies, role players, early-season). The app calculates real-time edge scores and alerts users when betting lines are mispriced.

**Deployed at:** `https://stats.deezboxes.com`

## Tech Stack

- **Framework:** Next.js 16 (App Router) with React 19, TypeScript 5.7
- **Database:** Neon PostgreSQL (serverless) via Drizzle ORM
- **Auth:** NextAuth v5 (beta 25) with email verification codes (6-digit) via SMTP2GO
- **UI:** Tailwind CSS 3 + shadcn/ui (Radix primitives) + lucide-react icons
- **Theme:** Custom "Gentleman's Club" palette (leather, whiskey, forest, gold, cream)
- **External APIs:** BallDontLie API (game data, player stats, props), cron-job.org (scheduled sync)
- **Deployment:** Vercel

## Commands

```bash
npm run dev          # Start dev server
npm run build        # Production build
npm run start        # Start production server
npm run lint         # ESLint
npm run db:generate  # Generate Drizzle migrations
npm run db:migrate   # Run Drizzle migrations
npm run db:push      # Push schema changes directly (no migration files)
npm run db:studio    # Open Drizzle Studio (DB GUI)
```

## Project Structure

```
app/
  (auth)/             # Auth route group (login, verify pages)
  (dashboard)/        # Dashboard route group (game picker, monitoring, history)
  (admin)/            # Admin route group (user/player/line management)
  api/
    auth/             # NextAuth handlers + send-code endpoint
    games/            # Game data, monitoring, sync, live SSE stream
    cron/             # Sync endpoint (hit by cron-job.org every 5 min)
    alerts/           # Active alerts + history
    watchlist/        # User watchlist CRUD
    players/          # Live player stats
    admin/            # Admin-only endpoints (users, games, players, lines, cron setup)
components/
  ui/                 # shadcn/ui primitives (button, card, badge, etc.)
  dashboard/          # Dashboard components (game-picker, monitoring-table, alerts-panel, etc.)
  admin/              # Admin components (auto-sync, sync-button)
lib/
  db/
    index.ts          # Drizzle DB client (Neon serverless)
    schema.ts         # Full database schema with relations
  auth/
    config.ts         # NextAuth config (credentials provider, email sending)
  algorithm/
    edge.ts           # Edge Score algorithm (main)
    mateo.ts          # Mateo Score algorithm (simpler pace-based)
  balldontlie/
    client.ts         # BallDontLie API client (NBA + NFL)
hooks/
  use-toast.ts        # Toast notification hook
middleware.ts         # Auth middleware (route protection, admin checks)
```

## Key Architecture Patterns

- **Path alias:** `@/*` maps to project root
- **Route groups:** `(auth)`, `(dashboard)`, `(admin)` for layout separation
- **Server components** for layouts/data-fetching; `"use client"` for interactive pages
- **API routes** use Next.js Route Handlers (`NextRequest`/`NextResponse`)
- **Auth:** Server-side via `auth()`, middleware for pages, API routes check sessions individually
- **Real-time:** SSE streaming at `/api/games/live/stream` (30s intervals) + client polling every 10s on game pages
- **Force-dynamic** on all live data routes: `export const dynamic = "force-dynamic"`
- **UUID primary keys** generated with `crypto.randomUUID()`
- **Foreign keys** cascade on delete

## Database Schema (lib/db/schema.ts)

Core tables: `users`, `players`, `games`, `player_lines`, `live_stats`, `alerts`, `watchlist`, `audit_log`, `accounts`, `sessions`, `verification_tokens`

Key enums: `sport` (nfl, nba, ncaab, ncaaf), `game_status` (scheduled, in_progress, final, postponed), `stat_type` (points, rebounds, assists, three_pointers, steals, blocks, receiving_yards, rushing_yards, receptions, passing_yards, touchdowns), `alert_status` (active, expired, hit, missed)

**Note:** The `espnId` field on players/games actually stores BallDontLie IDs, not ESPN IDs (historical naming).

## Core Algorithms

### Edge Score v2 (lib/algorithm/edge.ts)
```
EDGE = (BAYESIAN_PACE × POISSON_CONFIDENCE × USAGE_MULT × PACE_NORM × DATA_SCARCITY × GAME_TIMING) - VARIANCE_PENALTY
```
- **BAYESIAN_PACE** = blends season avg (prior) with live pace (evidence), weighted by minutes played
- **POISSON_CONFIDENCE** = P(over) for rare events (steals, blocks, 3PT, TDs), clamped [0.3, 1.5]
- **USAGE_MULT** = 0.7 + (usagePct/100) * 1.5 (NBA only, from advanced stats)
- **PACE_NORM** = gamePace / 100 (NBA only, from advanced stats)
- **DATA_SCARCITY** = 1 + (1 / sqrt(games_played + 1)), with 20% rookie bonus
- **GAME_TIMING** = 0.4 + 0.6 × e^(-3 × progress) (exponential decay)
- **VARIANCE_PENALTY** = historical_stddev / pregame_line
- **Blowout detection** reduces effective expected minutes (>25pt lead in Q3+ → 70% reduction)
- **Foul trouble** reduces effective expected minutes (5 PF before Q4 → 50% reduction, NBA only)
- **Sigmoid dampening** replaces linear fade (transition at 40% progress)
- Signal thresholds: none (<1.5), monitor (1.5-2.0), good (2.0-3.0), strong (>3.0)

### Stat-Type Dampening (sigmoid fade)
- Points: 1.0x, Rebounds: 1.3x, Assists: 1.2x, 3PT: 2.0x, Steals/Blocks: 2.5x

### Mateo Score (lib/algorithm/mateo.ts)
```
Mateo = (Live_Stat / Live_Prop) / (minutes_played / expected_minutes)
```

## Data Flow

1. **cron-job.org** (every 5 min) or **admin auto-sync** hits `GET /api/cron/sync`
2. Sync fetches games, player stats, props from **BallDontLie API** for yesterday/today/tomorrow
3. Games, players, lines upserted into Neon PostgreSQL
4. Edge Score + Mateo Score calculated for live games
5. Alerts created when edge scores cross thresholds
6. Dashboard receives updates via SSE stream + client polling

## Environment Variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Neon PostgreSQL connection string (`?sslmode=require`) |
| `NEXTAUTH_SECRET` | JWT signing secret |
| `NEXTAUTH_URL` | App URL (`https://stats.deezboxes.com`) |
| `BALLDONTLIE_API_KEY` | BallDontLie API key |
| `SMTP2GO_API_KEY` | SMTP2GO email API key |
| `EMAIL_FROM` | Sender email (default: `noreply@deezboxes.com`) |
| `ADMIN_EMAILS` | Comma-separated admin email addresses |
| `CRONJOB_API_KEY` | cron-job.org API key (sync endpoint auth) |

## Reference Docs

- **BallDontLie OpenAPI Spec:** `docs/balldontlie-openapi.yml` - Full OpenAPI 3.1 spec (NBA, NFL endpoints, schemas, parameters)
- **BallDontLie API Reference:** `docs/balldontlie-api-reference.md` - Condensed NBA/NFL-only reference with endpoints, schemas, and examples

## Conventions

- TypeScript strict mode enabled
- ESLint: `next/core-web-vitals` + `next/typescript`, warns on unused vars and `any`
- UI components follow shadcn/ui patterns with `cn()` utility for class merging
- CSS classes: `card-leather` for styled cards, `edge-none/monitor/good/strong` for badges, `gold-accent` for borders
- Fonts: Inter (body) + Playfair Display (headings)
- BallDontLie IDs: NBA uses raw numeric IDs, NFL uses `nfl-{id}` prefix
- No test suite exists currently
- No CI/CD pipeline (relies on Vercel auto-deploy)
