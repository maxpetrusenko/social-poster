# Maxiclaw Agent Setup

Maxiclaw uses Hermes on the Mac mini and should use a separate GitHub machine account for PR work.

## Identity

- Email: `maxiclaw@maxpetrusenko.com`
- Commit name: `Maxiclaw Agent`
- GitHub username: set with `MAXICLAW_GH_USER`

Do not use Max's personal GitHub login on the mini for automated PR work.

## One-Time Setup

Open GitHub signup in a separate browser session:

```bash
scripts/hermes-agent open-signup
```

Create or sign into the Maxiclaw GitHub account. GitHub may require email verification, captcha, or 2FA; finish those manually when prompted.

If credentials are stored in `.env`, prefer explicit names:

```dotenv
MAXICLAW_GH_EMAIL=maxiclaw@maxpetrusenko.com
MAXICLAW_GH_PASSWORD=...
MAXICLAW_GH_USER=...
MAXICLAW_GH_TOKEN=...
```

Use explicit `MAXICLAW_GH_*` names only. Do not use Max's personal `UN` / `PW` or browser session for Maxiclaw GitHub auth.

Preferred: create a GitHub token while logged into the Maxiclaw account, save it as `MAXICLAW_GH_TOKEN`, then install it into `gh` on the mini:

```bash
MAXICLAW_GH_USER=<github-user> scripts/hermes-agent login-token
```

Invite the account to the repo:

```bash
MAXICLAW_GH_USER=<github-user> scripts/hermes-agent invite <github-user>
```

Accept the repository invite while logged into the Maxiclaw GitHub account.

Start GitHub CLI login on the mini:

```bash
MAXICLAW_GH_USER=<github-user> scripts/hermes-agent login-gh
```

Use the Maxiclaw GitHub account in the browser/device flow.

Bootstrap the mini repo clone and git identity:

```bash
MAXICLAW_GH_USER=<github-user> scripts/hermes-agent bootstrap
```

Verify:

```bash
MAXICLAW_GH_USER=<github-user> scripts/hermes-agent verify
```

## Running One Ticket-To-PR Task

```bash
MAXICLAW_GH_USER=<github-user> scripts/hermes-agent ticket-pr
```

Custom prompt:

```bash
MAXICLAW_GH_USER=<github-user> scripts/hermes-agent ticket-pr \
  "Pick Linear ticket SHR-123, implement it, run tests, push a branch, and open a draft PR. Do not merge."
```

## Guardrails

- The script refuses to run PR automation unless `gh api user` on the mini matches `MAXICLAW_GH_USER`.
- Hermes runs with `--worktree` so ticket work is isolated from the main clone.
- PRs must be draft PRs unless Max explicitly asks otherwise.
- Never merge from Maxiclaw.
- Keep `docs/tasks.md` updated when behavior or project status changes.
