# Social Agent — Tasks & Status

Last updated: 2026-04-21 (Create Post media upload, platform icons, and Social Inbox)

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
- [x] `activity_log`, `notifications`, `notification_deliveries`, `email_events`, `email_suppressions`, `lead_magnet_downloads` — email notification and marketing audit foundation

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
- [x] Connection OAuth info buttons now open in-app setup guides with platform docs, callback URI copy, missing env warnings, and X-specific tutorial/use-case text
- [x] Invite accept page at `/invite/[token]`
- [x] Dashboard home — live metrics for posting cadence, consistency, errors, schedules, and platform health
- [x] Create Idea replaced by Zernio-style Create Post composer at `/dashboard/posts/create`
- [x] Schedule category presets via `schedules.config` — take/opinion, product update, source share, hype/future, hiring
- [x] Platforms — list, create, edit, delete, per-platform skills/config editor
- [x] Platforms native connection flow starts configured OAuth providers directly and exposes credential setup docs from each method
- [x] LinkedIn native OAuth now uses app-managed auth connections: users approve LinkedIn access without pasting client IDs or secrets
- [x] Connections filter groups LinkedIn native profile/page rows under LinkedIn, so saved OAuth profiles remain visible beside X native connections
- [x] Native/proxy connections now collapse duplicate same-account rows and enforce one row per workspace, provider, platform, and account ID
- [x] Local OAuth setup guide shows both localhost and 127.0.0.1 redirect URIs for native providers
- [x] Connection catalog now lives in per-platform configs, with method info tooltips and live/planned capability badges in the connection drawer
- [x] X proxy/Bird setup now only asks for `X_AUTH_TOKEN` and `X_CT0`, includes cookie-copy guidance, and exposes a read-only connection test
- [x] Profiles — list, create, edit, delete (voice ID, face ID, tone)
- [x] Posts — Zernio-style card grid with media thumbnails, status badges, platform dots, status filter tabs
- [x] Posts nav restructured: Posts parent with collapsible submenu (All Posts, Create Post, Recurrent Posts)
- [x] Create Post composer: two-column layout, platform-specific options (Instagram Feed/Story/Reel/Carousel + collaborators + first comment, Facebook Feed/Story/Reel, X thread toggle, Reddit subreddit), URL/file/drag-drop media upload, X/OG page URL image resolution, image dimension hints per platform, shared platform icon badges, shared live platform previews with attached media grids across create/edit/calendar surfaces, Schedule/Now/Queue/Draft publishing modes with timezone
- [x] Calendar — monthly grid view with schedule recurrences + actual pipeline runs
- [x] Calendar recurring forecast cards now show source-title/image predictions with a debug panel instead of synthetic generated captions
- [x] Calendar recurring cron slots now resolve in UTC, suppress past forecast shells, and label predictions as candidate-only without implying a draft exists
- [x] Calendar recurring slots now reuse `agent_persona_updates` content generation, so Agent Persona schedule previews match pipeline-specific copy instead of generic feed candidates
- [x] Calendar excludes X reply-engine schedules and runs; X replies stay in Replies only
- [x] Pipeline — run history with expandable step detail
- [x] Schedules — list, create, edit, delete, manual "Run Now", success/error stats
- [x] Schedule detail preview now shows fixed, Agent Persona, or RSS-candidate mode with source visibility and per-platform generated copy
- [x] RSS page now uses a tabbed operator UI: compact editable source table with per-source drilldowns, traction-aware candidate scoring, visible selection pipeline, editable transformation prompt/templates/image rules, and regenerateable X/LinkedIn previews for a chosen candidate
- [x] Social Agent chat widget now answers from sanitized workspace context, including connected platforms, reply review/ready queues, recent reply events, post targets, pipeline runs, RSS setup, and current page hints
- [x] Notifications page now reads durable notification rows instead of a placeholder scaffold
- [x] Admin dashboard exists at `/admin` with email-gated overview, users, waitlist, marketing, usage, and waitlist CSV export
- [x] Logs page at `/dashboard/logs` shows latest user actions, post/schedule/reply activity, pipeline runs, and LangSmith trace references
- [x] Top-bar support intake now creates Linear tickets with source, topic, explanation, page context, selected-image preview, and optional Linear-hosted image links attached to Linear
- [x] Social Agent can create the same Linear tickets through `/support`, with optional repair-agent webhook routing for `from_bot` issues
- [x] Recurrent Posts exposed in left navigation for recurring content buckets and slot planning
- [x] Settings — read-only config display

