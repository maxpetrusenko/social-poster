# Social Agent — Tasks & Status

Last updated: 2026-07-22 (autonomous weekly blog publication)

Work-to-post production visibility note 2026-08-01: `/dashboard/review` is now visible in the default dashboard navigation as Review, not only in the agentic shell. Production contains four live `eligible` work-to-post candidates for Max's workspace. `Schedule` and `Post now` remain guarded: they require an exact passing `content_reviews` row for the current revision, create only `dispatch_intents` (`simulated_scheduled` / `simulated_published`), and do not create real scheduled `posts`, call X, reply, or DM. Decision success now persists `content_candidates.status` to `scheduled` or `published` so cards move columns after refresh.

Writing-runtime note 2026-07-22: local Social Poster generation now uses one pinned `petergyang/no-ai-slop` contract across RSS/SMM captions, liked-X writer and independent reviewer, X reply drafts, dashboard-agent prose, avatar scripts/captions, and Medium/article validation. Binding precedence is safety/publication, evidence/source ownership, platform constraints, Max-written or approved wording, source-required terminology, workspace preferences, then generic cleanup. Source and workspace text are untrusted data and cannot waive the gates. Article presets no longer request quotable hooks, recap bullets, or a manufactured “Max builder” voice. Focused tests pass locally; these TypeScript changes are not in the production Coolify container until the normal commit/deploy path runs.

Work-to-post learning loop note 2026-07-24: local/dev now has an isolated proof-gated lane for sanitized Codex/Claude completion intake, append-only lifecycle traces, three provenance-backed angle structures, comment-created revisions, scoped reversible learning proposals, cited person dossiers, and a responsive `/dashboard/review` plus `/dashboard/analytics` demo. `Schedule` shows and submits one exact timestamp with timezone; `Post now` is a separate exact approval. Both create simulated intents only, with receipt leases, immutable replay, approval-digest dedupe, and crash-safe retry; no provider, scheduler, reply queue, existing post table, or production dispatch is called. Comments and denials invalidate release, while promoted learning remains explicitly scoped and reversible. Boardy-derived examples are limited to a versioned allowlist of three verified `@boardyai` status IDs. Cursor/Hermes intake, live dispatch, and autonomous learning mutation remain disabled. Node 22 is required for the current `better-sqlite3` ABI. Integrated proof: 50 focused tests, typecheck, zero-warning scoped ESLint, production build, desktop/mobile browser QA, and a final independent SHIP review with no P0/P1 blockers. No deploy or public post occurred.

Weekly blog publication note 2026-07-22: the private manager workflow generates and independently reviews a Hermes article, then POSTs only the exact hash-bound passing artifact to `/api/cron/blog-publish` with `BLOG_PUBLISH_TOKEN`. The endpoint is idempotent by Hermes run ID and publishes at `/blog/<slug>`. This lane follows Max's explicit autonomous-publication policy and does not require per-article approval; failures remain fail-closed and email Max.

Production Gauntlet schedule repair 2026-07-18: `gauntlet-ai-referral-tue-thu` now runs as `image_post`, converts the previously double-escaped `\n` sequences into real paragraph breaks, and assigns `https://social.maxpetrusenko.com/campaigns/referral/story-01.png` to both X and LinkedIn. Backup before mutation: `/data/backups/social-poster-before-gauntlet-format-media-fix-20260718T041222Z.db`. The approved proof run completed as pipeline run `01a51380-3bc6-428c-bac6-e49779a849ff`, post `466c50c6-c723-471c-9884-632a8303353e`, with X `https://x.com/i/status/2078333221801009644` and LinkedIn `https://www.linkedin.com/feed/update/urn:li:share:7484098940771004416/`. `bird read` verified real paragraph breaks and a 1080x1920 photo on X; the LinkedIn publish response returned image URN `urn:li:image:D4E10AQFHO1tjwH2IOw`. The temporary one-time proof cron was restored immediately to `30 18 * * 4` (`Every Thursday at 2:30 PM ET`), and public `/api/health` returned `status: ok`, four enabled/registered schedules, and `drift: 0`.

