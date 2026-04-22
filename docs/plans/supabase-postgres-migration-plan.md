# Supabase Postgres Migration Plan

Last updated: 2026-04-22

## Purpose

Move `social-poster` from local/Coolify SQLite to Max's self-hosted Supabase on Contabo:

- Supabase Auth owns login, sessions, Google OAuth, email/password, and optional magic links.
- Supabase Postgres stores all app data now stored in SQLite.
- Drizzle stays the ORM and migration layer.
- App-level org/workspace invites stay in `social-poster`, not Supabase Auth invite links, so team access maps cleanly to organization and workspace roles.

This is a production data migration. Do not combine it with unrelated UI, publishing, scheduler, or provider changes.

## Current State

Runtime:

- App: `social-poster` on Coolify, public app URL `https://social.maxpetrusenko.com`.
- Current DB: SQLite via `better-sqlite3`.
- Current Drizzle config: `dialect: "sqlite"` in `/Users/maxpetrusenko/Desktop/Projects/social-poster/drizzle.config.ts`.
- Current schema: `sqliteTable` definitions in `/Users/maxpetrusenko/Desktop/Projects/social-poster/src/db/schema.ts`.
- Current DB bootstrap: raw SQLite DDL, PRAGMA, and drift repair in `/Users/maxpetrusenko/Desktop/Projects/social-poster/src/db/index.ts`.

Supabase:

- Self-hosted Supabase runs on Contabo, separate from Supabase Cloud.
- The Supabase instance is shared with Tantra Studio. Current app-owned table inventory from a catalog check on 2026-04-22:
  - `public` contains Tantra-owned tables, including `public.tantra_state`.
  - `social_poster` now contains Social Poster app tables only.
  - Supabase-managed schemas include `auth`, `storage`, `realtime`, `_realtime`, `vault`, `net`, `graphql`, `graphql_public`, and `supabase_functions`.
- Public API base: `https://supabase.maxpetrusenko.com`.
- Host docs: `/Users/maxpetrusenko/Desktop/Projects/manager/docs/contabo-vmi3203669-coolify.md`.
- Host config/secrets file: `/opt/supabase/.env`; never print or copy values into repo docs, chat, logs, or commits.

Social Poster DB bootstrap applied:

- Applied on 2026-04-22 to schema `social_poster`.
- Applied SQL is tracked at `/Users/maxpetrusenko/Desktop/Projects/social-poster/supabase/social-poster/20260422_social_poster_schema.sql`.
- Created 50 app tables from the current SQLite schema inventory plus foreign keys and indexes.
- Verified after apply: `social_poster` has 50 base tables; `public` still contains Tantra-owned tables.
- This creates empty tables only. Runtime still reads/writes SQLite until the app DB client and data migration are switched.

Auth:

- Production auth mode is designed to require Supabase env values and `DISABLE_AUTH=false`.
- Local `.env` currently has no `NEXT_PUBLIC_SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Login page already supports Supabase Google OAuth.
- The app currently mirrors auth state into app tenancy through local `users`, `org_memberships`, and `workspace_memberships`.

## Target State

Database:

- App tables live in Supabase Postgres under an app-owned schema, recommended: `social_poster`.
- Drizzle uses `drizzle-orm/postgres-js` plus the `postgres` package.
- `DATABASE_URL` is server-only and points at the self-hosted Supabase Postgres or Supavisor pooler endpoint.
- No app data remains dependent on SQLite at runtime.
- SQLite stays only as a migration input/backfill artifact until cutover is verified.

Auth:

- Supabase `auth.users` is the identity source.
- Supabase sign-in is open to all authenticated users unless `SUPABASE_AUTH_ALLOW_ALL_USERS=false`.
- `social_poster.users` remains the app profile table.
- Preserve existing app `users.id` values during migration to avoid re-keying all app foreign keys.
- Add or enforce `users.provider_user_id` as the Supabase Auth user id mapping for new Supabase-authenticated users.
- New users created through Supabase Auth get an app user row on first app session.

Tenancy:

- Invite accepted by a brand-new user creates or links the app user directly into the invited org/workspace.
- No personal default org is created before invite acceptance.
- Non-invited self-signup, if allowed by domain or explicit allowlist, creates a new org and primary workspace.
- Org team data is shared inside the invited workspaces:
  - profiles
  - posts
  - platforms
  - schedules
  - campaigns
  - inbox/replies
  - settings
- Separate setup means a separate organization/workspace, not a separate Supabase project.

## Non-Goals

- Do not rewrite the app to use Supabase client-side table reads.
- Do not expose app tables to browser clients through PostgREST for this migration.
- Do not replace app-level workspace invitations with Supabase Auth invites yet.
- Do not enable destructive SQLite cleanup in the same deploy.
- Do not introduce RLS policies as a hard dependency for the first cutover. The app server remains the authorization boundary for UI/API reads and writes.
- Do not create Social Poster tables in `public`.
- Do not alter, migrate, rename, truncate, or drop Tantra-owned `public.*` tables.

## Shared Supabase Safety

This Supabase project is shared with Tantra Studio, so Social Poster must be isolated by schema and role.

Hard rules:

- Social Poster owns only the `social_poster` schema.
- Tantra Studio owns app tables in `public`, including `public.tantra_state`.
- Supabase owns `auth`, `storage`, `realtime`, `_realtime`, `vault`, `net`, `graphql`, `graphql_public`, and `supabase_functions`.
- Migrations must be additive inside `social_poster` unless a separate rollback-reviewed migration explicitly says otherwise.
- Migration scripts must qualify table names through Drizzle `pgSchema("social_poster")` or explicit `social_poster.<table>` SQL.
- No script may rely on an unqualified `public` search path.
- Any production migration run must start with a read-only inventory check and a database snapshot.

Required production preflight:

```sql
select n.nspname, count(c.oid)
from pg_namespace n
left join pg_class c
  on c.relnamespace = n.oid
 and c.relkind in ('r', 'p')
