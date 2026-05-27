# Workshop Review Summary

Date: 2026-05-27

Status: approved for workshop use after local review corrections.

## What Is Strong

- The final deliverables now include HTML visual artifacts, not only markdown planning notes.
- The two main lessons fit the requested 2-hour windows.
- Lesson 1 keeps Social Poster as the publish boundary and makes user-owned account connection explicit.
- Lesson 2 creates concrete GitHub artifacts instead of generic feedback.
- The FreeLLMAPI add-on gives a practical no-paid-subscription path without pretending it is production-grade.
- Commands are copied from current official docs where external setup is involved.

## Caveats

The current Social Poster internal agent tool slice is intentionally safe and narrow. It can support context/activity/draft-style assistance, but public publishing should remain through the authenticated Social Poster composer and publish route unless the product later adds a confirmed, audited publish tool for Hermes.

Cursor CLI binary names can vary by install channel, so Lesson 1 includes fallbacks for `agent`, `cursor-agent`, and `cursor`.

FreeLLMAPI runs a long-lived local dev server, so the add-on requires a second terminal for smoke tests and Hermes commands.

## Required Instructor Callouts

- Students must connect their own accounts.
- Public publish requires human preview and the explicit Publish click.
- Do not share social cookies or platform tokens.
- Do not expose FreeLLMAPI publicly.
- Repo audit output must include evidence, not vibes.

## Evidence Used

- Final HTML artifacts:
  - `docs/lessons/social-poster-hermes-workshop.html`
  - `docs/lessons/social-poster-workflow-board.html`
- OpenAI Codex CLI official install docs.
- Cursor CLI official install docs.
- Hermes Agent official install docs.
- FreeLLMAPI README.
- Local Social Poster docs and code:
  - `docs/tasks.md`
  - `docs/hermes/agent-setup.md`
  - `docs/hermes/coolify-ticket-automation.md`
  - `docs/agent-harness-reference.md`
  - `src/app/api/social-agent/route.ts`
  - `src/agent/server-adapter.ts`
  - `src/agent/tools/post-tools.ts`
  - `src/app/api/posts/[id]/publish/route.ts`

## Follow-Up Improvements

- Add a real persisted Social Agent draft tool if Lesson 1 should avoid manual copy/paste.
- Add a confirmed publish tool only if it records tenant audit, requires explicit confirmation, checks account connection, and reuses the existing publish route.
- Add screenshots to the lesson docs after the next live workshop run.