Daily Gauntlet AI job-seeker reply lane note 2026-07-09: ran the daily reply lane against X plus visible logged-in LinkedIn search surfaces and did not meet the minimum target of 5 qualified targets. X coverage used Bird searches for `\"open to work\" \"AI engineer\"`, `\"looking for\" \"ML engineer\"`, `\"open to work\" \"LLM engineer\"`, `\"forward deployed engineer\"`, `\"looking for my next role\" \"AI Engineer\"`, `#OpenToWork #AIEngineer`, and several USA/remote/referral variants. Visible LinkedIn coverage used content-search queries for `\"open to work\" \"AI Engineer\"`, `\"AI Engineer\" \"Open to Work\" USA`, `\"looking for full-time opportunities\" \"AI Engineer\"`, and `\"Master’s in the USA\" \"AI Engineer\"`. Result: 2 qualified US-based individual X targets, 0 qualified LinkedIn targets, 0 posted replies, 0 queued replies. Qualified X targets were `https://x.com/sangeehariravi/status/2039054130702856318` and `https://x.com/ShaderKyle_/status/1990545037575254199`; `bird about` verified both as `United States`. Rejected/skipped buckets: recruiter/job-board/company hiring posts on X and LinkedIn, non-US individuals verified by `bird about`, stale/ambiguous role-seekers, and LinkedIn recruiter/placement posts targeted at OPT/H1B funnels rather than individual job-seeker posts. LinkedIn status: visible search worked in Chrome, but the returned USA keyword results were recruiter-heavy and did not add any qualified individual candidates. Verification summary: `bird search --json ...`, `bird about --json sangeehariravi`, `bird about --json ShaderKyle_`, and visible Chrome LinkedIn search screenshots on 2026-07-09. Operational blocker: the current Social Poster ready-queue path auto-posts when the cooldown window is open, and no independent Hermes/social review surface was used in this run, so no drafts were promoted to ready/published.

## Current State

Dashboard-first social automation platform. Separate repo from maxpetrusenko.com.
Replaces `social-agent/` subfolder in the website repo and the Cowork scheduled tasks.
Deploys to `smmagent.app` on Contabo/Coolify. The legacy
`social.maxpetrusenko.com` hostname remains attached during the auth transition.

Operational note 2026-05-06: production had all schedules disabled (`dbEnabledCount: 0`, `runtimeRegisteredCount: 0`). After Max approved a limited restart, exactly one production schedule was re-enabled: `post-x-linkedin-11am` (`11 AM post — X + LinkedIn with image`). `/api/health` verified `dbEnabledCount: 1`, `runtimeRegisteredCount: 1`, `runtimeRegisteredScheduleIds: ["post-x-linkedin-11am"]`, `drift: 0`. Backups exist on the VPS at `/var/lib/docker/volumes/ch6cjsgcqn6afd5052etgvwn-data/_data/backups/social-poster-before-schedule-reenable-20260506T161114Z.db` and `/data/backups/social-poster-before-enable-one-schedule-20260506T182456Z.db`. A local manual run of `post-x-linkedin-11am` completed successfully: pipeline run `36b0d970-4f8b-4033-9d7d-6974fc632fda`, post `5a2cd7d2-0a5e-41e2-8a66-5c5e689af632`, X `https://x.com/i/status/2052061686702428645`, LinkedIn `https://www.linkedin.com/feed/update/urn:li:share:7457827383212093440/`. Do not enable additional public post schedules without approval.

RSS post quality note 2026-05-06: scheduled image posts had a broken partial patch (`draftHumanPostContent` imported while `writePostCaption` was still called) and could produce generic `title. summary/title` captions from noisy RSS/reddit metadata. Scheduled posts and manual RSS generation now use the human-perspective writer with summary hygiene, one strict retry, and a deterministic fallback that frames a concrete source signal plus an operator takeaway. The quality gate rejects title regurgitation, duplicated headlines, `submitted by` / `[link] [comments]`, hashtags, emoji, `BREAKING`, and known generic filler. Dashboard candidates and scheduled posts now resolve verified source images by preferring source-page OG images, falling back to verified feed images, and rejecting localhost/private URLs, tiny/tracking/placeholder URLs, reddit external-preview thumbnails, and non-image content types. Remaining risk: the LLM can still be conservative on very thin title-only sources, but the fallback prevents embarrassing metadata/title-regurgitation posts.

Regression note 2026-05-20: mobile OAuth was forcing fresh login/consent in a few paths. Supabase Google login no longer requests offline access or forced consent, Google Business and YouTube use incremental OAuth with `include_granted_scopes=true`, and Instagram professional OAuth no longer sends forced reauthentication params so repeated connection attempts can reuse the Instagram browser session. The Create Post composer now guards media-dimension loading so saved media cannot trigger repeated render/image-load work, malformed legacy platform config is ignored/cleaned instead of blanking `/dashboard/posts/create`, publisher account resolution prefers the connected account ID over legacy platform defaults, and the calendar month uses app-local civil dates instead of UTC-shifted dates.