where n.nspname not like 'pg_%'
  and n.nspname <> 'information_schema'
group by n.nspname
order by n.nspname;
```

Expected before first Social Poster data migration:

- `public` contains Tantra-owned tables and must be left untouched.
- `social_poster` contains Social Poster tables only.
- Supabase-managed schemas are present and must be left alone.

## Architecture Decisions

### Use Drizzle Against Supabase Postgres

Keep the app's server-side data access model:

- Server components, server actions, and API routes use Drizzle.
- Browser uses app routes and server actions, not direct Supabase table clients.
- Supabase Auth client is browser-visible only for auth.
- Postgres service credentials remain server-only.

### Use A Dedicated Postgres Schema

Use `social_poster` instead of `public` for app tables.

Reasons:

- Keep Social Poster isolated from Tantra Studio, which owns app tables in `public`.
- Avoid conflicts with Supabase-managed `auth`, `storage`, and public API defaults.
- Reduce accidental PostgREST exposure.
- Make ownership and backups clear.

Migration implication:

- Drizzle schema should use `pgSchema("social_poster")`.
- Migrations must create the schema before tables.
- The app `DATABASE_URL` should set the search path to `social_poster` or the DB client should set it on connect; generated SQL should still schema-qualify app tables.

### Keep App Workspace Invites

Supabase Auth invitations are user-auth invitations, not workspace authorization records. The product needs workspace-scoped invites with org role and workspace role assignments.

Keep:

- `workspace_invitations`
- `/invite/[token]`
- app-generated invite URLs
- app invite emails

Use Supabase Auth for the login step only.

### Preserve App User IDs

Do not re-key every table to `auth.users.id` during the first migration.

Use:

- `users.id`: existing app user id, primary key for app FKs.
- `users.provider_user_id`: Supabase Auth user id.
- `users.auth_provider`: `supabase`, `google`, `email`, or legacy value as needed.

Later, a cleanup migration can decide whether to re-key. First cutover should minimize blast radius.

## Schema Translation Plan

Translate `/src/db/schema.ts` from SQLite to Postgres.

Core changes:

| SQLite pattern | Postgres target |
| --- | --- |
| `sqliteTable` | `pgSchema("social_poster").table` or `pgTable` |
| `integer(..., { mode: "timestamp" })` | `timestamp({ withTimezone: true })` |
| `integer(..., { mode: "boolean" })` | `boolean` |
| JSON stored in `text(..., { mode: "json" })` | `jsonb` |
| raw SQLite partial index SQL | Drizzle Postgres partial indexes with `sql` |
| SQLite PRAGMA health | Postgres connectivity and table count health |

Tables to migrate:

- Identity and tenancy: `users`, `organizations`, `workspaces`, `org_memberships`, `workspace_memberships`, `workspace_invitations`, `audit_events`
- Legacy auth tables: `sessions`, `magic_links`
- Social accounts and profiles: `platforms`, `profiles`
- Campaigns: `campaigns`, `campaign_generation_sessions`, `campaign_creatives`, `campaign_layers`, `campaign_renditions`, `campaign_events`
- Publishing: `posts`, `approval_requests`, `post_targets`, `schedules`, `pipeline_runs`
- Sources and RSS: `source_feeds`, `source_evidence`, `dedup_cache`, `candidate_cache`, `rss_sources`, `rss_settings`
- Replies and inbox: `reply_events`, `reply_candidates`, `inbox_conversations`, `inbox_messages`, `inbox_seen_watermarks`
- Admin, settings, and usage: `waitlist_signups`, `api_keys`, `model_provider_credentials`, `model_catalog`, `workspace_model_defaults`, `notification_preferences`, `user_ui_preferences`, `activity_log`, `notifications`, `notification_deliveries`, `email_events`, `email_suppressions`, `lead_magnet_downloads`, `blog_automation_posts`, `blog_automation_runs`, `drip_queue`, `usage_events`

Indexes to preserve:

- unique email and slug indexes
- membership uniqueness
- workspace-scoped RSS/source uniqueness
- platform identity uniqueness
- inbox external id uniqueness
- notification delivery and activity log lookup indexes
- campaign and approval request indexes

## Code Migration Workstreams

### Workstream A: Postgres Driver And Schema

Files:

- `/Users/maxpetrusenko/Desktop/Projects/social-poster/package.json`
- `/Users/maxpetrusenko/Desktop/Projects/social-poster/drizzle.config.ts`
- `/Users/maxpetrusenko/Desktop/Projects/social-poster/src/db/schema.ts`
- `/Users/maxpetrusenko/Desktop/Projects/social-poster/src/db/index.ts`

Tasks:

- Add `postgres`.
- Add Drizzle Postgres client.
- Convert schema to `pg-core`.
- Replace SQLite boot DDL with migration-only startup.
- Remove production runtime schema mutation.
- Add a DB health helper that checks:
  - connection
  - current schema
  - core table presence
  - migration table state

Acceptance:

- `npm run db:generate` creates Postgres migrations.
- Empty Supabase Postgres database migrates cleanly.
- App boots without SQLite imports in runtime DB code.

### Workstream B: Auth Session And User Mirror

Files:

- `/Users/maxpetrusenko/Desktop/Projects/social-poster/src/lib/auth.ts`
- `/Users/maxpetrusenko/Desktop/Projects/social-poster/src/lib/auth-config.ts`
- `/Users/maxpetrusenko/Desktop/Projects/social-poster/src/lib/auth-allowlist.ts`
- `/Users/maxpetrusenko/Desktop/Projects/social-poster/src/lib/tenancy.ts`
- `/Users/maxpetrusenko/Desktop/Projects/social-poster/src/app/auth/callback/route.ts`

Tasks:

- Require Supabase mode in production.
- Keep local bypass only for explicit local development.
- Map Supabase session user to app user by:
  1. `provider_user_id`
  2. email fallback during migration
  3. pending invite email fallback
- On first successful Supabase session:
  - create app user row if missing
  - populate `provider_user_id`
  - set `auth_provider`
  - do not auto-create an org until invite/self-signup logic chooses it
- Keep local `sessions` and `magic_links` only for dev fallback or remove them after Supabase auth is stable.

Acceptance:

- Google login reaches dashboard for allowed user.
- Email/password login reaches dashboard for allowed user.
- Blocked user is signed out and shown unauthorized state.
- Existing migrated user maps to the same app user row by email, then stores `provider_user_id`.

### Workstream C: Invite Flow

Files:

- `/Users/maxpetrusenko/Desktop/Projects/social-poster/src/lib/tenancy.ts`
- `/Users/maxpetrusenko/Desktop/Projects/social-poster/src/app/invite/[token]/page.tsx`
- `/Users/maxpetrusenko/Desktop/Projects/social-poster/src/app/dashboard/settings/actions.ts`
- `/Users/maxpetrusenko/Desktop/Projects/social-poster/src/lib/mail.ts`

Tasks:

- Split tenant bootstrap into explicit flows:
  - `ensureAppUserForSession`
  - `ensureTenantForSelfSignup`
  - `acceptInvitationByToken`
- Make `/invite/[token]` safe for signed-out users:
  - inspect pending invite by token
  - route to Supabase login with `next=/invite/<token>`
  - after auth callback, return to invite page
- When accepting invite:
  - require matching email
  - create app user row if needed
  - attach to invited org
  - attach to assigned workspaces
  - set active workspace
  - mark invite accepted
- Prevent personal default org creation before invite acceptance.
- Decide whether app invite email sends a Supabase auth link or the app invite link. Default: app invite link.

Acceptance:

- New Gmail user accepts invite and lands in invited workspace only.
- Existing user accepts second workspace invite and can switch workspaces.
- Wrong email sees a clear "belongs to different email" error.
- Expired invite redirects or displays invalid state.

### Workstream D: Data Migration

Inputs:

- current SQLite DB in Coolify volume
- local SQLite dev DB
- generated Postgres migrations

Tasks:

- Freeze writes during production cutover.
- Snapshot SQLite DB before migration.
- Apply migrations to Supabase Postgres.
- Export SQLite rows table-by-table.
- Transform:
  - integer timestamps to timestamptz
  - integer booleans to boolean
  - JSON text to jsonb
  - empty strings/nulls according to target constraints
- Load in dependency order:
  1. users
  2. organizations
  3. workspaces
  4. memberships and invitations
  5. profiles and platforms
  6. posts, targets, schedules, runs
  7. campaigns and creatives
  8. replies, inbox, sources, RSS
  9. admin, notifications, email, usage
- Reconcile Supabase Auth users:
  - match by normalized email
  - fill `provider_user_id` for existing auth users
  - leave null for users who have not logged in through Supabase yet
- Run row-count checks.
- Run referential integrity checks.

Acceptance:

- Source and target row counts match for every migrated table, except intentionally skipped dev-only auth/session tables.
- No orphaned membership, workspace, post target, schedule, campaign, reply, inbox, or notification rows.
- Migrated Max account sees same org, workspaces, posts, profiles, schedules, platforms, campaigns, and inbox.

### Workstream E: Scripts And Tests

SQLite-specific scripts:

- `/Users/maxpetrusenko/Desktop/Projects/social-poster/scripts/import-legacy.mjs`
- `/Users/maxpetrusenko/Desktop/Projects/social-poster/scripts/backfill-pipeline-status.mjs`
- `/Users/maxpetrusenko/Desktop/Projects/social-poster/scripts/fix-orphan-data.mjs`
- `/Users/maxpetrusenko/Desktop/Projects/social-poster/src/db/platform-dedupe.ts`

Tasks:

- Convert scripts to use shared Drizzle Postgres helpers, or archive as SQLite-only migration tools.
- Move SQLite-only import logic under a clear `legacy` or `migration` path.
- Replace in-memory SQLite test fixtures with one of:
  - Postgres test database/schema
  - mocked repository layer
  - Drizzle-compatible per-test transaction rollback

Acceptance:

- Tests do not depend on production SQLite runtime.
- Migration scripts are runnable and documented.
- SQLite-only scripts cannot accidentally run against production Postgres.

### Workstream F: Production Env And Networking

Needed env:

- `DISABLE_AUTH=false`
- `NEXT_PUBLIC_SUPABASE_URL=https://supabase.maxpetrusenko.com`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_AUTH_ALLOW_ALL_USERS=true`
- `DATABASE_URL`
- optional server-only service role key only if an admin/server API explicitly needs Supabase Auth admin operations

