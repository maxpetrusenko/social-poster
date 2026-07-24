---
summary: "Phase 0 for making generated articles discoverable and reviewable from the dashboard, including a live SMM Agent website preview."
read_when:
  - "Changing /dashboard/articles navigation, generated-article links, or website preview behavior."
  - "Connecting article workspace packages to public SMM Agent blog pages."
---

# Article Review Links: Phase 0

## Problem

`/dashboard/articles` stores generated article packages and can open their local
files, but it does not provide one obvious review path to the live SMM Agent
website. The Article Generation submenu has Articles, New Article, and Settings;
it has no website-preview destination. Existing uncommitted queue work exposes
links only when an older queue snapshot already contains them, so it is not an
authoritative generated-article inventory.

## Target User and Job

Primary user: Max reviewing generated long-form content.

Job: open Article Generation, see which generated articles are already public,
open a draft's package when editing is needed, and inspect the exact public SMM
Agent page without hunting for a URL.

## Verified Current State

- Canonical application and article website: `https://smmagent.app`.
- `smmagent.app` already has working DNS, TLS, `/health`, and `/api/health`.
- The active dashboard navigation is rendered by
  `src/components/dashboard/drawer-shell.tsx` from
  `src/lib/dashboard-shell.ts`.
- Article packages live under `data/article-workspace/articles`.
- Public SMM Agent blog inventory already exposes linked pages under
  `https://smmagent.app/blog/<slug>`.
- Verified live examples:
  - `https://smmagent.app/blog/smm-agent-draft-before-publish`
  - `https://smmagent.app/blog/source-backed-social-agents-guide`
  - `https://smmagent.app/blog/bring-your-own-model-keys-social-automation-guide`
- Cross-repo Medium previews also exist, but they are not equivalent to the
  authoritative SMM Agent public blog inventory.

## Prior Art

The manager Article Approval Pipeline requires phone-openable previews, exact
title/subtitle rendering, noindex for drafts, and explicit approval before
publication. This dashboard slice is a review surface only; it does not weaken
those publication gates.

The website preview uses a deliberate iframe plus a visible direct link. An
iframe may be blocked by `X-Frame-Options` or CSP, so the direct link is the
required fallback. External links that open a new tab must visibly communicate
that behavior:

- https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/X-Frame-Options
- https://www.w3.org/WAI/WCAG21/Techniques/general/G201

## UX Contract

```text
Article Generation
  Articles
  Website Preview
  New Article
  Settings

Website Preview
  SMM Agent blog browser
  selected live article or blog index in a responsive frame
  Open on smmagent.app (opens new tab)

Articles
  generated/local package
    Review draft -> dashboard package/editor
    View on smmagent.app -> only when a public slug is proven
```

Rules:

- Keep the existing YouTube-to-Medium queue as a separate source pipeline.
- Do not guess a public URL from every local package.
- Derive public SMM links from the same static/dynamic blog inventory that
  renders `/blog`.
- Use distinct labels for internal review and public website viewing.
- Preserve keyboard focus states and include the external-window warning in the
  accessible name.
- Keep the existing SMM Agent marketing homepage at `smmagent.app/`; application
  routes such as `/dashboard/articles` live on the same host.

## Data Flow

```text
static + published dynamic SMM blog inventory
  -> normalized review item { title, slug, publicUrl, status }
  -> /dashboard/articles generated/public section
  -> /dashboard/articles/preview selection
  -> iframe src + direct public link

article workspace package
  -> local summary/openRef
  -> internal Review draft link
  -> optional join by stable slug to public inventory
  -> public View on smmagent.app link only on a proven match
```

## Risks

- Treating a local package as published would create broken links.
- Treating a Pages/Medium preview as the canonical SMM article would confuse
  review and publication state.
- An iframe can fail independently of the public page; the direct link must
  remain available.
- The current worktree contains unrelated article-generation changes. Edits must
  remain scoped and preserve them.
- Changing `smmagent.app` from marketing-only to canonical app routing must keep
  the root marketing page while serving login, callbacks, and dashboard routes
  locally.

## Implementation Slices

1. Correct the domain contract from erroneous `smmagent.com` to
   `smmagent.app`, preserving the marketing root and legacy callback window.
2. Add an explicit Website Preview submenu route and article-specific dashboard
   header.
3. Add a reusable public SMM article inventory and join it to generated article
   summaries by slug.
4. Render separate Review draft and View on SMM Agent actions.
5. Add the responsive website preview frame with direct-link fallback.
6. Run unit, integration, browser, accessibility, full-suite, and independent
   review gates.

## Proof Gates

- `smmagent.app/` still renders the SMM Agent marketing page.
- Signed-out `smmagent.app/dashboard/articles` stays on `.app` and redirects to
  its own login.
- Article Generation submenu exposes Website Preview.
- Website Preview loads `https://smmagent.app/blog` or a verified article URL.
- Every public article link returns HTTP 200.
- Local-only packages do not receive fabricated public links.
- Internal draft links remain functional.
- New-window behavior is visible and accessible.
- Focused tests, typecheck, scoped lint, full suite, and browser QA pass.
- No unrelated worktree changes are overwritten.