Operational note 2026-05-21: local Gauntlet referral schedule `baec8c15-4ba3-426a-971e-43a7a6662d71` is enabled weekly (`30 14 * * 4`, Thursday 2:30 PM ET) and targets X via Bird, LinkedIn Personal via native OAuth, and Instagram via native OAuth `max.petrusenko`. Fixed schedules now canonicalize LinkedIn Personal/Company to `linkedin` content keys so personal accounts do not fall back to stale shared media.

Production schedule note 2026-05-21: server DB now has `post-x-linkedin-11am`, `post-x-linkedin-1pm`, and `post-x-linkedin-3pm` enabled and targeted to `legacy-platform-x` plus native LinkedIn Personal account `96946ee9-9941-47f2-9a5e-b0c3ecf50db1`. `/api/health` verified `dbEnabledCount: 3`, `runtimeRegisteredCount: 3`, `runtimeRegisteredScheduleIds: ["post-x-linkedin-11am","post-x-linkedin-1pm","post-x-linkedin-3pm"]`, `drift: 0`. Production backup before the update: `/var/lib/docker/volumes/ch6cjsgcqn6afd5052etgvwn-data/_data/backups/social-poster-before-enable-11-1-3-native-linkedin-20260521T151531Z.db`.

Production schedule note 2026-07-05: Max asked to make the recurring Gauntlet AI referral lane active, then narrowed it to once weekly. Production now has enabled schedule `gauntlet-ai-referral-tue-thu` (`Gauntlet AI referral - weekly`) with cron `30 18 * * 4`, documented as every Thursday at 2:30 PM ET, job type `text_post`, and targets `legacy-platform-x` plus native LinkedIn Personal account `96946ee9-9941-47f2-9a5e-b0c3ecf50db1`. The schedule intentionally uses text/link variants only, because the older local Gauntlet schedule failed on stale X/localhost media. Production backups before the updates: `/data/backups/social-poster-before-gauntlet-tue-thu-20260705T005333Z.db` and `/data/backups/social-poster-before-gauntlet-weekly-20260705T010017Z.db`. After the final container restart, public `/health` returned ok and `/api/health` verified `dbEnabledCount: 4`, `runtimeRegisteredCount: 4`, `runtimeRegisteredScheduleIds: ["post-x-linkedin-11am","post-x-linkedin-1pm","post-x-linkedin-3pm","gauntlet-ai-referral-tue-thu"]`, `drift: 0`.

Schedule visibility investigation note 2026-05-23: Max reported not seeing scheduled posts on X + LinkedIn. Read-only prod DB check showed current schedules `post-x-linkedin-11am`, `post-x-linkedin-1pm`, and `post-x-linkedin-3pm` enabled with targets `["legacy-platform-x","96946ee9-9941-47f2-9a5e-b0c3ecf50db1"]`. Latest successful scheduled targets include X `https://x.com/i/status/2058231579638407527`, `https://x.com/i/status/2058201379865317430`, `https://x.com/i/status/2057899380506513847` and LinkedIn `urn:li:share:7463997277020434432`, `urn:li:share:7463967103562317824`, `urn:li:share:7463665078244950016`. Older failures were Bird cookie failures and stale Zernio LinkedIn `403 one or more accounts do not belong to this user`. Next agent should verify whether the user-facing calendar/feed is hiding successful scheduled posts, whether newer deploy rewired schedule runtime, and whether public social profiles show the expected posts.

Calendar regression note 2026-05-24: publish/main calendar and full calendar now share app-timezone month/day helpers instead of UTC `toISOString()` month keys or process-local month windows. Regression coverage verifies May 2026 includes events at `2026-06-01T03:30:00Z` as May 31 New York time and excludes April 30 New York events that are May 1 UTC. Recurrent Posts current-week grid logic now lives in `src/lib/dashboard/recurrent-week.ts` with app-timezone week-window tests for UTC Monday rollover and late-Sunday local slots. The default Vitest suite now runs every `src/**/*.test.{ts,tsx}` file, including app route wiring tests for calendar/publish pages and dashboard nav route existence. This caught and fixed text-media filtering on `/dashboard/calendar` plus caption cleanup stripping leading currency symbols such as `€`.

