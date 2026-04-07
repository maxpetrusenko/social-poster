# Social Automation Migration Plan
## Cowork Scheduled Tasks -> Contabo VPS + Coolify

Reviewed on 2026-04-04. Revised for security, deploy safety, and operational realism.

## First Correction

The previous draft stored live credentials and account IDs directly in this file. That is not acceptable for an execution plan.

Action now:

1. Remove all secrets from the document.
2. Keep secrets only in Doppler and Coolify environment variables.
3. If this file was ever synced, shared, committed, screenshotted, or pasted into any external tool, rotate:
   - Contabo API credentials
   - Zernio API key
   - Simli key
   - Any other vendor tokens that appeared here

## Recommended Shape

Use a separate private repo for `social-poster` instead of placing it inside the website repo.

Why:

- Different deploy cadence
- Different secrets and blast radius
- Easier CI and rollback
- Cleaner ownership of Docker, rendering, and scheduled-job logic

If keeping it in this repo is politically easier, use a top-level `social-poster/` workspace and separate CI pipeline, but the default recommendation is a separate repo.

## Architecture

### Service layout

Start with one container and one replica:

- HTTP server
  - `/health`
  - `/status`
  - optional `/run/:job` behind auth
- Scheduler
  - five cron jobs
- Posting pipeline
  - feed ingest
  - scoring/dedup
  - image or video render
  - vendor publish
- Persistent state
  - SQLite on mounted volume for phase 1

### Important rule

Keep this service at exactly one replica while it uses in-process cron and SQLite. If you ever scale above one replica, move scheduling to a singleton worker or add a distributed lock.

## Infrastructure

### Existing host

| Resource | Details |
| --- | --- |
| Provider | Contabo |
| Product | V92 |
| Host | `173.249.52.27` |
| OS | Ubuntu 24.04 according to the infra plan |
| Coolify | `v4.0.0-beta.470` in local notes |

### Deployment target

- Coolify-managed app
- Public hostname through Traefik: `social.maxpetrusenko.com`
- Cloudflare in front
- Full (strict) if using public A-record origin routing

## Data and State

### SQLite is fine for phase 1, with guardrails

Use SQLite only if all of the following are true:

- one replica
- one writer process
- persistent mounted volume
- daily backup
- WAL mode enabled

Suggested storage layout:

- `/app/data/social-poster.db`
- `/app/data/renders/` only if you need short-lived artifacts

Do not keep SQLite on the container filesystem. Use Coolify persistent storage.

### When to move to Postgres

Switch to Postgres if any of these become true:

- more than one replica
- multiple worker processes writing state
- need durable audit history
- richer retry, queue, or analytics needs

## Pipeline Design

### Feed ingest

- Pull feeds on schedule
- Normalize source metadata
- Score and rank candidates
- Store source URL hash before publish attempt

### Idempotency

Every publish attempt should have a deterministic idempotency key, for example:

`<platform>:<content-hash>:<time-bucket>`

That protects against:

- deploy-time double fires
- retries after partial failure
- manual reruns of the same content

### Rendering

- Images:
  - Use `sharp`
  - Drop the earlier "sharp with wasm" note; native `sharp` is the normal Linux/Docker path here
- Video:
  - Remotion + Chromium + ffmpeg
  - Cap concurrency aggressively on this box
  - Clean temp artifacts after successful upload

### Publishing adapters

Wrap each vendor in its own adapter:

- `zernio.ts`
- `cartesia.ts`
- `simli.ts`
- optional `bird.ts`

Do not let application logic depend on raw vendor payloads outside adapter boundaries.

## X Posting Decision

Default to Zernio for X if it supports the exact media path you need. Keep `bird` only as a controlled fallback.

Reason:

- `bird` depends on browser cookies and local browser state
- it is more fragile operationally
- it is harder to run headlessly and safely on a VPS

Implementation rule:

- feature flag for X provider
- `X_PROVIDER=zernio|bird`
- production default should be `zernio` once media upload is verified

## Schedule

All times ET unless changed centrally in config.

| Time | Job | Targets | Notes |
| --- | --- | --- | --- |
| 9 AM | Avatar video | TikTok, IG Reels, LinkedIn video, X image | heavy render path |
| 11 AM | Image + caption | X, LinkedIn, IG Story | lighter path |
| 1 PM | Image + caption | X | lighter path |
| 3 PM | Image + caption | X | lighter path |
| 6 PM | Avatar video | TikTok, IG Reels, LinkedIn video, X image | heavy render path |

## Repository and Runtime

### Project skeleton

```text
social-poster/
  src/
    server.ts
    scheduler.ts
    jobs/
    feeds/
    render/
    publish/
    db/
    lib/
  config/
    feeds.json
    schedule.json
    voice-guide.md
  tests/
  scripts/
  Dockerfile
  docker-compose.yml
```

### Runtime guidance

- Use the repo's normal package manager
- Pin Node to an active LTS used by the project
- Keep server start explicit:
  - `server.ts` should start HTTP and scheduler
  - avoid ambiguous `cron.ts` entrypoints

