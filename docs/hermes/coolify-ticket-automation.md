---
summary: "Fleet support-ticket automation for Coolify apps: app widget, Linear routing, Hermes polling, PR creation, and Telegram notification."
read_when:
  - Adding support intake to a Coolify app
  - Wiring a Linear project to Hermes
  - Debugging automated ticket-to-PR flow
---

# Coolify Ticket Automation

Goal: every Coolify-hosted app exposes support intake on every authenticated page, routes tickets to that app's Linear project, lets Hermes check ready tickets every 30 minutes, and produces a tested draft PR plus a Telegram notification for Max.

## Flow

1. User reports an issue through an app support button or chatbot widget.
2. App creates a Linear issue in the matching app project.
3. Issue stays human-triage unless it has the configured ready label, default `agent:ready`.
4. Hermes poller checks configured Linear projects every 30 minutes.
5. Hermes verifies the issue. If context is missing, it asks in Linear and stops.
6. Hermes fixes locally in an isolated worktree, adds a regression test when practical, runs lint/typecheck/tests, commits, pushes, and opens a draft PR.
7. Poller sends Max a Telegram message with the ticket and PR.
8. Max reviews/accepts the PR, deploys, and verifies production.

## App Intake Contract

Each app should have one of these on every protected page:

- Support button: small fixed/header action that opens a ticket form.
- Chatbot widget: accepts natural support reports and can submit the same ticket payload.

Minimum ticket payload:

```json
{
  "source": "from_user_triage",
  "topic": "Short bug title",
  "explanation": "Expected, actual, steps, account/workspace context",
  "pageUrl": "https://app.example.com/current/page",
  "pageTitle": "Current page",
  "imageUrl": "https://optional-screenshot-url",
  "autoRepair": false
}
```

Required behavior:

- Include page URL, route, app name, user email if known, workspace/tenant if known, environment, and screenshot when available.
- Never mark vague reports ready for Hermes automatically.
- Set `autoRepair: true` only for trusted bot-originated issues or explicit Max requests.
- Protect bot/API intake with a per-app `SUPPORT_BOT_TOKEN`.

Social Poster already implements:

- UI: `src/components/dashboard/support-ticket-button.tsx`
- Chat command: `/support` in `src/app/api/social-agent/route.ts`
- API: `src/app/api/support-tickets/route.ts`
- Linear creation: `src/lib/support/tickets.ts`

## Linear Setup

Per app:

- One Linear project, for example `SocialClaw`.
- One team id or project id configured in app env.
- Labels:
  - `agent:ready`: Hermes may pick this up.
  - `agent:needs-context`: Hermes must not pick this up.
  - `agent:blocked`: Hermes must not pick this up.

App env:

```dotenv
LINEAR_API_KEY=
LINEAR_SUPPORT_TEAM_ID=
LINEAR_SUPPORT_PROJECT_ID=
LINEAR_SUPPORT_PROJECT_NAME=SocialClaw
LINEAR_SUPPORT_LABEL_IDS=
SUPPORT_BOT_TOKEN=
```

## Hermes Poller

Poller script:

```bash
npm run tickets:poll -- --dry-run
npm run tickets:poll -- --run
```

It is dry-run by default. `--run` is required before Hermes starts work.

Config env:

```dotenv
HERMES_LINEAR_PROJECTS='[
  {
    "app": "social-poster",
    "repo": "maxpetrusenko/social-poster",
    "projectName": "SocialClaw",
    "cwd": "/Users/maxpetrusenko/Desktop/Projects/social-poster",
    "hermesCommand": "hermes",
    "hermesModel": "gpt-5.5",
    "hermesProvider": "openai-codex",
    "readyLabels": ["agent:ready"],
    "blockedLabels": ["agent:needs-context", "agent:blocked"],
    "runTests": "npm run lint, npm run typecheck, npm run test"
  }
]'
HERMES_LINEAR_STATE_FILE=.hermes/linear-poller-state.json
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

Set `hermesModel` and `hermesProvider` explicitly when the poller should not inherit the host's Hermes default model. On Contabo, set `hermesCommand` to the local wrapper if needed, for example `"sudo hermes-vps"`.

Cron example:

```cron
*/30 * * * * cd /Users/maxpetrusenko/Desktop/Projects/social-poster && npm run tickets:poll -- --run >> /tmp/hermes-linear-poller.log 2>&1
```

Systemd timer on VPS is preferred for production because it gives logs, retries, and a single active instance. Keep the state file on persistent disk.

`/etc/systemd/system/hermes-linear-poller.service`:

```ini
[Unit]
Description=Hermes Linear ticket poller

[Service]
Type=oneshot
WorkingDirectory=/opt/hermes-vps/workspace/social-poster
EnvironmentFile=/opt/hermes-vps/hermes-linear-poller.env
ExecStart=/usr/bin/npm run tickets:poll -- --run
```

`/etc/systemd/system/hermes-linear-poller.timer`:

```ini
[Unit]
Description=Run Hermes Linear ticket poller every 30 minutes

[Timer]
OnBootSec=5min
OnUnitActiveSec=30min
Persistent=true

[Install]
WantedBy=timers.target
```

Enable:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now hermes-linear-poller.timer
systemctl list-timers hermes-linear-poller.timer
```

## Hermes Prompt Contract

The poller sends Hermes a ticket-specific prompt requiring:

- reproduce or verify the issue first
- ask in Linear and stop if context is missing
- TDD where practical
- regression test for bugs
- lint/typecheck/tests before PR
- Conventional Commit
- draft PR only
- PR URL plus exact verification output

## Access Boundaries

User-facing app widgets create tickets only. They do not get shell, raw SQL, Coolify API, production secrets, or platform tokens.

Hermes ticket automation gets:

- Linear read access for configured projects
- repo worktree access
- GitHub PR creation through the automation account
- Telegram send permission to Max

Hermes does not merge PRs, deploy production, or mark production verified. Max owns those steps.

## Rollout Checklist

For each Coolify app:

1. Add the support button or chatbot widget to the authenticated shell/layout.
2. Add `/api/support-tickets` or proxy to a shared ticket service.
3. Configure the app Linear project env.
4. Create Linear labels: `agent:ready`, `agent:needs-context`, `agent:blocked`.
5. Add the app to `HERMES_LINEAR_PROJECTS`.
6. Run dry-run and verify ready ticket discovery.
7. Run one sandbox ticket end to end.
8. Enable the 30-minute timer.
9. Confirm Telegram notification includes ticket and PR links.