Deploy reliability note 2026-05-24: the fast Coolify deploy workflow now writes per-job timing to the GitHub step summary, logs Coolify deploy polling with UTC timestamps, elapsed time, attempt counts, final status, deployment UUID, image tag, rollout duration, and healthcheck duration, marks the deploy job as the GitHub `production` environment, captures the previous Coolify image tag before deploy, creates a pre-deploy SQLite backup on the persistent `/data/backups` volume, runs a public post-deploy canary against `https://social.maxpetrusenko.com/health` and `/api/health`, auto-rolls back to the previous image if that public canary fails, verifies both private and public health after rollback, uploads a 30-day deploy report artifact, uses the pinned `COOLIFY_SSH_KNOWN_HOSTS` GitHub secret, and adds SSH plus curl timeouts so hangs fail with useful context. The shared Coolify SSH deploy/rollback logic lives in `scripts/ci/coolify-image-deploy.sh`, and `npm run test:deploy-workflow` guards the required deploy jobs, rollback path, public canary, SQLite backup, report artifact, pinned-host support, and timeout behavior. GitHub `production` now has a main-only deployment branch policy.

X liked-post autopost note 2026-05-21: `/api/x-likes/autopost` can ingest recent posts liked by the workspace X/Bird account, copy the first image/video when present, create a normal `posts` record plus `post_targets`, publish immediately to X and LinkedIn Personal, and dedupe by `x-like:<tweetId>`. Manual runs use workspace manager auth or `CRON_SECRET`; cron-default/background runs auto-select only workspaces with enabled Bird X plus LinkedIn Personal, or the explicit `X_LIKES_AUTOPUBLISH_WORKSPACE_ID` / `X_LIKES_AUTOPUBLISH_WORKSPACE_IDS` override. Background runs stay off unless both `X_LIKES_AUTOPUBLISH_ENABLED=true` and `X_LIKES_AUTOPUBLISH_MODE=publish` are set. Tunables: `X_LIKES_AUTOPUBLISH_INTERVAL_MINUTES`, `X_LIKES_AUTOPUBLISH_LIMIT`, and `X_LIKES_AUTOPUBLISH_FETCH_COUNT`.

X liked-post posting quality note 2026-05-23, updated 2026-06-29: Max is happy with the X liked-post path after commit `e448f8d` and the FreeLLMAPI repo-bookmark publish. In the liked-post worker, Max liking a post is the publish signal once the worker is enabled; do not treat "eligible" as a holding state. Skip only duplicates, own posts, replies, empty text, hard brand-safety blocks, unavailable verification, or repeated writer/reviewer failure. Long-form X posts are allowed on Max's account, so liked-post autoposts should pass full text through Bird as one post and use `1/2` numbering only for intentional multi-post threads. LinkedIn image publishing works when the post has media; when a liked X post has no attached media but does include an external/GitHub link, the liked-post flow should resolve that link's Open Graph image and snapshot it before publishing. Video/demo likes include the original source X URL in the X main post only when needed for the source video/post embed; quoted videos embed the quoted source post URL rather than the liked quote-take URL. Do not add automatic source replies or source/credit footers by default. Benchmark/video posts should preserve concrete numeric evidence from the original when the numbers make the post useful for bookmarks. Source-owned launches stay source-owned: if OpenAI/Anthropic/Cursor/etc. says "we launched", Max's post attributes the launch to that source and only makes first-hand experience claims when Hermes/research/browser evidence exists. Remove obvious AI-social phrasing from generated takes: contrast/negation/concession pivots, fake triads, generic framework voice, em dash punchlines, and empty words like game-changing/cutting-edge/revolutionary/unlock/redefine. Capability decisions are now sketched in `docs/plans/capability-decision-flow.md`, with V0 schema in `platform_capabilities`. Linear follow-up: `MAX-158`.

X liked-post content-machine note 2026-05-24, updated 2026-06-29: a liked post creates a publishing obligation. Eligible liked posts must queue unless they are duplicate, own/reply/empty, hit hard brand-safety blocks, need source verification that is unavailable, or fail the writer/reviewer loop after retries. Deterministic direct-copy and fallback paths no longer bypass the reviewer. `pipeline_runs.steps` is the evidence trail for future gbrain ingestion: source capture, gbrain-context placeholder, source verification, AI draft, reviewer pass/fail, packet readiness, queue slot, and learning readiness. Matrix/Telegram failure alerts remain for operational publish failures; writer/reviewer failures fail closed instead of queueing fallback copy.

