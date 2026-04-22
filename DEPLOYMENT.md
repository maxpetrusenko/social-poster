# Social Agent VPS Guide

## Infrastructure

- **Server**: Contabo VPS `173.249.52.27`
- **SSH**: `ssh -i ~/.ssh/contabo_vmi3203669_ed25519 root@173.249.52.27`
- **Reverse proxy**: Traefik (managed by Coolify) with Let's Encrypt TLS
- **Primary domain**: `social.maxpetrusenko.com`
- **Landing domains**: `clawposter.app`, `www.clawposter.app`, `smmclaw.app`, `www.smmclaw.app`, `smmagent.app`, `www.smmagent.app`
- **Coolify path**: `Root Team -> social-poster -> production -> social-poster`
- **App**: Coolify-managed `social-poster` service
- **DB**: SQLite (WAL mode) at `/data/social-poster.db`, backed by the Coolify volume mount

## Stack

- Next.js 15 App Router (standalone output)
- Drizzle ORM + better-sqlite3
- node-cron for scheduling
- Remotion for video rendering (bundled in Docker)
- Docker base: `node:22-bookworm-slim` + chromium + ffmpeg

## Repo Location

- **On Mac**: `~/Desktop/Projects/social-poster`
- **On VPS**: `/opt/social-poster`
- **GitHub**: `github.com/maxpetrusenko/social-poster` (private)

## Environment Variables

Container requires these env vars (set via `docker run -e`):

| Var | Purpose |
|-----|---------|
| `DISABLE_AUTH=false` | Required for production Supabase auth |
| `NEXT_PUBLIC_SUPABASE_URL` | Self-hosted Supabase public URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser anon key for Supabase Auth |
| `SUPABASE_INTERNAL_URL` | Optional server-only Supabase URL; use `http://supabase-kong:8000` on Contabo so server session checks bypass Cloudflare/Traefik |
| `HOSTNAME=0.0.0.0` | Listen on all interfaces |
| `PORT=3000` | Next.js port |
| `CARTESIA_API_KEY` | Cartesia TTS API key |
| `CARTESIA_VOICE_ID` | Max's cloned voice ID |
| `SIMLI_API_KEY` | Simli avatar API key |
| `SIMLI_FACE_ID` | Max's face ID |
| `LATE_API_KEY` | Late/Zernio publishing API key |
| `ZERNIO_API_KEY` | Zernio key (legacy publish endpoint) |
| `ZERNIO_LINKEDIN_ACCOUNT_ID` | LinkedIn account in Zernio |
| `ZERNIO_FACEBOOK_ACCOUNT_ID` | Facebook account in Zernio |
| `ZERNIO_INSTAGRAM_ACCOUNT_ID` | Instagram account in Zernio |
| `X_AUTH_TOKEN` | X auth cookie for reply engine |
| `X_CT0` | X ct0 cookie for reply engine |
| `BIRD_RUNNER=bird` | bird CLI runner inside container |

Keys live in Doppler (`api_keys` project, `dev` config). Fetch:
```bash
doppler secrets get CARTESIA_API_KEY SIMLI_API_KEY GETLATE_DEV_API_KEY_FREE --project api_keys --config dev --plain
```

## Deploy Flow

Target state:
- Coolify owns build, restart, logs, env vars, domain routing
- avoid ad-hoc standalone containers once Coolify app is live
- app expects SQLite at `/data/social-poster.db`
- app always serves Next.js on `3000`; entrypoint bridges any Coolify rollout port to `3000`
- GitHub source uses an SSH deploy key; no public-repo toggle
- production auth uses self-hosted Supabase at `https://supabase.maxpetrusenko.com`
- server-side Supabase calls should use `SUPABASE_INTERNAL_URL=http://supabase-kong:8000` in Coolify to avoid routing dashboard session checks through Cloudflare/Traefik
- required reply env vars in Coolify: `X_AUTH_TOKEN`, `X_CT0`, `BIRD_RUNNER=bird`
- optional Bird health interval: `BIRD_SESSION_CHECK_HOURS=24`
- `APP_URL` is optional in Coolify; when set, use the single dashboard origin `https://social.maxpetrusenko.com`. Do not paste the comma-separated Coolify domain list into `APP_URL`.
- X/Bird image posts should use PNG/JPG/WebP assets, not SVG

```bash
# 1. Push code
cd ~/Desktop/Projects/social-poster
git add -A && git commit -m "feat: ..." && git push origin main

# 2. Redeploy the connected Coolify app
# use Coolify UI or API to trigger a new deployment

# 3. Verify
curl -sk https://social.maxpetrusenko.com/api/health
curl -I -L https://social.maxpetrusenko.com/dashboard/calendar
```

Fallback only if Coolify is down:
```bash
ssh root@173.249.52.27 'docker logs social-poster --tail 20'
```

