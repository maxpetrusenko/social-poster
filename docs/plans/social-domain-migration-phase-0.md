---
summary: "Phase 0 for making smmagent.app the canonical Social Poster application without breaking its marketing root, authentication, OAuth callbacks, media URLs, or production automation."
read_when:
  - "Changing the Social Poster canonical application hostname, DNS, Coolify domains, authentication redirects, or OAuth callbacks."
---

# Social Poster Domain Migration: Phase 0

## Problem

`social.maxpetrusenko.com` exposes a personal-name hostname for a product now branded
as SMM Agent. The desired outcome is a product-owned application hostname with a
safe retirement path for the old hostname.

The July 18 login incident is separate from DNS. Digest `1251027214` came from three
malformed `reply_events.metadata` rows that crashed authenticated dashboard rendering.
Changing hostnames without repairing that data would reproduce the same failure.

## Target User and Job

Primary user: the SMM Agent operator signing in to manage schedules, posts, replies,
and connected social accounts.

Job: open one stable product URL, authenticate successfully, and retain working
publishing callbacks and media links while the underlying hostname changes.

## Current State

- Canonical app: `social.maxpetrusenko.com`
- Healthy application: one Coolify service on Contabo, one SQLite database, one
  in-process scheduler
- Existing product domain: `smmagent.app`, healthy, already attached to the app,
  and currently serving the SMM Agent marketing root
- Selected canonical target: `smmagent.app`
- App-only routes on `smmagent.app` currently redirect to
  `social.maxpetrusenko.com`

## Decision

Canonical application hostname: `smmagent.app`.

Keep the `smmagent.app` root as the marketing site while serving login, callback,
dashboard, and API routes on the same origin. Keep `social.maxpetrusenko.com` as
a temporary dual-host session and callback compatibility surface during migration.

DNS, Coolify routing, and TLS already work on `smmagent.app`; do not switch
authentication traffic until Supabase and provider callback allowlists accept it.
A hostname change does not add capacity. Scaling the scheduler or database is a
separate architecture project.

## Workflow Sketch

```text
smmagent.app
  marketing root
  login -> Supabase -> callback -> dashboard
       |
       +-> posts, schedules, media, OAuth provider callbacks

social.maxpetrusenko.com
  dual-host app + callback compatibility during cutover
  public /blog paths -> smmagent.app
  product-only paths -> clawposter.app
  then path-preserving redirect -> smmagent.app after callbacks drain
```

## Implementation Status

- Complete locally: incident data repair, malformed reply-metadata regression
  guard, canonical-domain code, dual-host routing, callback configuration
  contract, deploy canary contract, public links, docs, and local tests.
- Not committed, pushed, or deployed: canonical routing and canary changes remain
  local until auth configuration is ready.
- DNS/TLS proof: `smmagent.app` resolves to the Contabo app, has valid TLS, and
  serves both `/health` and `/api/health`.
- Hard auth gate: do not switch user traffic until Supabase Site URL and redirect
  allowlists plus every external provider callback include the new hostname and
  both old-host and new-host callback smoke tests pass.

## Cutover Slices

1. Repair and guard the current authenticated dashboard.
   Proof: malformed historical reply-event metadata cannot crash the affected
   dashboard reads; health and authenticated login pass.
2. Verify `smmagent.app` as an attached DNS/Coolify hostname.
   Proof: valid TLS, `/api/health` 200, no scheduler drift.
3. Add dual-host application and authentication support.
   Proof: Supabase accepts the new redirect; old and new login callbacks work.
4. Add the new callback URI to each external social OAuth provider.
   Proof: connection smoke tests return to the new app hostname.
5. Switch canonical URLs, Coolify environment, deployment canaries, media fallbacks,
   monitors, and documentation.
   Proof: local gates, deploy workflow tests, production canary, authenticated
   browser test.
6. Redirect the legacy hostname and observe for 48 hours.
   Proof: path-preserving redirects, no callback failures, no media-fetch failures,
   scheduler drift zero.
7. Remove the legacy Coolify/DNS hostname last.
   Proof: no production or provider configuration still references it.

## Risks

- Supabase rejects the new callback until its Site URL and redirect allowlist change.
- External OAuth providers reject request-derived callback URLs until each portal is
  updated.
- Cookies do not transfer between unrelated hosts, so users must sign in again.
- Scheduled posts and external platforms may still fetch media from legacy URLs.
- Removing the old hostname too early breaks stale browser tabs and OAuth callbacks.
- The current single-replica SQLite and in-process scheduler design cannot scale
  horizontally. Keep one replica until scheduling is separated and the database
  migration is complete.

## Open Decisions

1. Choose the legacy redirect observation window. Recommendation: 48 hours minimum,
   then retain the hostname as a redirect for 30 days if cost is negligible.

## Proof Gates

- Database integrity `ok`
- `/api/health` 200 and schedule drift `0`
- Signed-out dashboard redirects to login
- Google sign-in returns to the new hostname
- Authenticated dashboard renders
- Existing workspace, posts, profiles, platforms, and schedules load
- Each social OAuth callback works on the new hostname
- CI deploy canary targets the new hostname and rollback still works
- Old hostname preserves path and query string during redirect
- No production secret values appear in docs, logs, or commits