X liked-post reviewer note 2026-06-29: the liked-post path now auto-publishes only after an independent reviewer pass using the embedded X posting skill. Writer failures, reviewer rejections, and runtime errors retry through the writer with the reviewer failure packet; repeated failure skips/logs the liked post instead of queueing deterministic fallback copy.

X liked-post queue note 2026-06-10: liked-post imports now create scheduled `posts` rows instead of publishing immediately. The worker assigns one hourly slot between 8 AM and 8 PM in workspace time, skips already occupied liked-post slots, and rolls overflow into the next day. Final per-platform content is validated before queueing, so empty LinkedIn/X packets fail in `pipeline_runs` instead of creating blank posts. A scheduler sweep publishes due scheduled posts through the normal platform target pipeline.

YouTube-to-Medium queue visibility note 2026-06-30: `/dashboard/articles` now shows a visible playlist processing queue from `data/article-workspace/youtube-medium-playlist-queue.json`. Refresh it with `npm run articles:sync-youtube-queue`; the sync reconciles the live YouTube playlist, local article packages, and public Medium RSS so stale package flags do not hide already-posted articles or review-needed drafts.

## What's Done

### Infrastructure
- [x] Cowork scheduled tasks disabled (all 5: 9am video, 6pm video, 11am/1pm/3pm image)
- [x] Contabo still running old social-agent (needs cutover)
- [x] New repo created: `~/Desktop/Projects/social-poster`

### Project Skeleton
- [x] Next.js 15 + Tailwind 4 + TypeScript
- [x] Drizzle ORM + SQLite runtime (WAL mode, persistent volume)
- [x] Empty Supabase Postgres schema `social_poster` created for app data isolation from Tantra Studio
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
- [x] `campaigns`, `campaign_generation_sessions`, `campaign_creatives`, `campaign_layers`, `campaign_renditions`, `campaign_events` — profile-bound campaign planning, creative review, rendition tracking, and publish audit trail
- [x] `schedules` — cron job definitions (editable from UI)
- [x] `pipeline_runs` — execution history with step-level detail
- [x] `dedup_cache` — content deduplication
- [x] `candidate_cache` — manual candidate snapshot + OG-image cache
- [x] `activity_log`, `notifications`, `notification_deliveries`, `email_events`, `email_suppressions`, `lead_magnet_downloads` — email notification and marketing audit foundation
- [x] Durable post-history architecture and migration plan documented in `docs/plans/post-history-architecture.md` and `docs/plans/post-history-migration-plan.md`

### Auth
- [x] Magic link + workspace invite email flow (Resend-first, SMTP fallback, preview URL fallback)
- [x] Team invite delivery failures now degrade to a visible pending invite + copy link instead of a 500
- [x] Session cookie management (30-day TTL)
- [x] Single allowed email (AUTH_EMAIL env var)
- [x] Supabase sign-in is open to authenticated users; team access still comes from app org/workspace memberships and invites
- [x] Tenant-aware auth allowlist now accepts existing members and pending invite emails
- [x] Login page (src/app/login/page.tsx)
- [x] Explicit auth mode resolution: bypass, Supabase, magic-link, or fail-closed misconfigured
- [x] Production auth now fails closed if bypass is requested or Supabase env is missing

