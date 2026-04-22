---
read_when:
  - adding the left navigation Analytics menu
  - adding analytics collectors or provider metrics
  - changing post, account, audience, or inbox reporting
---

# Cross-Platform Analytics Plan

Last updated: 2026-04-21

## Goal

Add an `Analytics` top-level item to the left workspace navigation. It should show one operator dashboard for every connected platform, then platform drilldowns for X/Twitter, LinkedIn, Instagram, Facebook, Threads, YouTube, TikTok, Pinterest, Bluesky, Mastodon, Reddit, Google Business, WhatsApp, Discord, and Telegram where the platform can produce useful metrics.

Analytics should answer:

- What posts are working by platform, format, and campaign.
- Which accounts are growing.
- Which inbound surfaces need attention.
- Which source is stale, limited, disconnected, or permission-blocked.
- What content should be repeated, reshaped, or retired.

## Product Shape

Left nav:

```text
Workspace
  Calendar
  Posts
  Social Inbox
  Analytics
  Notifications
  Schedules
  RSS
```

Routes:

```text
/dashboard/analytics
/dashboard/analytics/x
/dashboard/analytics/linkedin
/dashboard/analytics/instagram
/dashboard/analytics/facebook
/dashboard/analytics/threads
/dashboard/analytics/youtube
/dashboard/analytics/tiktok
/dashboard/analytics/pinterest
/dashboard/analytics/bluesky
/dashboard/analytics/mastodon
/dashboard/analytics/reddit
/dashboard/analytics/google-business
/dashboard/analytics/whatsapp
/dashboard/analytics/discord
/dashboard/analytics/telegram
/dashboard/analytics/settings
```

Overview widgets:

- Performance scorecards: impressions, views, reach, engagement, clicks, replies/comments, saves/bookmarks, shares/reposts, watch time where available.
- Growth scorecards: followers, subscribers, profile views, channel views, page views where available.
- Top posts: newest and best performers, filterable by platform, format, campaign, status, profile, and date range.
- Inbound load: new comments, DMs, X Replies outreach results, response rate, unanswered threads, stale follow-ups.
- Source health: last pull time, next pull time, auth status, rate limit status, permission scope, native vs fallback source.
- Quality labels on every metric: `native`, `public`, `bird`, `sweetistics`, `manual export`, or `estimated`.

Platform drilldowns:

- Account trend chart.
- Post table with sortable normalized metrics.
- Post detail side panel with raw metrics, native URL, comments/replies, media preview, and "make variant" action.
- Metric availability card so missing data is explained instead of silently blank.
- Pull button per platform, plus scheduler status.

## Source Strategy

Default rule: use native official APIs first. Use Bird and Sweetistics for X only where they create leverage or avoid expensive/blocked API access.

| Platform | Primary source | Fallback source | Notes |
|---|---|---|---|
| X/Twitter | X API post fields and analytics endpoints where plan/access allows | Bird for web/session collection and public/live metrics; Sweetistics only for imported historical X analytics if installed/configured | X public metrics now include impressions in `public_metrics`; richer timestamped analytics and private metrics require stronger access. Bird is useful for authenticated web data, notifications, and live operator pulls. |
| LinkedIn | LinkedIn Community Management APIs: organization share stats, page/follower stats, member post/profile analytics if app access is approved | Public social actions counts where available | Organization analytics are strongest. Personal/member analytics require Community Management permissions such as `r_member_postAnalytics` and `r_member_profileAnalytics`. |
| Instagram | Meta Instagram Graph API insights for professional accounts and owned media | Public media counters where allowed | Requires business/creator account and Meta app permissions. Personal Instagram analytics are not a good target. |
| Facebook | Meta Page Insights and post insights | Public post engagement counts where allowed | Page access token and page role required. Some Page metrics have changed over time, so collectors must tolerate missing metrics. |
| Threads | Threads Insights API | Public counters where allowed | Requires Threads app permissions such as insights access. Treat as Meta-native, not scrape-first. |
| YouTube | YouTube Analytics API plus Data API video stats | Data API public counters | Analytics API supports reports by metrics, dimensions, filters, date ranges, and video IDs. Expect 24 to 48 hour delays for some metrics. |
| TikTok | TikTok approved creator/business/content analytics where available | Public video counters where allowed | Native analytics access depends on app product approval. MVP should not assume impressions are available. |
| Pinterest | Pinterest API analytics for organic Pins and ads | Public Pin counters where allowed | Good native option. Pinterest says API supports analytics data ingestion and many content/ads metrics. |
| Bluesky | AT Protocol post and profile counts | None | Likes, reposts, replies, quotes, followers. No impressions. |
| Mastodon | Mastodon API status/account counts | None | Replies, boosts, favourites, followers. No impressions. |
| Reddit | Reddit API post/comment counts | Manual export for mod insights | Score, comments, upvote ratio where available. No general post impression API for normal accounts. |
| Google Business | Business Profile Performance API and reviews | None | Treat as local listing analytics and review response, not social post analytics. |
| WhatsApp | Cloud API message status webhooks and conversation analytics | Meta dashboard/manual export | Messaging analytics only. No feed post metrics. |
| Discord | Bot/API message counts and engagement events in owned servers | None | Server/community telemetry, not public social analytics. |
| Telegram | Bot/API channel post views and reactions where bot/admin access allows | None | Channel analytics depends on admin access and API surface. |

