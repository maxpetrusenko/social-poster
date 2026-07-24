---
summary: "Phase 0 for retiring SMM Agent's public waitlist and making login, invitations, and authenticated support the complete user journey."
read_when:
  - "Changing SMM Agent landing CTAs, authentication, invitations, tenancy selection, or support intake."
  - "Removing public waitlist collection while preserving historical signup records."
---

# Login-First User Support: Phase 0

## Problem

SMM Agent already accepts any authenticated user and provisions a personal
workspace, but its public navigation, landing hero, final CTA, and blog articles
still ask people to join a waitlist. Production also redirects
`smmagent.app/login` to the legacy `social.maxpetrusenko.com` host. The visible
product therefore contradicts the working user model.

Authentication has two launch-blocking edge cases: protocol-relative `next`
values can become external redirects, and accepting an invitation after personal
workspace creation can pair an organization with a workspace from another
organization. Support intake exists for authenticated users, but its primary API
and modal flows do not have direct regression coverage.

## User and Job

Primary user: a new or invited SMM Agent customer.

Job: discover the product, sign in on `smmagent.app`, land in the correct
workspace, and ask for support without encountering a waitlist, a legacy-domain
redirect, an account-switch loop, or a mismatched organization.

## Verified Current State

- Any authenticated non-empty email is accepted. A first dashboard request
  creates the user, personal organization, owner membership, and workspace.
- Signed-out landing and blog CTAs still submit to `/api/waitlist`.
- The waitlist table contains three historical rows. They are business history,
  not a migration target.
- Authenticated dashboard users already see the support modal. The shared API
  can create Linear tickets and attaches reporter/workspace context.
- Production currently serves the waitlist landing page and redirects
  `https://smmagent.app/login` to the legacy social host. Local domain work is
  therefore not production proof.
- The worktree contains unrelated uncommitted work. This slice must preserve it.

## Prior Art

- Next.js recommends validating authorization close to the data source and using
  route-level redirects only as an initial check:
  https://nextjs.org/docs/app/guides/authentication
- Supabase OAuth and passwordless callback URLs must match the project's allowed
  redirect URL configuration:
  https://supabase.com/docs/guides/auth/redirect-urls
- Linear supports customer-support integrations that create issues while
  retaining a link to the originating request:
  https://linear.app/developers/attachments

## Product Contract

```text
Marketing page or public article
  -> Sign in
  -> Google OAuth or local magic link
  -> safe same-origin callback
  -> personal workspace or matching invitation
  -> dashboard
  -> Support modal or /support command
```

Rules:

- Remove all public SMM Agent waitlist forms, labels, anchors, and collection.
- Make `/login` the signed-out primary CTA. Keep `/dashboard` for signed-in users.
- Retire `POST /api/waitlist` with an explicit terminal response so old clients
  cannot silently keep collecting leads.
- Preserve the historical waitlist table and admin export. Relabel them as
  legacy/history so no data is destroyed or mistaken for an active funnel.
- Keep all canonical login, callback, invitation, and dashboard navigation on
  `smmagent.app`; retain only intentional compatibility handling for the legacy
  host.
- Accept only safe application-relative `next` paths. Reject absolute URLs,
  protocol-relative URLs, backslash variants, and authentication-loop targets.
- An accepted invite must select an organization and workspace that belong
  together.
- A wrong-account invitation must offer a visible sign-out/switch-account path.
- Support submission must require authentication, validate payloads, preserve
  tenant/reporter attribution, and display provider failures without claiming a
  ticket was created.

## Walking Skeleton

1. Replace landing and article waitlist CTAs with a direct login path; disable
   new waitlist submissions while retaining history.
2. Harden shared post-auth redirect handling and verify canonical callback
   behavior.
3. Keep organization/workspace selection coherent after invitation acceptance
   and expose account switching for email mismatch.
4. Add direct tests for support modal and API success/failure paths without
   sending a real ticket.
5. Run focused tests after every slice, then lint, typecheck, build, full suite,
   browser QA, and production read-only canaries.

## Required Test Matrix

| Flow | Expected proof |
| --- | --- |
| Signed-out landing | Login CTA; no waitlist copy or form |
| Signed-in landing | Dashboard CTA |
| Public article | Login CTA; no waitlist form |
| Retired waitlist API | Terminal response; no database insert |
| Login modes | Supabase, magic-link, bypass, and misconfigured states |
| OAuth callback | Success, provider failure, missing code/config, cookie write |
| Redirect safety | Absolute, protocol-relative, backslash, and auth-loop targets rejected |
| First/returning login | Correct tenant creation and reuse under concurrency |
| Invite lifecycle | Create, accept, expired, reused, resend, revoke, and authorization |
| Wrong invite account | Switch-account path; no redirect loop |
| Multi-organization invite | Selected organization owns selected workspace |
| Logout | Session invalidated and dashboard denied |
| Support API | Signed-out, invalid input, success, upload, provider failure |
| Support modal | Open, validation, successful confirmation, visible error |
| Social Agent support | Parse, validation, success, and failure claims |
| Domain routing | Canonical `.app` login/callback/dashboard; intentional legacy behavior only |

## Risks and Boundaries

- Real Google OAuth depends on Supabase provider and redirect allow-list state;
  local mocks cannot prove those external settings.
- Linear support creation is side-effectful. Tests must mock it; browser QA must
  stop before sending a real issue.
- Historical waitlist data must not be deleted.
- This task does not authorize commit, push, deployment, DNS changes, or live
  support submissions.

## Proof Gates

- Red tests demonstrate each changed contract before implementation.
- Focused auth, invite, waitlist, tenancy, and support suites pass.
- Lint, typecheck, production build, and full test suite pass with the repository
  runtime.
- Browser QA verifies signed-out and authenticated local journeys; support stops
  before real submission.
- Read-only production canary records current behavior separately from local
  proof.
- Independent review checks auth security, tenant isolation, and support claims.
- No unrelated worktree changes are overwritten.