### Dashboard Pages (all under /dashboard)
- [x] Layout with sidebar navigation
- [x] Settings → General now manages org name, timezone, and deletion schedule
- [x] Settings → Workspaces now supports create / open / archive / restore / delete
- [x] Settings → Users now supports modal invite, resend, revoke, Admin/User role changes, and remove
- [x] Workspace Settings → General and Approvals now persist real workspace values
- [x] Connection OAuth info buttons now open in-app setup guides with platform docs, callback URI copy, missing env warnings, and X-specific tutorial/use-case text
- [x] Invite accept page at `/invite/[token]`
- [x] Dashboard home — live metrics for posting cadence, consistency, errors, schedules, and platform health
- [x] Dashboard platform table now dedupes platforms, groups LinkedIn personal/business under one LinkedIn row, and expands into connected accounts with Posts, Comments, DMs, and Views metric subrows per account
- [x] Create Idea replaced by Zernio-style Create Post composer at `/dashboard/posts/create`
- [x] Schedule category presets via `schedules.config` — take/opinion, product update, source share, hype/future, hiring
- [x] Platforms — list, create, edit, delete, per-platform skills/config editor
- [x] Platforms native connection flow starts configured OAuth providers directly and exposes credential setup docs from each method
- [x] Facebook direct OAuth now requests only the minimal Page publishing scopes by default, saves returned Facebook Pages with Page access tokens for native publishing, and documents the exact Meta app Basic settings needed to clear the Facebook Login app-details blocker
- [x] LinkedIn native OAuth now uses app-managed auth connections: users approve LinkedIn access without pasting client IDs or secrets
- [x] Connections filter groups LinkedIn native profile/page rows under LinkedIn, so saved OAuth profiles remain visible beside X native connections
- [x] LinkedIn Page OAuth now requests `rw_organization_admin`, resolves a page with `ORGANIC_SHARE_CREATE` authorization during callback, and stores the organization URN for page publishing
- [x] Native/proxy connections now collapse duplicate same-account rows and enforce one row per workspace, provider, platform, and account ID
- [x] Social accounts settings now warns that Proxy connections are still in progress when the Proxy connections view is selected
- [x] Proxy/Late account disconnects now persist a local disconnect marker so background account sync does not immediately recreate removed cards
- [x] Local OAuth setup guide shows both localhost and 127.0.0.1 redirect URIs for native providers
- [x] OAuth callback generation now honors safe callback overrides and the Google setup guide calls out exact redirect URI matching
- [x] X local OAuth now points at 127.0.0.1 because X requires that host for local redirect URIs
- [x] Pinterest setup guide now spells out the exact env keys needed to activate direct OAuth
- [x] Instagram setup guide now explains the Facebook Login "Feature unavailable" blocker, Advanced Access, Data Use Checkup, Business Verification, and app basic-info requirements
- [x] Regular Instagram direct OAuth now uses Instagram Login + Instagram app credentials instead of the Facebook Login product that was returning Meta's "Feature unavailable" screen
- [x] Instagram connection UI now treats direct Instagram OAuth as professional-account only, disables one-click redirect for Instagram, and routes default personal accounts toward relay/manual handling instead of promising unsupported Meta OAuth
- [x] Duplicate Instagram Personal connection entry removed from the connection catalog; Instagram now has one entry with professional OAuth and relay methods
- [x] Instagram local OAuth redirect setup is documented with exact localhost, 127.0.0.1, ngrok, and production callback URI rules
- [x] Connection catalog now lives in per-platform configs, with method info tooltips and live/planned capability badges in the connection drawer
- [x] X proxy/Bird setup now only asks for `X_AUTH_TOKEN` and `X_CT0`, includes cookie-copy guidance, and exposes a read-only connection test
- [x] X and other platform disconnects now soft-disable rows, clear stored credentials, avoid foreign-key delete failures, and allow explicit reconnects to reactivate hidden rows
- [x] X OAuth now requests only tweet.read, tweet.write, users.read, and offline.access by default so unapproved media/DM scopes do not block the consent screen
- [x] X local OAuth now uses an HTTP 127.0.0.1 callback bridge for HTTPS dev so X receives a loopback callback URI it accepts while Social Poster keeps running on HTTPS
- [x] Profiles — list, create, edit, delete (voice ID, face ID, tone)
- [x] Profiles list and new-profile form now use the shared dashboard hero/card layout and consistent content gutters
- [x] Campaigns — profile-scoped campaign board/editor wired to campaign records, Gemini image generation via workspace Image model keys, platform rendition chips, Draft/Calendar/Publish delivery modes, schedule picker, and direct post creation/publish handoff
- [x] Posts — Zernio-style card grid with media thumbnails, status badges, platform dots, status filter tabs
- [x] Posts nav restructured: Posts parent with collapsible submenu (All Posts, Create Post, Recurrent Posts)
- [x] Create Post composer: two-column layout, platform-specific options (Instagram Feed/Story/Reel/Carousel + collaborators + first comment, Facebook Feed/Story/Reel, X thread toggle, Reddit subreddit), URL/file/drag-drop media upload, RSS/latest-X/URL draft generation with image loading, URL draft evidence persistence into post metadata, X/OG page URL image resolution, clickable recommended image-size chips that drive per-platform preview aspect, platform-specific resize/crop presets with original-image pass/warn/fail validation, shared platform icon badges, shared live platform previews with attached media grids across create/edit/calendar surfaces, Schedule/Now/Queue/Draft publishing modes with timezone
- [x] Post approval request flow: post detail/edit surfaces show latest approval status, and `/api/posts/[id]/approval-request` can fetch/request/approve/request-changes/reject the current approval row with audit logging
- [x] Calendar — monthly grid view with schedule recurrences + actual pipeline runs
- [x] Calendar recurring forecast cards now show source-title/image predictions with a debug panel instead of synthetic generated captions
- [x] Calendar recurring cron slots now resolve in UTC, suppress past forecast shells, and label predictions as candidate-only without implying a draft exists
- [x] Calendar recurring slots now reuse `agent_persona_updates` content generation, so Agent Persona schedule previews match pipeline-specific copy instead of generic feed candidates
- [x] Calendar excludes X reply-engine schedules and runs; X replies stay in Replies only
- [x] Pipeline — run history with expandable step detail
- [x] Schedules — list, create, edit, delete, manual "Run Now", success/error stats
- [x] Schedule detail preview now shows fixed, Agent Persona, or RSS-candidate mode with source visibility and per-platform generated copy
- [x] RSS page now uses a tabbed operator UI: compact editable source table with per-source drilldowns, traction-aware candidate scoring, visible selection pipeline, editable transformation prompt/templates/image rules, and regenerateable X/LinkedIn previews for a chosen candidate
- [x] Fresh workspaces no longer auto-seed RSS feeds/settings, queue drip emails, or claim legacy unscoped records during login; RSS generation requires user-added feeds
- [x] Social Agent chat widget now answers from sanitized workspace context, including connected platforms, reply review/ready queues, recent reply events, post targets, pipeline runs, RSS setup, and current page hints
- [x] Social Agent chat can now remove all RSS sources except a named source, create recurring post schedules from chat, and pass uploaded chat images into recurring image-post schedules
- [x] Social Agent chat now has a one-click post status check and answers whether the latest post published, partially failed, failed, or is still pending
- [x] Social Inbox Comments and DMs are temporarily blocked with styled paused-state warnings while their safer workflows are finished
- [x] X Replies now cancels in-flight reply API work during internal navigation and avoids automatic heavy refill searches so dashboard links respond quickly
- [x] Public brand domains originally redirected `/dashboard`, `/login`, and `/auth/callback` to `social.maxpetrusenko.com`; the current migration serves these routes directly on `smmagent.app`
- [x] Notifications page now reads durable notification rows instead of a placeholder scaffold
- [x] Admin dashboard exists at `/admin` with email-gated overview, users, waitlist, marketing, usage, and waitlist CSV export
- [x] Admin blog automation exists at `/admin/blog` with daily draft generation plumbing, Medium automation handoff, review-only publish gate, article image/source tracking, framework validation, and public blog publishing after admin approval
- [x] Dashboard Article Generation exists at `/dashboard/articles` with Articles, New Article chat, editable generation control menus, and Settings subpages, backed by Medium automation, file-based `article-agent/prompt.md` plus `article-agent/skills/`, persisted `article-agent/generation-settings.json`, and `/api/article/create` + `/api/article/[id]` + `/api/article/settings` agent APIs
- [x] Articles now include a filesystem-backed Knowledge FS at `/dashboard/articles`: imported Medium automation corpus and finished Notion/Medium references under `data/article-workspace/articles/<slug>/vNNN`, artifacts under `artifacts/{images,sources,evals,original}`, Notion Done import via `npm run articles:import:notion-done`, a left-explorer search input that filters visible files/folders in place with persisted folder collapse state, article directory cards with title/subtitle/hero image, movable Kanban toggle with custom columns persisted to `data/article-workspace/kanban-state.json`, read-only Article Skills and GBrain/Wiki tree context for agent learning, a toolbar rich-copy button for pasting articles into Medium, model-backed hero image generation, and Medium-style `overview.md` / `rating.md` / `workflow.json` / `evals/rating-v*.json` rating metadata surfaced as number plus model, pros, and cons.
- [x] Logs page at `/dashboard/logs` shows latest user actions, post/schedule/reply activity, pipeline runs, and LangSmith trace references
- [x] Top-bar support intake now creates Linear tickets with source, topic, explanation, page context, selected-image preview, and optional Linear-hosted image links attached to Linear
- [x] Social Agent can create the same Linear tickets through `/support`, with optional repair-agent webhook routing for `from_bot` issues
- [x] Hermes fleet ticket automation runbook and dry-run-safe Linear poller added for ready-label tickets, draft PR handoff, and Telegram notification
- [x] Recurrent Posts exposed in left navigation for recurring content buckets and slot planning
- [x] Settings — read-only config display

