# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS base

ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN --mount=type=cache,target=/app/.next/cache \
  (while true; do sleep 10; echo "next build still running"; done) & \
  heartbeat_pid="$!"; \
  npm run build; \
  build_status="$?"; \
  kill "$heartbeat_pid"; \
  exit "$build_status"

FROM node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
ENV DATABASE_URL=/data/social-poster.db
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV BIRD_RUNNER=bird

RUN --mount=type=cache,target=/root/.npm \
  apt-get update \
  && apt-get install -y --no-install-recommends chromium ffmpeg ca-certificates curl dumb-init \
  && npm install -g github:maxpetrusenko/steipete-bird#feat/social-poster-inbox-analytics \
  && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /data

# Next standalone already contains the production server and required packages.
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/scripts/container-entrypoint.sh ./container-entrypoint.sh

RUN chmod +x ./container-entrypoint.sh

EXPOSE 3000

# Keep Next on 3000 for healthchecks, while bridging any injected rollout port.
CMD ["dumb-init", "./container-entrypoint.sh"]