## Dockerfile Draft

This version fixes the earlier health-check issue by actually installing `curl`.

```dockerfile
FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    ffmpeg \
    curl \
    dumb-init \
    fonts-liberation \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build && npm prune --omit=dev

USER node

EXPOSE 3333

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3333/health || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/server.js"]
```

## Coolify Deploy Strategy

### Recommendation

Use Docker Compose or Dockerfile deploy through Coolify, with the repo as source of truth and a persistent volume for `/app/data`.

Required properties:

- single replica
- restart policy enabled
- persistent volume for DB and any local artifacts
- health check enabled
- no public port publishing except through Traefik/domain routing

## Environment Variables

Do not store values in this file. Keep names only.

Core secrets:

- `ZERNIO_API_KEY`
- `CARTESIA_API_KEY`
- `SIMLI_API_KEY`

Core config:

- `CARTESIA_VOICE_ID`
- `SIMLI_FACE_ID`
- `X_PROVIDER`
- `TZ=America/New_York`
- `APP_BASE_URL`
- `STATUS_SHARED_SECRET`
- `MANUAL_RUN_TOKEN`

Optional:

- `SLACK_WEBHOOK_URL`
- `SENTRY_DSN`
- `R2_BUCKET`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`

## Health and Observability

### Minimum endpoints

- `GET /health`
  - process alive
  - DB reachable
- `GET /status`
  - last success per job
  - next run time per job
  - queue depth if present
  - last vendor error summary

### Logs

- structured JSON logs
- request ID / run ID on every job
- vendor adapter logs should include:
  - platform
  - content id
  - duration
  - status

### Alerts

Send Slack alert on:

- failed scheduled run
- duplicate-post prevention trigger
- repeated vendor failure
- low disk
- low swap

## Test Plan

### Before first deploy

1. Unit tests for feed ranking, dedup, schedule parsing, adapter mapping
2. Golden-image test for one static card render
3. One local Remotion smoke render
4. Adapter contract tests with mocked vendor responses
5. One dry-run end-to-end job that stops before publish

### Before cutover

1. Deploy to Coolify
2. Verify `/health`
3. Run one manual dry-run job
4. Run one manual publish to a test destination if vendors support it
5. Confirm DB persists across container restart

## Migration Phases

### Phase 0: Prep

1. Create a Contabo snapshot before new app deploys
2. Create repo and CI
3. Set up Doppler project/config
4. Define environment variable contract

### Phase 1: Build

1. Implement feed ingest
2. Implement dedup store
3. Implement image rendering
4. Implement video rendering
5. Implement vendor adapters
6. Implement health/status endpoints
7. Implement authenticated manual-run endpoint

### Phase 2: Verify locally

1. Local DB persistence
2. Local image render
3. Local Remotion smoke render
4. Dry-run pipeline

### Phase 3: Deploy

1. Create Coolify app
2. Attach persistent storage
3. Add env vars from Doppler
4. Bind domain through Traefik
5. Verify health endpoint and logs

### Phase 4: Shadow mode

1. Keep Cowork active
2. Run VPS jobs in dry-run or limited-publish mode
3. Compare selected content and generated media
4. Verify no duplicate posts

### Phase 5: Cutover

1. Enable real publishing on VPS
2. Watch first 3-5 runs manually
3. Disable Cowork scheduled tasks
4. Keep rollback path for at least one week

## Time Estimate

The original 7-10 hour estimate is optimistic for a stable first version with real renders and vendor integrations.

More realistic:

| Phase | Effort |
| --- | --- |
| Build core pipeline | 1-2 days |
| Rendering + vendor adapters | 1-2 days |
| Deploy + observability + cutover | 0.5-1 day |
| Total | 2.5-5 days |

## Risks

### Technical

- duplicate posting from restart or redeploy
- Chromium/ffmpeg memory spikes on 8 GB host
- vendor API drift
- SQLite corruption if volume or shutdown handling is sloppy

### Operational

- plaintext secrets already existed in the old draft
- no test destination for social platforms
- schedule is timezone-sensitive

## Notes on Licensing and Cost

Check Remotion licensing and pricing before treating this as settled. Remotion distinguishes free personal use from paid commercial or team use.

Also budget for:

- vendor API usage
- object storage for backups/artifacts if needed
- monitoring/logging if free tiers run out

## References

- Coolify Docker Compose docs:
  - https://coolify.io/docs/applications/build-packs/docker-compose
- Coolify persistent storage:
  - https://coolify.io/docs/knowledge-base/persistent-storage
- Coolify health checks:
  - https://coolify.io/docs/knowledge-base/health-checks
- Docker firewall behavior:
  - https://docs.docker.com/engine/network/packet-filtering-firewalls/
- Contabo snapshots:
  - https://help.contabo.com/en/support/solutions/articles/103000270385-how-do-i-create-a-snapshot-of-my-server-
- Remotion:
  - https://www.remotion.dev/
- Remotion license:
  - https://github.com/remotion-dev/remotion/blob/main/LICENSE.md