Networking decision:

- Prefer a private/local Postgres route from the Coolify app container to Supabase Postgres or Supavisor.
- Verify whether Coolify app can reach:
  - Supavisor pooler from a shared Docker network
  - a host-bound pooler port
  - a dedicated internal service alias
- Do not expose raw Postgres publicly just for this app.

Supabase Auth config for Social Poster:

- `SITE_URL`: `https://social.maxpetrusenko.com`
- additional redirects:
  - `https://social.maxpetrusenko.com`
  - `https://social.maxpetrusenko.com/**`
  - `http://localhost:3000`
  - `http://localhost:3000/**`
  - `https://127.0.0.1:3000`
  - `https://127.0.0.1:3000/**`
- Google OAuth client redirect URI:
  - `https://supabase.maxpetrusenko.com/auth/v1/callback`

Acceptance:

- App container can connect to Supabase Postgres without public DB exposure.
- Supabase `/auth/v1/settings` shows Google and email auth enabled.
- Login callback returns to `social.maxpetrusenko.com`.

## Rollout Sequence

### Phase 0: Prep

- Write this plan.
- Update manager docs.
- Verify current Supabase containers.
- Confirm this remains a shared Supabase project with Tantra Studio and keep `public.tantra_state` untouched.
- Run the shared-project inventory query and paste only schema/table names or counts into the deployment log, never secrets.
- Confirm social-poster Supabase project/env names in Doppler or Coolify.
- Decide private DB route.
- Create a production DB snapshot command.

