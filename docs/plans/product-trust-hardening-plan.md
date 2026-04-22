---
read_when:
  - removing dead buttons or scaffold pages
  - preparing a demo/public launch
  - deciding whether a visible route should ship, hide, or become disabled
---

# Product Trust Hardening Plan

Last updated: 2026-04-21

## Goal

Remove visible product trust leaks before public proof or OSS launch.

Trust leak means:
- primary action says "coming soon"
- route looks like a finished feature but is a scaffold
- mock data appears in production routes
- UI implies a capability that is not wired

## Current Known Surfaces

Likely files:
- `src/app/dashboard/settings/billing/page.tsx`
- `src/app/dashboard/settings/danger/page.tsx`
- `src/app/dashboard/settings/profile/page.tsx`
- `src/components/settings/settings-tabs.tsx`
- `src/app/dashboard/client-portal/page.tsx`
- `src/app/dashboard/client-portal/approvals/page.tsx`
- `src/app/dashboard/client-portal/published/page.tsx`
- `src/app/dashboard/client-portal/activity/page.tsx`
- `src/app/dashboard/workspace-settings/client-portal/page.tsx`
- `src/app/dashboard/workspace-settings/media-library/page.tsx`
- `src/app/dashboard/settings/media-library/page.tsx`
- `src/app/dashboard/settings/all-calendars/page.tsx`
- `src/app/dashboard/settings/preferences/page.tsx`
- `src/app/dashboard/inbox/replies/page.tsx`
- `src/components/dashboard/replies-mock-showcase.tsx`
- `src/components/dashboard/shell-scaffold-page.tsx`
- `src/components/new-post-form.tsx`

## Rules

1. Hide if no user can use it.
2. Disable if it is useful to show roadmap but unsafe to click.
3. Wire if the backend action already exists and risk is low.
4. Never show fake/mock data on production routes unless explicitly labeled internal demo.
5. Do not remove docs. Keep docs honest.

## First Patch

Low-risk first patch:

1. Convert "coming soon" buttons in settings pages to disabled explanatory notices.
2. Replace client portal shell cards with "Approval portal not enabled yet" unless approval tables exist.
3. Move mock replies out of production path or gate them.

Acceptance:
- `rg -n "coming soon|placeholder|mock" src/app src/components` has no production-facing false promise except code comments/tests.
- `npm test`, `npm run typecheck`, `npm run lint`, `npm run build` pass.

## Second Patch

Wire low-risk existing backend actions:
- profile settings link to existing profile editor rather than dead edit button
- danger page points to existing org/workspace deletion schedule where already implemented
- billing page becomes read-only plan state plus contact/waitlist action

Acceptance:
- every visible button either works or is explicitly disabled
- no new destructive action is added without confirmation

## Third Patch

Route/nav cleanup:
- remove or hide unavailable client portal/media/preferences routes from nav if not useful
- keep docs/plans references
- preserve direct routes only if they render honest unavailable states

Acceptance:
- operator nav contains only usable or clearly disabled surfaces
- direct URL to unfinished feature explains dependency and next work
