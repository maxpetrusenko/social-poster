# Social Poster — Tasks & Status

Last updated: 2026-04-07

## Current State

Dashboard-first social automation platform. Separate repo from maxpetrusenko.com.
Replaces `social-agent/` subfolder in the website repo and the Cowork scheduled tasks.
Deploys to `social.maxpetrusenko.com` on Contabo/Coolify.

## What's Done

### Infrastructure
- [x] Cowork scheduled tasks disabled (all 5: 9am video, 6pm video, 11am/1pm/3pm image)
- [x] Contabo still running old social-agent (needs cutover)
- [x] New repo created: `~/Desktop/Projects/social-poster`

### Project Skeleton
- [x] Next.js 15 + Tailwind 4 + TypeScript
- [x] Drizzle ORM + SQLite (WAL mode, persistent volume)
- [x] Package.json with all dependencies
- [x] tsconfig, postcss, drizzle config, .env.example

### Database Schema (src/db/schema.ts)
- [x] `sessions` — auth sessions
- [x] `magic_links` — passwordless auth
- [x] `platforms` — connected social accounts (X, LinkedIn, TikTok, IG, etc.)
- [x] `profiles` — brand identity / voice / face settings
- [x] `posts` — content items with status lifecycle
- [x] `post_targets` — many-to-many post→platform with per-platform status
- [x] `schedules` — cron job definitions (editable from UI)
- [x] `pipeline_runs` — execution history with step-level detail
- [x] `dedup_cache` — content deduplication

### Auth
- [x] Magic link email flow (src/lib/auth.ts, src/lib/mail.ts)
- [x] Session cookie management (30-day TTL)
- [x] Single allowed email (AUTH_EMAIL env var)
- [x] Login page (src/app/login/page.tsx)
- [x] Auth temporarily bypassed (`DISABLE_AUTH` defaults on for now)

### Dashboard Pages (all under /dashboard)
- [x] Layout with sidebar navigation
- [x] Dashboard home — stat cards + recent runs + recent posts
- [x] Platforms — list, create, edit, delete, per-platform skills/config editor
- [x] Profiles — list, create, edit, delete (voice ID, face ID, tone)
- [x] Posts — list with status filters, create with platform targeting, detail view
- [x] Calendar — monthly grid view with scheduled posts
- [x] Pipeline — run history with expandable step detail
- [x] Schedules — list, create, edit, delete, manual "Run Now"
- [x] Settings — read-only config display

### API Routes
- [x] CRUD for platforms, profiles, posts, schedules
- [x] Manual schedule run endpoint
- [x] Post deletion cascades to targets

### Legacy Restore
- [x] Legacy import script (`npm run legacy:import`)
- [x] Seed profile + platforms + schedules from `../social-agent/config/schedule.json`
- [x] Optional remote pipeline history import from legacy Contabo volume
- [x] Local DB restored with 1 profile, 8 platforms, 5 schedules, 5 pipeline runs

## What's NOT Done Yet

### Auth (remaining)
- [x] `src/app/api/auth/login/route.ts` — POST handler to create magic link + send email
- [x] `src/app/api/auth/verify/route.ts` — GET handler to verify token + create session
- [x] `src/app/api/auth/logout/route.ts` — POST handler to destroy session
- [x] Middleware to protect /dashboard routes (next middleware.ts)
- [ ] Re-enable auth before production hardening if needed

### Agent / Pipeline Engine
- [x] Feed ingest logic ported into `src/lib/pipeline/feed-engine.ts`
- [x] Late/Zernio publish path ported into `src/lib/pipeline/publisher.ts`
- [x] Simli avatar video generation adapter
- [x] Cartesia TTS adapter
- [x] Remotion video rendering pipeline
- [ ] Image generation pipeline (sharp-based card renderer)
- [ ] Bird (X CLI) adapter as fallback
- [x] Cron scheduler that reads from `schedules` table
- [x] Pipeline orchestrator: feed → dedup → render → publish → log
- [ ] Idempotency keys on every publish attempt

### Deploy
- [x] Dockerfile (standalone Next.js + chromium + ffmpeg)
- [x] docker-compose.yml for local dev
- [x] VPS deploy live behind Traefik at `social.maxpetrusenko.com`
- [x] Env vars migrated for Cartesia, Simli, Late/Zernio
- [x] Update SIMLI_FACE_ID on Contabo → `7bb46589-4be6-4df8-ab80-03443fb75d6f`
- [x] Update CARTESIA_VOICE_ID → `7270ea4d-a17a-4f21-a3da-03f2b128669d`
- [x] Root deployment doc: `DEPLOYMENT.md`

### Polish
- [x] npm install + build verification
- [x] Fix TypeScript / import errors blocking build
- [x] Seed script for initial platforms + profile + schedules
- [x] Git init + first commit + push to GitHub
- [ ] Public social feed endpoint (GET /api/feed — for website consumption)
- [ ] Real-time status updates (polling or SSE on pipeline page)
- [ ] Toast notifications for form actions
- [ ] Mobile-responsive sidebar (hamburger on small screens)

### Cutover Plan
1. Deploy new social-poster to Coolify
2. Verify /health + /dashboard
3. Run legacy import script or seed initial platforms + profile + schedules via UI
4. Run one manual job, verify output
5. Enable cron schedules
6. Monitor 3-5 runs
7. Delete old social-agent from website repo
8. Point social.maxpetrusenko.com at new app
9. Update website to read social feed from new /api/feed

## Architecture

```
social-poster/
  src/
    app/              # Next.js App Router
      api/            # REST API routes
      dashboard/      # Protected admin UI
      login/          # Auth pages
    components/       # Shared React components
    db/               # Drizzle schema + connection
    lib/              # Auth, mail, utils, shared logic
      feeds/          # (TODO) News feed ingest
      publish/        # (TODO) Platform adapters (zernio, bird, etc.)
      render/         # (TODO) Image + video rendering
      pipeline/       # (TODO) Job orchestrator
  docs/               # This file, architecture docs
  data/               # SQLite DB (gitignored, persistent volume in prod)
  public/             # Static assets
  drizzle/            # Generated migrations
```

## Key Decisions
- Next.js 15 over Hono: need SSR for public feed, form-heavy CRUD benefits from server components + actions
- SQLite over Postgres: single replica, single writer, simplest path. Migrate when needed.
- Magic link over OAuth: no third-party dependency, single admin user
- Drizzle over Prisma: lighter, better SQLite support, no binary
- Separate repo: different deploy cadence, different secrets, cleaner CI

## Ops Notes
- `/health` returns JSON health status for Coolify / load balancer probes
- `/api/health` returns app + active scheduler state
- Local restore command:
  `npm run legacy:import -- --legacy-dir ../social-agent --with-remote-runs --ssh-target max@173.249.52.27 --ssh-key ~/.ssh/contabo_vmi3203669_ed25519 --volume <coolify-volume>`
- Imported schedules default to disabled, matching pre-cutover safety
- Platform skills live in `platforms.config.skills`; advanced per-platform settings live in `platforms.config`

## Environment
- Contabo VPS: 173.249.52.27
- Coolify: coolify.maxpetrusenko.com
- Domain: social.maxpetrusenko.com
- Simli Face ID: 7bb46589-4be6-4df8-ab80-03443fb75d6f
- Cartesia Voice ID: 7270ea4d-a17a-4f21-a3da-03f2b128669d