### Phase 1: Postgres Schema Branch

- Convert Drizzle schema.
- Add migration files.
- Convert DB client.
- Keep app behavior unchanged where possible.
- Run tests locally.

### Phase 2: Staging Database

- Apply migrations to a staging schema or database.
- Run seed/import against local SQLite backup.
- Verify row counts and app boot.
- Run invite and login smoke tests.

### Phase 3: Auth/Invite Cleanup

- Fix bootstrap so invite acceptance does not create personal org first.
- Verify Google login.
- Verify email/password login.
- Verify new invited user.
- Verify self-signup if allowed.

### Phase 4: Production Cutover

- Put app in write freeze or short maintenance window.
- Snapshot SQLite.
- Apply Postgres migrations.
- Run data migration.
- Switch Coolify env to Postgres `DATABASE_URL`.
- Set Supabase Auth env.
- Deploy.
- Verify health, dashboard, auth, invite, and a read-only data tour.

### Phase 5: Post-Cutover

- Monitor auth failures.
- Monitor DB errors.
- Monitor scheduler.
- Keep SQLite backup.
- Only remove SQLite runtime dependencies after a stable window.

## Verification Commands

Local/static:

```sh
npm run lint
npm run typecheck
npm run test
npm run build
```

Drizzle:

```sh
npm run db:generate
npm run db:migrate
```

