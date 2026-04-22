---
read_when:
  - deciding whether to open-source social-poster
  - shaping the public agent package or launch story
  - comparing against PostHero, PostClaw, Postiz, TryPost, or Mixpost
---

# Agent OSS Positioning

Last updated: 2026-04-21

## Decision

Do not open-source this full app as-is.

Open-source a smaller agent package that proves a sharper wedge:

> Turn real builder work into reviewed, platform-specific social posts.

The hosted product can stay private and sell convenience: OAuth, managed publishing, retries, media processing, approvals, analytics, and support.

## Research Snapshot

PostHero is already selling the broad "AI social media manager" surface: multi-platform publishing, viral post library, voice notes, content planning, REST API, MCP, OpenClaw integration, and pricing from API-only to agency plans.

Reference: `https://posthero.ai/`

PostClaw is already selling the "chat with an AI social media manager" angle. Its blog positions Telegram + OpenClaw as the command center and says the speed advantage is posting by chat instead of a dashboard.

References:
- `https://www.postclaw.io/`
- `https://www.postclaw.io/blog/openclaw-for-social-media`
- `https://postclaw.fun/docs/billing/`

Open-source scheduling is already a crowded lane:
- Postiz: AGPL, self-hosted social scheduler, large GitHub footprint.
- TryPost: open-source scheduler with cloud/self-host positioning.
- Mixpost: open-source/self-hosted social media management.

References:
- `https://github.com/gitroomhq/postiz-app`
- `https://trypost.it/en`
- `https://mixpost.app/`

## Implication

"Open-source social media scheduler" is not differentiated.

"AI captions for every platform" is not differentiated.

"Agent posts from my actual work and shows the receipts" is differentiated enough to launch.

## What The Agent Means

The agent should not be a chat widget that says it can help.

The agent should be a workflow engine:

```text
source event
  -> evidence extraction
  -> draft candidates
  -> platform-specific adaptation
  -> human approval
  -> publish or schedule
  -> durable logs and analytics feedback
```

## Will It Use Our Repo To Post?

Yes, repo activity should be one first-class source, but not the only source.

Source connectors:
- GitHub commits, PRs, merged PRs, issues, releases, and changelog changes.
- Local repo diff summaries from a trusted workspace path.
- Blog/RSS posts.
- Product docs and plan changes.
- Manual notes and screenshots.
- Published post analytics once analytics exists.

The public demo should show:

```text
merged PR / docs update / release note
  -> agent extracts what changed
  -> agent drafts X + LinkedIn variants
  -> user approves
  -> app schedules/publishes
  -> logs show source, prompt, approval, publish result
```

This is stronger than "write me a viral post" because it starts from a real event and can cite the evidence.

## Public Package Shape

Create a separate public repo, not a dump of this app:

```text
social-poster-agent/
  packages/
    core/
      source connectors
      draft generation
      platform adaptation
      approval state
      audit events
    mcp/
      draft_post
      schedule_post
      publish_post
      list_activity
    cli/
      social-poster-agent draft --source github
      social-poster-agent approve
      social-poster-agent publish
  examples/
    github-to-x-linkedin/
    rss-to-social/
    local-repo-diff-to-post/
  docker-compose.yml
  .env.example
```

Keep out of the public package:
- hosted auth and billing
- private admin/blog automation
- personal Contabo/Coolify/Doppler assumptions
- real user data
- private platform credentials
- production SQLite
- closed provider fallbacks that depend on private cookies

## License

Use Apache-2.0 for the agent package if the goal is reach and reputation.

Use AGPL only if preventing hosted clones matters more than adoption.

Recommended: Apache-2.0 for `social-poster-agent`, proprietary hosted service.

## Launch Thesis

Target first users:
- devtool founders
- OSS maintainers
- indie hackers
- technical consultants
- people whose work already lives in GitHub/docs/blogs

Launch copy:

> I open-sourced the agent that turns my commits, docs, and releases into reviewed social posts.

Proof posts:
- "This post came from this PR."
- "This LinkedIn post came from this docs diff."
- "Here is the audit trail: source -> draft -> approval -> publish."

## First Public Milestone

Ship the smallest public demo that can be trusted:

1. GitHub source connector reads recent merged PRs and releases.
2. Draft engine emits X and LinkedIn copy with source links.
3. Approval file or local SQLite table stores decisions.
4. Publish adapter supports dry-run plus one real platform adapter.
5. MCP exposes draft, approve, schedule, publish, and list activity.
6. README gets a 10-minute setup path and one high-quality demo recording.

## Success Criteria

- A stranger can run the demo without this private app.
- The agent creates posts from real source events, not generic prompts.
- Every externally visible action has an approval/audit trail.
- The public repo points to the hosted product for managed OAuth, scheduling, analytics, and team workflows.