## Data Model

Add normalized tables instead of storing only raw provider payloads.

```text
analytics_source_runs
  id
  workspace_id
  platform_id nullable
  source
  status
  started_at
  completed_at nullable
  error nullable
  metadata_json nullable

analytics_snapshots
  id
  workspace_id
  platform_id nullable
  source
  scope account | post | audience | inbound | campaign
  entity_type nullable
  entity_id nullable
  period_start nullable
  period_end nullable
  captured_at
  metrics_json
  raw_json nullable

analytics_post_metrics
  id
  workspace_id
  platform_id
  post_id nullable
  post_target_id nullable
  platform_post_id
  captured_at
  source
  impressions nullable
  reach nullable
  views nullable
  likes nullable
  comments nullable
  replies nullable
  shares nullable
  reposts nullable
  quotes nullable
  saves nullable
  bookmarks nullable
  clicks nullable
  profile_clicks nullable
  watch_time_seconds nullable
  engagement_rate nullable
  raw_json nullable

analytics_audience_snapshots
  id
  workspace_id
  platform_id
  captured_at
  source
  followers nullable
  following nullable
  subscribers nullable
  profile_views nullable
  page_views nullable
  demographics_json nullable
  raw_json nullable
```

Keep raw payloads for debugging, but read dashboards from normalized rows. This lets every provider return partial data without breaking the UI.

## Collector Architecture

Add one contract under `src/lib/analytics/providers/`.

```ts
type AnalyticsCapability =
  | "account"
  | "audience"
  | "post"
  | "video"
  | "inbound"
  | "campaign";

type AnalyticsSourceKind =
  | "native"
  | "bird"
  | "sweetistics"
  | "public"
  | "manual_export";
```

Provider methods:

- `getCapabilities(platform): AnalyticsCapability[]`
- `pullAccountMetrics(context)`
- `pullAudienceMetrics(context)`
- `pullPostMetrics(context, postTargets)`
- `pullInboundMetrics(context)`
- `normalize(raw)`
- `explainUnavailable(context)`

Scheduler:

- Run high-value post metrics every 2 to 6 hours for the first 7 days after publish.
- Run account/audience metrics daily.
- Run X/Bird live pulls manually and on short cadence only when credentials are healthy.
- Back off on auth errors and rate limits.
- Store source freshness and error state in `analytics_source_runs`.

API routes:

```text
GET  /api/analytics/summary
GET  /api/analytics/platforms/:platform
GET  /api/analytics/posts/:postTargetId
POST /api/analytics/pull
POST /api/analytics/pull/:platform
GET  /api/analytics/source-runs
```

## Bird And Sweetistics Plan

Bird:

- Use for X account identity, authored posts, mentions/notifications, and public/live engagement where native API access is missing or costly.
- Prefer existing `/Users/maxpetrusenko/Desktop/Projects/bird/bird` commands and the `oss/steipete-bird` plan work for `analytics` and `notifications`.
- Store Bird metrics with source `bird` and explicit freshness.
- Never hide that Bird data can differ from X API analytics because it is session/web collected.

Sweetistics:

- Do not block MVP on Sweetistics.
- Treat it as optional X historical analytics/import support after local install or repo is available.
- If added, create an importer that maps Sweetistics output into `analytics_snapshots` and `analytics_post_metrics`.
- Keep Sweetistics behind a source flag: `ANALYTICS_SWEETISTICS_ENABLED`.

Decision: Bird is the active X fallback. Sweetistics is optional historical enrichment, not the core collector.

## Implementation Phases

