# Lesson 2: Audit Social Poster and Create PR Requests

Date: 2026-05-27

Duration: 2 hours

Audience: builders who can clone a repo, run a Node project, inspect UI, and write a concise GitHub issue or draft PR.

## Outcome

By the end, each learner has:

- cloned Social Poster
- installed dependencies
- run core quality gates
- audited at least one UI flow and one code path
- filed one strong PR request or opened one small draft PR
- included evidence: screenshots, exact command output, file references, and expected behavior

## Ground Rules

- Keep changes small.
- Do not touch production.
- Do not add secrets to files.
- Do not broad-refactor.
- If a bug is real and fixable in under 30 minutes, add a regression test.
- If a bug is real but not fixable today, create a PR request with repro evidence.

## Timeline

| Time | Block | Deliverable |
| --- | --- | --- |
| 0:00-0:10 | Mission and repo tour | target area picked |
| 0:10-0:25 | Clone and install | repo boots or blocker logged |
| 0:25-0:45 | Run gates | lint/typecheck/test/build evidence |
| 0:45-1:15 | UI audit | screenshot plus issue |
| 1:15-1:40 | Code/safety audit | file refs plus issue |
| 1:40-1:55 | PR request or draft PR | GitHub artifact ready |
| 1:55-2:00 | Shareout | one-minute readout |

## Block 1: Clone And Install

```bash
git clone https://github.com/maxpetrusenko/social-poster.git
cd social-poster
npm install
```

If the repo is private, use the GitHub account that has access.

Create a local development env:

```bash
cp .env.example .env.local
mkdir -p data
DISABLE_AUTH=true DATABASE_URL=./data/social-poster.db npm run db:push
```

Use a real Supabase/social provider env only when the task requires provider integration. For the audit lesson, local auth bypass plus SQLite is enough for UI and code review.

Start by reading:

```bash
sed -n '1,220p' docs/tasks.md
sed -n '1,220p' docs/agent-harness-reference.md
sed -n '1,220p' docs/hermes/coolify-ticket-automation.md
```

## Block 2: Run Quality Gates

Run the repo scripts:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

React/Next audit:

```bash
npx -y react-doctor --full --offline --json --no-respect-inline-disables
```

Record exact failures. Do not summarize as "tests failed." Capture the failing command and the first actionable error.

## Block 3: UI Audit Track

Run the app locally in a separate terminal:

```bash
DISABLE_AUTH=true DATABASE_URL=./data/social-poster.db npm run dev
```

Inspect at least two routes:

- `/dashboard`
- `/dashboard/posts/create`
- `/dashboard/workspace-settings/social-accounts`
- `/dashboard/calendar`
- `/dashboard/pipeline`
- `/dashboard/logs`

Audit prompts:

- Can a new user understand the next action?
- Can the user tell which social account will be used?
- Does the page expose connection status clearly?
- Does the publish path give a clear preview before the Publish click?
- Are error states visible and specific?
- Does mobile layout preserve controls without overlap?
- Does loading/empty state explain what is missing?

Evidence:

- screenshot
- viewport size
- route
- expected behavior
- actual behavior
- severity: blocker, high, medium, low

Good UI PR request format:

```markdown
Title: Make connected account state visible in Create Post

Problem:
On /dashboard/posts/create, the selected platform chip does not clearly show
which account handle will publish. This is risky when users have duplicate
LinkedIn/X accounts.

Evidence:
- Route:
- Screenshot:
- Viewport:

Expected:
Each selected target shows platform, provider, handle, and enabled/disabled state.

Suggested fix:
Render account identity from composer platform data in the target selector.

Acceptance:
- account handle visible before publish
- disabled accounts cannot be selected
- regression test for duplicate same-platform accounts
```

## Block 4: Code Audit Track

Start with narrow files, not the whole repo.

Good target areas:

- Agent runtime: `src/agent/`
- Social Agent API: `src/app/api/social-agent/route.ts`
- Post publish route: `src/app/api/posts/[id]/publish/route.ts`
- Composer data: `src/lib/dashboard/composer.ts`
- Connection catalog: `src/lib/connection-catalog.ts`
- OAuth providers: `src/lib/providers/`
- Pipeline publishing: `src/lib/pipeline/`
- Dashboard components: `src/components/dashboard/`

Audit prompts:

- Is tenant/workspace scope enforced?
- Can a disabled account still publish?
- Is every publish attempt auditable?
- Are provider errors preserved exactly?
- Is token refresh handled before expiry?
- Are media URLs public before publish?
- Are retries idempotent?
- Is there a regression test for the risky branch?
- Is LangSmith tracing present for model calls?

Good code PR request format:

```markdown
Title: Add idempotency key for manual publish attempts

Problem:
Manual publish retries can produce duplicate platform posts if the request
is retried after the platform succeeds but before local DB status persists.

Evidence:
- File:
- Current behavior:
- Risk:

Suggested fix:
Add per-target idempotency metadata around publish execution and persist the
provider result before allowing retry.

Acceptance:
- retry after successful platform publish does not create a duplicate
- unit test covers retry with existing successful target status
- pipeline log shows skipped duplicate target
```

## Block 5: Create The PR Request

If creating an issue:

```bash
gh issue create --title "..." --body-file /tmp/social-poster-pr-request.md
```

If creating a draft PR:

```bash
git checkout -b fix/small-specific-name
npm run lint
npm run typecheck
npm run test
git status --short
git add <specific files>
git commit -m "fix: short specific description"
git push -u origin fix/small-specific-name
gh pr create --draft --title "fix: short specific description" --body-file /tmp/social-poster-pr.md
```

Use the repo convention: Conventional Commit type in the title where it fits.

## Minimum PR Body

```markdown
## Summary
-

## Problem

## Evidence
- Route/file:
- Screenshot/log:
- Command output:

## Changes
-

## Verification
- [ ] npm run lint
- [ ] npm run typecheck
- [ ] npm run test
- [ ] npm run build
- [ ] UI checked on desktop
- [ ] UI checked on mobile

## Risk

## Rollback
Revert this PR.
```

## Done Condition

Done means one of:

- a draft PR exists with a focused fix and verification
- a GitHub issue exists with clear repro, expected behavior, suggested fix, and acceptance criteria

Not done:

- generic feedback without file refs
- screenshots without diagnosis
- code changes without tests or verification notes
- broad rewrite proposal with no first small step

## References

- Local task status: `docs/tasks.md`
- Agent architecture: `docs/agent-harness-reference.md`
- Hermes automation: `docs/hermes/coolify-ticket-automation.md`
- Repo scripts: `package.json`
