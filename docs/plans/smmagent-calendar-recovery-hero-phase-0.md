---
summary: "Phase 0 contract for canonical SMM Agent routing, a bounded calendar render, and a real calendar hero preview."
read_when:
  - "Changing SMM Agent domain routing, calendar data loading, or the SMM Agent landing hero."
---

# SMM Agent Calendar Recovery and Hero Preview

## Problem

Three connected failures weaken the first-use path:

1. `smmagent.app/dashboard`, login, and auth callbacks are redirected to the
   legacy `social.maxpetrusenko.com` host in the currently deployed build.
2. The authenticated calendar blocks its server render on live external
   discovery calls and can exceed Cloudflare's origin response window.
3. The SMM Agent hero describes the product without showing the working tool.

## Observed evidence

- On 2026-07-24, public requests to the SMM Agent dashboard, login, and callback
  returned `307` responses to `social.maxpetrusenko.com`.
- The authenticated legacy calendar returned Cloudflare `524` while health,
  login, and unauthenticated dashboard routing remained responsive.
- The current local calendar rendered `200` without client console or page
  errors, but its first development render took about 13 seconds.
- `getCalendarInsights` waits for live RSS, traction, Open Graph, image, site,
  and GitHub data while building the request.
- The calendar route test mocks the client calendar surface, so it does not
  prove hydration or browser rendering.
- Current `main` already contains the canonical host migration and its deploy
  was still running when this investigation started.

## Root causes

### Canonical host

Production is still serving the predecessor build where
`SITE_DOMAINS.app` is `social.maxpetrusenko.com`. Current `main` changes the
canonical app host to `smmagent.app`; this is deployment drift, not a missing
source fix.

### Calendar availability

The request path mixes durable calendar records with unbounded, failure-prone
external discovery. A slow feed or metadata source delays the entire React
server response. Historical run and workspace queries also load broader data
than the visible month requires.

### Hero proof

The landing hero has no visual proof. Existing demo assets are stale, empty, or
branded for a different surface.

## Product decision

The calendar is a control surface, not a live research job. It must render from
durable database state within the request budget. Forecast enrichment may be
cached, precomputed, or omitted when unavailable. External discovery must never
block the page.

The hero will show a real, locally rendered SMM Agent calendar screenshot. The
image must not include private post text, tokens, email addresses, or secrets.

## Walking skeleton

```text
smmagent.app hero
  -> login
  -> same-host dashboard
  -> database-first calendar
  -> calendar screenshot visible on the hero
```

## Slice 1: availability

- Preserve `smmagent.app` for dashboard, login, and callback requests.
- Remove blocking external discovery from the calendar request.
- Keep existing stored runs, schedules, posts, platform status, and monthly
  navigation visible.
- Add a regression that fails if calendar rendering invokes live discovery.

Proof gate:

- focused domain and calendar tests
- local authenticated/bypass browser load
- no page or console errors
- calendar response completes inside the browser smoke timeout

## Slice 2: hero proof

- Capture the fixed local calendar at a desktop viewport.
- Store a new SMM Agent-specific asset without replacing Remotion assets.
- Add the image to the hero with responsive dimensions and useful alt text.
- Verify image decoding and no horizontal overflow on desktop and mobile.

## Acceptance criteria

- Canonical dashboard, login, and callback URLs never redirect to the legacy
  host after deployment.
- Calendar render does not perform live RSS, traction, Open Graph, image, site,
  or GitHub network work.
- A failed or unavailable forecast source cannot prevent the calendar page from
  rendering.
- Existing calendar events and filters remain functional.
- The SMM Agent hero displays a real calendar image on desktop and mobile.
- Tests cover canonical authenticated routing, database-first calendar loading,
  client rendering, image delivery, and responsive overflow.

## Non-goals

- Removing the legacy OAuth callback host before provider migrations drain.
- Redesigning the full dashboard.
- Publishing, scheduling, or modifying production social content.
- Changing DNS or deploying production without explicit approval.

## Rollback

- Revert the calendar data-source change to restore forecast enrichment.
- Remove the hero figure and new static asset.
- Keep the canonical host migration; legacy fallback remains separately
  available during the transition.
