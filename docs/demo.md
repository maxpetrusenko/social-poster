# Social Poster Demo

This demo is for GitHub readers and operator review. It avoids production mutation unless the operator explicitly chooses a publish action.

## One-Minute Narrative

Social Poster is a control plane for social and Medium agents. It turns source signals into drafts, ratings, queues, approval records, provider-specific packets, and deploy proof. The key distinction: the agent can prepare work and schedule allowed lanes, but public mutation is gated by explicit signals, workspace policy, review state, and runtime health.

## Public Demo Path

1. Show the README safety-flow image.
2. Open `/dashboard/articles`.
3. Show the YouTube-to-Medium queue from `data/article-workspace/youtube-medium-playlist-queue.json`.
4. Open a package under `data/article-workspace/articles/`.
5. Show `overview.md`, `workflow.json`, `evals/`, selected images, and the current review status.
6. Open `/dashboard/likes`.
7. Show eligible and skipped liked X candidates.
8. Open `/dashboard/pipeline`.
9. Filter for `x-like:*` step names.
10. Show source capture, source verification, draft, reviewer, packet readiness, queued slot, and learning readiness.
11. Open `/dashboard/schedules`.
12. Show enabled schedules and the health drift warning path.
13. Open `/api/health`.
14. Point to `schedules.drift`, `xLikedAutopost.latestRun`, and `xLikedAutopost.queue`.
15. Open the `Fast Coolify Deploy` workflow.
16. Show gate, GHCR image, Coolify deploy, public canary, rollback job, and deploy report artifact.

## Local Read-Only Demo

Use a disposable SQLite database:

```bash
DISABLE_AUTH=true \
DATABASE_URL=/tmp/social-poster-demo.sqlite \
npm run dev -- -p 3010
```

Open:

```text
http://localhost:3010/dashboard
http://localhost:3010/dashboard/articles
http://localhost:3010/dashboard/likes
http://localhost:3010/dashboard/pipeline
http://localhost:3010/api/health
```

## Documentation-Safe Proof Commands

```bash
npm run test:deploy-workflow
npm run manatee:test
npm run articles:sync-youtube-queue
npm run articles:export-public-preview
npm run articles:verify-public-preview
```

Run only the checks needed for the proof surface. In a dirty worktree, prefer README/image path validation and deploy-config regression over package-wide mutation-prone checks.

## Claims To Avoid

- Do not say Medium autopublishes. The documented Medium lane is review-first and uses visible Medium UI after Max approval.
- Do not say every provider is fully production-deep. The registry exists, but depth varies by capability and OAuth approval.
- Do not say background liked-post posting is always on. It is default-disabled in `.env.example`.
- Do not say approval is optional globally. Workspace approval mode changes the rule for a workspace.

