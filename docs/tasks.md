# Social Agent — Tasks & Status

Last updated: 2026-04-14

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
- [x] `users`, `organizations`, `workspaces`, `org_memberships`, `workspace_memberships`, `workspace_invitations`
- [x] `platforms` — connected social accounts (X, LinkedIn, TikTok, IG, etc.)
- [x] `profiles` — brand identity / voice / face settings
- [x] `posts` — content items with status lifecycle
- [x] `post_targets` — many-to-many post→platform with per-platform status
- [x] `schedules` — cron job definitions (editable from UI)
- [x] `pipeline_runs` — execution history with step-level detail
- [x] `dedup_cache` — content deduplication
- [x] `candidate_cache` — manual candidate snapshot + OG-image cache

### Auth
- [x] Magic link + workspace invite email flow (Resend-first, SMTP fallback, preview URL fallback)
- [x] Team invite delivery failures now degrade to a visible pending invite + copy link instead of a 500
- [x] Session cookie management (30-day TTL)
- [x] Single allowed email (AUTH_EMAIL env var)
- [x] Google sign-in gate via Supabase (env-gated, allowlist-based)
- [x] Tenant-aware auth allowlist now accepts existing members and pending invite emails
- [x] Login page (src/app/login/page.tsx)
- [x] Explicit auth mode resolution: bypass, Supabase, magic-link, or fail-closed misconfigured
- [x] Production auth now fails closed if bypass is requested or Supabase env is missing

### Dashboard Pages (all under /dashboard)
- [x] Layout with sidebar navigation
- [x] Settings → General now manages org name, timezone, and deletion schedule
- [x] Settings → Workspaces now supports create / open / archive / restore / delete
- [x] Settings → Team Members now supports invite / resend / revoke / org role / workspace access / remove
- [x] Workspace Settings → General and Approvals now persist real workspace values
- [x] Invite accept page at `/invite/[token]`
- [x] Dashboard home — live metrics for posting cadence, consistency, errors, schedules, and platform health
- [x] Create Idea now routes through a canonical composer with idea/template/feed entry lanes and real draft/schedule/publish-now actions
- [x] Schedule category presets via `schedules.config` — take/opinion, product update, source share, hype/future, hiring
- [x] Platforms — list, create, edit, delete, per-platform skills/config editor
- [x] Profiles — list, create, edit, delete (voice ID, face ID, tone)
- [x] Posts — list with status filters, create with platform targeting, detail view
- [x] Calendar — monthly grid view with schedule recurrences + actual pipeline runs
- [x] Calendar recurring forecast cards now show source-title/image predictions with a debug panel instead of synthetic generated captions
- [x] Pipeline — run history with expandable step detail
- [x] Schedules — list, create, edit, delete, manual "Run Now", success/error stats
- [x] Recurrent Posts exposed in left navigation for recurring content buckets and slot planning
- [x] Settings — read-only config display

### API Routes
- [x] CRUD for platforms, profiles, posts, schedules
- [x] Platform/profile create/update/delete now respect active workspace
- [x] Manual schedule run endpoint
- [x] Post deletion cascades to targets
- [x] Post create/update routes now accept explicit composer intent for draft vs schedule
- [x] Posts, schedules, pipeline runs, replies, calendar, and profiles now read/write against the active workspace

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
- [ ] Set Supabase env in production and verify live Google sign-in against allowlist

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
- [x] Reply engine duplicate guard skips already-attempted drafts before calling X again
- [x] Boot recovery marks interrupted `running` pipeline rows failed after app restarts
- [x] Schedule runtime now reconciles by diff instead of full reload
- [x] `/api/health` and dashboard expose DB-enabled vs runtime-registered schedule counts
- [x] Manual and scheduled publishing now share one normalized publish service
- [x] Mixed manual post delivery can resolve to `partial_failure`
- [x] X publish now routes through Bird when the platform provider is `bird`, with dashboard credentials first and env fallback second
- [ ] Idempotency keys on every publish attempt

### Deploy
- [x] Dockerfile (standalone Next.js + chromium + ffmpeg)
- [x] docker-compose.yml for local dev
- [x] VPS deploy live behind Traefik at `social.maxpetrusenko.com`
- [x] Coolify project cleanup (`Root Team -> social-poster -> production -> social-poster`)
- [x] Runtime SQLite path aligned to Coolify volume mount (`/data/social-poster.db`)
- [x] Container startup handles Coolify rollout ports while keeping app healthchecks on `3000`
- [x] Env vars migrated for Cartesia, Simli, Late/Zernio
- [x] Update SIMLI_FACE_ID on Contabo → `7bb46589-4be6-4df8-ab80-03443fb75d6f`
- [x] Update CARTESIA_VOICE_ID → `7270ea4d-a17a-4f21-a3da-03f2b128669d`
- [x] Root deployment doc: `DEPLOYMENT.md`

### Polish
- [x] npm install + build verification
- [x] Fix TypeScript / import errors blocking build
- [x] Seed script for initial platforms + profile + schedules
- [x] Git init + first commit + push to GitHub
- [x] Dashboard visual language aligned to `maxpetrusenko.com/socialmedia`
- [ ] Public social feed endpoint (GET /api/feed — for website consumption)
- [ ] Real-time status updates (polling or SSE on pipeline page)
- [ ] Toast notifications for form actions
- [ ] Mobile-responsive sidebar (hamburger on small screens)
- [x] Missing `/dashboard/posts/[id]/edit` route now folds into the canonical composer
- [x] Manual candidate caching in SQLite with stale-while-refresh reads
- [x] Fixed schedules can now resolve per-platform media assets
- [x] Fixed schedules can pin variant rotation to calendar weeks so retries/manual runs do not shift the campaign loop
- [x] Referral story assets generated into `public/campaigns/referral/` for deploy-stable URLs
- [x] Sharability scoring helper added via `HOOKS` framework (`src/lib/post-framework.ts`)
- [x] Replies board can discover live X candidates through Bird, persist them to `reply_candidates`, and dispatch approved drafts from the dashboard
- [x] Replies board and cron reply engine now generate drafts through an OpenAI-backed reply model, filtered to original posts only
- [x] Reply generation now routes across `product`, `dev`, and `github` directions with lane-specific prompts and discovery queries
- [x] Replies board now supports Agent Persona-only reply profiles so discovery and drafts can target product, build, or OSS goals explicitly
- [x] Ready replies now run through an automatic queue dispatcher with visible queued-for timestamps and a higher-throughput cadence for operator queues
- [x] Empty review queues now auto-refill slowly with a small 3-post batch, manual refresh expands to 5 posts, and thread-style posts pull same-author thread context before draft generation
- [x] Sidebar now shows the current workspace and a switch entry into the workspace control plane

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

## Remaining Parity Gaps

- [ ] Placeholder client portal / approvals-adjacent surfaces still need real product parity beyond the workspace control plane
- [ ] Cross-workspace aggregate reporting views are not implemented yet

## Ops Notes
- `/health` returns JSON health status for Coolify / load balancer probes
- `/api/health` returns app + active scheduler state
- `/api/health.schedules` now includes both `dbEnabledCount` and `runtimeRegisteredCount`
- fixed schedule asset URLs now fall back to `COOLIFY_URL` when `APP_URL` is unset
- Bird-backed X image posts should use raster assets (`.png`, `.jpg`, `.webp`) instead of SVG
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