Targeted tests to keep green or replace with Postgres-aware versions:

```sh
npm run test -- src/lib/__tests__/auth-config.test.ts
npm run test -- src/lib/__tests__/mail.test.ts
npm run test -- src/lib/__tests__/approval-requests.test.ts
npm run test -- src/lib/__tests__/source-evidence-repository.test.ts
```

Manual browser smoke:

- unauthenticated `/dashboard` redirects to `/login`
- Google login succeeds
- email/password login succeeds
- unauthorized user fails closed
- admin sends invite
- new user accepts invite
- wrong email cannot accept invite
- invited user sees assigned workspace data
- non-invited allowed user gets own org/workspace
- workspace switcher works
- profiles/posts/schedules/platforms load after migration

Ops smoke:

```sh
curl -sk https://social.maxpetrusenko.com/api/health
curl -I -L https://social.maxpetrusenko.com/dashboard
```

## Rollback

Rollback favors returning app runtime to SQLite, not mutating migrated Postgres rows.

Before cutover:

- take SQLite file backup
- record Coolify env before changes
- record app image/deploy revision
- record migration command and output summary

If app fails before writes resume:

- restore previous Coolify env with SQLite `DATABASE_URL`
- redeploy previous app revision
- keep Postgres data for analysis

If app fails after writes resume:

- stop and assess write divergence
- do not blindly overwrite either DB
- export new Postgres writes after cutover timestamp
- decide whether to replay into SQLite or fix forward in Postgres

## Open Decisions

- Exact Postgres connection route from Coolify app container to self-hosted Supabase.
- Whether to expose app tables in Supabase Studio only or also through PostgREST later.
- Whether to keep local magic-link fallback after Supabase email/password is stable.
- Whether to store app tables in `social_poster` schema or use `public` for simpler Studio browsing. Recommendation: `social_poster`.
- Whether RLS policies are required before external customer launch. Recommendation: server-only Drizzle first, RLS hardening later.

## Definition Of Done

Migration is done when:

- `social-poster` production uses Supabase Auth.
- `social-poster` production uses Supabase Postgres through Drizzle.
- SQLite is no longer used at runtime.
- app user rows map to Supabase Auth users.
- invited users land in the intended shared org/workspace without a personal org side effect.
- self-signup still creates an isolated org/workspace when allowed.
- all migrated tables pass row-count and referential checks.
- lint, typecheck, tests, build, migration, and browser smoke pass.
- manager docs and repo docs are updated with non-secret operational truth.
