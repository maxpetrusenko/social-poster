# Social Poster Hermes Workshop Doc Plan

Date: 2026-05-27

## Source Intake

Audience: builders who can use a terminal, browser, GitHub, and a hosted social account, but may not already know Hermes, Codex, Cursor Agent, or Social Poster internals.

User request:

- Create two 2-hour lessons for today.
- Lesson 1: use Codex or Cursor to install Hermes Agent, then use Hermes Agent with Social Poster to post. User must connect their own account.
- Lesson 2: in another thread, download the Social Poster repo, find UI/code/audit problems, and create PR requests to improve the platform.
- Bonus for people without paid AI subscriptions: install and configure `tashfeenahmed/freellmapi` for Hermes.

## Triage

| Requirement | Class | Doc |
| --- | --- | --- |
| Install Codex or Cursor Agent | Partial system to extend | `01-hermes-social-poster-2hr.md` |
| Install and configure Hermes Agent | Partial system to extend | `01-hermes-social-poster-2hr.md` |
| Connect user social account | Existing Social Poster system | `01-hermes-social-poster-2hr.md` |
| Use Hermes to make a post through Social Poster | Partial system to extend | `01-hermes-social-poster-2hr.md` |
| Clone/download repo and audit it | Existing repo workflow | `02-repo-audit-pr-2hr.md` |
| Create PR requests | Existing GitHub workflow | `02-repo-audit-pr-2hr.md` |
| No-paid-subscription path | Net-new optional setup | `03-free-llmapi-hermes-add-on.md` |

## Planned Docs

### `01-hermes-social-poster-2hr.md`

Why it exists: the main learner path from fresh agent tooling to a real Social Poster publish flow.

Must answer:

- Which AI agent CLI to use: Codex or Cursor Agent.
- How to install Hermes Agent.
- How to configure a provider.
- Where account connection happens in Social Poster.
- What publish safety boundary is required.
- What counts as done.

Codebase integration points:

- `docs/hermes/agent-setup.md`
- `docs/hermes/coolify-ticket-automation.md`
- `src/app/api/social-agent/route.ts`
- `src/agent/server-adapter.ts`
- `src/agent/tools/post-tools.ts`
- `src/app/api/posts/[id]/publish/route.ts`
- `/dashboard/workspace-settings/social-accounts`
- `/dashboard/posts/create`
- `/dashboard/pipeline`
- `/dashboard/logs`

Key decision: the lesson should teach Hermes-assisted copy generation through the product UI and Social Poster publish route, not unrestricted direct social API posting. Current safe internal agent tools support context/activity/draft-style operations, while real publishing remains gated by dashboard auth, connected accounts, preview, and the user's Publish click.

### `02-repo-audit-pr-2hr.md`

Why it exists: a separate hands-on thread for contributors to clone Social Poster, run checks, audit UI/code/safety, and produce reviewable PR requests.

Must answer:

- How to clone and boot the repo.
- Which gates to run.
- How to split UI, code, safety, observability, and docs findings.
- How to create a high-quality GitHub issue or draft PR.

Codebase integration points:

- `package.json`
- `docs/tasks.md`
- `docs/agent-harness-reference.md`
- `docs/hermes/coolify-ticket-automation.md`
- dashboard routes under `src/app/dashboard`
- dashboard components under `src/components/dashboard`
- tests under `src/**/*.test.ts` and `src/**/*.test.tsx`

Key decision: the output should prefer small PR requests with evidence, screenshots, tests, and rollback notes over a broad unsourced critique.

### `03-free-llmapi-hermes-add-on.md`

Why it exists: learners without paid ChatGPT/Cursor/Nous/OpenAI subscriptions need an alternate OpenAI-compatible endpoint for Hermes practice.

Must answer:

- How to install FreeLLMAPI.
- How to add free provider keys.
- How to expose an OpenAI-compatible `/v1/chat/completions` endpoint.
- How to point Hermes at the local endpoint as a custom provider.
- What limitations to warn about.

Codebase integration points:

- Hermes custom provider config from local Hermes tests and `hermes config` behavior.
- FreeLLMAPI README.

Key decision: this add-on is for learning and personal experimentation only. It is not a production inference substrate.

## External Sources Checked

- OpenAI Codex CLI official docs: `https://developers.openai.com/codex/cli`
- Cursor CLI official docs: `https://cursor.com/docs/cli/installation`
- Hermes Agent official install docs: `https://hermes-agent.nousresearch.com/docs/getting-started/installation/`
- FreeLLMAPI GitHub README: `https://github.com/tashfeenahmed/freellmapi`

## Review Checklist

- Each lesson fits 2 hours.
- Each lesson has prerequisites, timed agenda, commands, facilitator checks, learner deliverables, and failure handling.
- Account connection is explicit and user-owned.
- Posting flow has preview plus an explicit Publish click.
- PR lesson includes UI, code, audit, tests, docs, and PR hygiene.
- FreeLLMAPI lesson includes limitations and ToS caution.