### API Routes
- [x] CRUD for platforms, profiles, posts, schedules
- [x] Campaign CRUD, Gemini-backed creative generation with local/R2 media storage fallback, creative selection, and apply-to-calendar routes for turning profile-bound campaign creatives into posts/targets
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
- [x] Set Supabase env in production and open app-side Supabase sign-in to authenticated users
- [ ] Migrate runtime DB client and production data from SQLite into Supabase `social_poster`
- [ ] Test Instagram/Threads OAuth connection (same Meta app, should work)
- [ ] Test Google/YouTube OAuth connection (needs portal URI check)
- [ ] Test TikTok OAuth connection (needs real domain, no localhost)
- [ ] Test Pinterest OAuth connection (needs portal URI check)

### Agent / Pipeline Engine
- [x] Feed ingest logic ported into `src/lib/pipeline/feed-engine.ts`
- [x] Late/Zernio publish path ported into `src/lib/pipeline/publisher.ts`
- [x] Simli avatar video generation adapter
- [x] Cartesia TTS adapter
- [x] Source evidence persistence store with workspace-scoped upsert/list/mark and dedupe handling
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
- [x] Manual publishes persist per-platform format, caption, preview size, and fit-padded media variants so Instagram Feed does not fall through to Story and preview framing matches the posted asset
- [x] X publish now routes through Bird when the platform provider is `bird`, with dashboard credentials first and env fallback second
- [x] Liked X posts can be imported and immediately published as attributed X + LinkedIn posts, with media copy/snapshot, post-history rows, and dedupe
- [x] Direct OAuth platform tokens now auto-refresh in a background scheduler sweep before expiry, with a manager-only manual refresh endpoint
- [x] Platform-depth presearch docs added for X, LinkedIn, Instagram, Facebook, Threads, TikTok, YouTube, Pinterest, Bluesky, Mastodon, Google Business, Reddit, Discord, Telegram, and the future agent harness
- [ ] Idempotency keys on every publish attempt