### Phase 1: Shell And Empty States

- Add `Analytics` to `workspaceShellNav`.
- Add one shared analytics icon to the existing platform/icon component system.
- Add `/dashboard/analytics` overview route with empty, loading, error, and source health states.
- Add platform route skeletons with metric availability cards.
- Add docs link from this plan into `docs/tasks.md`.

Acceptance:

- Left nav shows `Analytics`.
- All analytics routes render without data.
- Disconnected platforms explain what permission/source is needed.

### Phase 2: Data Foundation

- Add analytics tables and migrations.
- Add provider contract and in-memory fixture provider.
- Add normalization helpers for metrics and source labels.
- Add API routes for summary, platform detail, post detail, and manual pull.

Acceptance:

- Fixture provider can populate overview and one platform drilldown.
- API tests cover partial metrics, missing permissions, stale source, and provider errors.

### Phase 3: X First

- Add X native collector for post lookup metrics and analytics endpoint when available.
- Add Bird-backed X collector for authored posts, notifications, live public metrics, and inbound analytics.
- Add Sweetistics importer only if local dependency/source is available and the output format is confirmed.
- Map X Replies outreach metrics separately from X/Twitter inbound comments/mentions.

Acceptance:

- X/Twitter platform page shows owned post metrics.
- X Replies outreach gets its own analytics section, not mixed with inbound X/Twitter.
- Source labels distinguish `native`, `bird`, and `sweetistics`.

### Phase 4: Highest Value Native Platforms

- LinkedIn organization and member analytics.
- Instagram professional account and media insights.
- YouTube channel/video analytics.
- Facebook Page/post insights.
- Threads insights.

Acceptance:

- Each provider has fixtures and contract tests.
- UI shows metric gaps per platform instead of blank charts.
- Manual pull works for each connected native account.

### Phase 5: Long Tail Platforms

- Pinterest analytics.
- TikTok approved analytics or public counters only.
- Bluesky, Mastodon, Reddit, Google Business, WhatsApp, Discord, Telegram.

Acceptance:

- Each platform can report at least a minimal useful metric set or a clear "not available with current access" state.

### Phase 6: Reporting And Recommendations

- Add campaign and profile filters.
- Add best-time and best-format summaries.
- Add "make variant" from top post.
- Add weekly digest export.
- Add Social Agent answers over analytics context.

Acceptance:

- Dashboard can explain what worked this week and suggest next posts using real stored analytics.

## Tests

- Provider contract tests with realistic fixtures per platform.
- API route tests with mocked collectors, provider failures, and partial data.
- UI tests for overview, platform drilldown, empty states, stale source states, and permission-blocked states.
- Scheduler tests for idempotency, backoff, and duplicate run suppression.
- Regression tests that X Replies outreach metrics do not count as X/Twitter inbound comments.

## Open Questions

- Which LinkedIn products are approved on the current app: organization only, member analytics, or both?
- Which Meta permissions are approved for Instagram, Facebook, and Threads insights?
- Should analytics pulls be manual-only for MVP, or should the scheduler start immediately after a platform connects?
- Do we want to store full raw provider payloads forever, or prune raw JSON after 30 to 90 days while keeping normalized metrics?
- Should Sweetistics be installed locally or treated as a later import-only integration?

## Recommended Defaults

- Build native provider support first when official APIs exist.
- Build Bird-backed X analytics now.
- Delay Sweetistics until the Bird/X native path lands.
- Keep normalized metrics forever.
- Keep raw payloads for 90 days by default, configurable by `ANALYTICS_RAW_RETENTION_DAYS`.
- Show every metric with source and freshness.

## Sources

- X metrics: https://docs.x.com/x-api/fundamentals/metrics
- X post analytics: https://docs.x.com/x-api/posts/get-post-analytics
- LinkedIn organization share statistics: https://learn.microsoft.com/en-us/linkedin/marketing/community-management/organizations/share-statistics?view=li-lms-2026-03
- LinkedIn member analytics changes: https://learn.microsoft.com/en-us/linkedin/marketing/integrations/recent-changes?view=li-lms-2026-03
- YouTube Analytics reports query: https://developers.google.com/youtube/analytics/reference/reports/query
- Pinterest analytics use case: https://developers.pinterest.com/usecase/analyze/
- Instagram insights: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/insights
- Threads insights: https://developers.facebook.com/docs/threads/insights
- Facebook Page insights: https://developers.facebook.com/docs/graph-api/reference/page/insights