### API Routes
- [x] CRUD for platforms, profiles, posts, schedules
- [x] Media upload route for composer file picker/drag-drop using R2/S3 storage when configured
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
- [x] Server-side org/workspace role gates for team settings and high-risk mutating APIs
- [x] Social Agent can invite current-workspace members inline via an admin-only `/invite` command
- [x] OpenAI LLM calls are wrapped with LangSmith tracing into the `clawPoster` project when LangSmith env is available
- [x] Facebook native OAuth connection working (dev:https + per-platform callback rules)
- [x] LinkedIn native OAuth connection working
- [x] Refactor OAuth callback to brightbean pattern — request-derived URLs, HMAC-signed state, shared /api/auth/callback route
- [x] Local HTTPS dev server (mkcert + `npm run dev:https`)
- [x] OAuth portal automation script (Brave cookie extraction + rebrowser-playwright stealth)
- [ ] Set Supabase env in production and verify live Google sign-in against allowlist
- [ ] Test Instagram/Threads OAuth connection (same Meta app, should work)
- [ ] Test Google/YouTube OAuth connection (needs portal URI check)
- [ ] Test TikTok OAuth connection (needs real domain, no localhost)
- [ ] Test Pinterest OAuth connection (needs portal URI check)

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
- [x] Reply discovery defaults to English-only candidates, exposes a language selector, and skips low-engagement tweets below 3 replies and 10 likes
- [x] Reply refresh now reuses env X auth for saved Bird sessions, runs a wider manual fallback scan, and shows empty-state diagnostics
- [x] Boot recovery marks interrupted `running` pipeline rows failed after app restarts
- [x] Schedule runtime now reconciles by diff instead of full reload
- [x] `/api/health` and dashboard expose DB-enabled vs runtime-registered schedule counts
- [x] Manual and scheduled publishing now share one normalized publish service
- [x] Screenshot fallback images upload to Cloudflare R2 when configured, with local `/api/screenshots` as fallback
- [x] Mixed manual post delivery can resolve to `partial_failure`
- [x] Cron schedule execution now uses a SQLite-backed minute lock to suppress duplicate scheduler fires across processes
- [x] X publish now routes through Bird when the platform provider is `bird`, with dashboard credentials first and env fallback second
- [x] Direct OAuth platform tokens now auto-refresh in a background scheduler sweep before expiry, with a manager-only manual refresh endpoint
- [x] Platform-depth presearch docs added for X, LinkedIn, Instagram, Facebook, Threads, TikTok, YouTube, Pinterest, Bluesky, Mastodon, Google Business, Reddit, Discord, Telegram, and the future agent harness
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
- [x] Social Inbox now has `X Replies`, Comments, and DMs subheader tabs; `/dashboard/replies` redirects into Social Inbox X Replies
- [x] Comments and DMs have shared platform inbox tables, pull action, and reply action plumbing backed by `inbox_conversations` / `inbox_messages`
- [x] X Replies remains outbound outreach; X / Twitter inbound mentions now pull into Comments through Bird-backed access or X API mentions/search
- [x] Social Inbox Comments/DMs now track unread state, clear notification counts when viewed, and render newest-first vertical cards with sender avatars
- [x] Comment pull/reply adapters added for X, YouTube, LinkedIn, Instagram, Facebook, Threads, and Mastodon where connected account scopes allow it
- [x] DM pull/reply adapters added for X, Instagram, Facebook, and Mastodon where platform access is approved
- [ ] Add live DM adapters for Bluesky, Reddit modmail, Google Business messages, and WhatsApp where platform access is approved
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
- Direct OAuth access tokens are refreshed by the scheduler every `TOKEN_REFRESH_SWEEP_HOURS` hours (default 6) when within `TOKEN_REFRESH_WINDOW_DAYS` days of expiry (default 7). Manual refresh: `POST /api/platforms/refresh-tokens` with optional `{ "force": true }`.
- Bird-backed X connections store read-only session health in `platforms.config.birdSession`; the scheduler checks enabled Bird sessions every `BIRD_SESSION_CHECK_HOURS` hours (default 24), and connection cards expose a manual "Check Bird session" action.

## Environment
- Contabo VPS: 173.249.52.27
- Coolify: coolify.maxpetrusenko.com
- Primary domain: social.maxpetrusenko.com
- Landing domains: clawposter.app, www.clawposter.app, smmclaw.app, www.smmclaw.app
- Simli Face ID: 7bb46589-4be6-4df8-ab80-03443fb75d6f
- Cartesia Voice ID: 7270ea4d-a17a-4f21-a3da-03f2b128669d