### Deploy
- [x] Dockerfile (standalone Next.js + chromium + ffmpeg, BuildKit npm cache mounts)
- [x] docker-compose.yml uses the prebuilt GHCR image with pull-only deploys
- [x] GitHub Actions builds/pushes `ghcr.io/maxpetrusenko/social-poster:main` after local deploy gates
- [x] Coolify fast deploy path documented: pull image, keep rolling healthcheck, avoid normal `force_rebuild`
- [x] Docker context excludes local browser profiles, data, caches, and build outputs
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
- [ ] Roll out the shared support widget and Hermes Linear project mapping to every other Coolify app
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
- [x] Social Inbox Comments/DMs now track unread state, clear notification counts before rendering viewed tabs, keep seen watermarks so older pulled X/native items do not re-count as new, and render newest-first vertical cards with sender avatars
- [x] Comment pull/reply adapters added for X, YouTube, LinkedIn, Instagram, Facebook, Threads, and Mastodon where connected account scopes allow it
- [x] DM pull/reply adapters added for X, Instagram, Facebook, and Mastodon where platform access is approved
- [ ] Add live DM adapters for Bluesky, Reddit modmail, Google Business messages, and WhatsApp where platform access is approved
- [ ] Add left-nav Analytics with cross-platform provider metrics, X/Bird fallback, optional Sweetistics import, and platform drilldowns. Plan: `docs/plans/analytics-dashboard.md`
- [x] Sidebar now shows the current workspace and a switch entry into the workspace control plane
- [ ] Replace mutable post history with revisions + lifecycle events + tombstones
- [ ] Stop hard-deleting published posts and stop recreating target rows destructively on edit
- [ ] Rebuild calendar/history reads so deleted and rolled-back posts remain visible after refresh

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
- fixed schedule and X media publish URLs now fall back to the public app origin when `APP_URL` is unset, so external platforms do not receive localhost asset URLs
- invite and magic-link URLs normalize comma-separated app origin env values and prefer `smmagent.app`
- Supabase Auth + Supabase Postgres migration plan lives at `docs/plans/supabase-postgres-migration-plan.md`
- Social Poster Supabase bootstrap SQL lives at `supabase/social-poster/20260422_social_poster_schema.sql`
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
- Primary domain: smmagent.app
- Landing domains: clawposter.app, www.clawposter.app, smmclaw.app, www.smmclaw.app
- Simli Face ID: 7bb46589-4be6-4df8-ab80-03443fb75d6f
- Cartesia Voice ID: 7270ea4d-a17a-4f21-a3da-03f2b128669d