## Pipeline Architecture

### Video Pipeline (avatar_video jobs)
1. **Feed Engine** — pulls 25 RSS feeds, scores by recency + AI keywords + source weight, deduplicates against SQLite cache
2. **Script Writer** — template-based voice script (~15-20s), Max's voice style (personal take first, fragments ok, no hashtags/emoji)
3. **Cartesia TTS** — sonic-2 model, Max's cloned voice, outputs WAV 44.1kHz
4. **Simli Avatar** — lip-sync video from audio, polls for MP4 render
5. **Remotion Render** — branded video. Portrait MP4 for TikTok + IG. Square MP4 for LinkedIn + X. Bottom text card stays above avatar.
6. **Catbox Upload** — hosts final MP4 at `files.catbox.moe`
7. **Late API Publish** — posts to TikTok, IG, LinkedIn, X with `publishNow: true`

### Text Pipeline (image_post jobs)
1. Feed Engine → top story
2. Script Writer → platform-specific caption
3. Late API Publish → text post to targets

### Scheduling
- node-cron runs in-process (same Node server as Next.js)
- Schedules stored in `schedules` table, loaded on boot
- Timezone: `America/New_York`
- Runs logged to `pipeline_runs` table with step-level detail
- Schedule create/edit/delete reloads cron jobs immediately

### Reply Pipeline (`reply_engine` jobs)
1. bird mentions pull
2. optional safe-topic search fallback
3. risk scoring + manual-only account filter
4. fallback draft generation in Max voice
5. bird reply send on X
6. reply event log in `reply_events`

Guardrails:
- daily limit `20`
- weekly per-account limit `2`
- manual-only list for large/high-risk accounts
- blocked topics: politics / ratio / cancel / discourse lane

### Publishing
- **Late/Zernio API** (`getlate.dev/api/v1/posts`): TikTok, LinkedIn, IG, Facebook
- **Account IDs** come from `platforms.accountId`, fallback map in `src/lib/pipeline/publisher.ts`
- IG video default: `reel`
- 6 PM schedule override: `story`

## Schedule (all times ET)

| Time | Job Type | Platforms |
|------|----------|-----------|
| 9 AM | avatar_video | TikTok + IG Reels + LinkedIn square + X square |
| 11 AM | image_post | X + LinkedIn |
| 1 PM | image_post | X + LinkedIn |
| 3 PM | image_post | X + LinkedIn |
| 6 PM | avatar_video | TikTok + IG Stories + LinkedIn square + X square |

## Debugging

```bash
# Container logs
docker logs social-poster --tail 50

# DB queries (inside container)
docker exec social-poster node -e "
const Database = require('better-sqlite3');
const db = new Database('/data/social-poster.db');
console.log(db.prepare('SELECT * FROM pipeline_runs ORDER BY started_at DESC LIMIT 5').all());
"

# Manual trigger
curl -sk https://social.maxpetrusenko.com/api/schedules/<id>/run -X POST

# Health check
curl -sk https://social.maxpetrusenko.com/api/health
```

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/scheduler.ts` | Cron scheduler, loads from DB on boot |
| `src/lib/pipeline/feed-engine.ts` | RSS feed puller + scorer |
| `src/lib/pipeline/tts.ts` | Cartesia TTS client |
| `src/lib/pipeline/avatar.ts` | Simli avatar client |
| `src/lib/pipeline/video-render.ts` | Remotion render wrapper |
| `src/lib/pipeline/upload.ts` | Catbox uploader |
| `src/lib/pipeline/publisher.ts` | Late/Zernio publisher |
| `src/lib/pipeline/script-writer.ts` | Voice script + caption generator |
| `src/lib/pipeline/runners/avatar-video.ts` | Full video pipeline runner |
| `src/lib/pipeline/runners/image-post.ts` | Text post runner |
| `src/lib/pipeline/runners/reply-engine.ts` | X reply pipeline runner |
| `src/lib/replies/bird.ts` | bird CLI bridge for mentions/search/reply |
| `src/lib/replies/config.ts` | reply target rules + limits |
| `src/remotion/` | Remotion composition (excluded from TS build) |
| `src/instrumentation.ts` | Next.js boot hook (inits scheduler) |

## Critical IDs

| ID | What |
|----|------|
| `7270ea4d-a17a-4f21-a3da-03f2b128669d` | Cartesia voice (Max clone) |
| `7bb46589-4be6-4df8-ab80-03443fb75d6f` | Simli face (Max) |
| `690248619d65616f16a5c5bc` | Late account: X |
| `69024a4c9d65616f16a5c5c0` | Late account: LinkedIn |
| `69024a779d65616f16a5c5c1` | Late account: Instagram |
| `6998bbc78ab8ae478b38b1cc` | Late account: TikTok |
| `69024a999d65616f16a5c5c2` | Late account: Facebook |
