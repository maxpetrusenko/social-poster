# Max Language and Future Posts Audit — 2026-07-22

## Rule source

The rejected standard and phrases were agent-authored. The sentence-level editorial rule was introduced in the Gauntlet formatting task after Max questioned `actually inherit` and `unusually concrete`. It was not recovered from Max's earlier wording.

Related older Social Poster tasks did contain narrower user requirements: source-backed copy, useful rather than empty title repetition, no invented claims, and media on X/LinkedIn. Agents later expanded those requirements into named-account styles, rhetorical bans, mandatory post shapes, and a generic “Max voice” rubric.

## Conversation and public-post evidence

- Searched the recent Codex task inventory and read the discovered Social Poster/X/Gauntlet writing tasks.
- Read known user corrections in the Social Poster workflow task.
- Sampled 120 current X timeline items with Bird.
- Public X history mixes generated posts and self-written posts, so it is not a clean personal-language corpus.
- Short, clearly self-written examples were recorded as observations only, not permanent style rules.

## Durable changes

- Global X-posting skill now uses language provenance instead of a manufactured voice rubric.
- Repo X writer/reviewer instructions remove named-account imitation and rhetoric enforcement.
- Feed writer no longer asks for a “builder takeaway” or invented personal implication.
- Deterministic fallback no longer emits `HN gives one concrete signal` plus `Builder takeaway`.
- Content-language documentation records `max_written`, `max_approved`, `source_required`, and `generated_uncertain`.

## Production schedule audit

Enabled schedules:

- `post-x-linkedin-11am`: dynamic source-driven image post.
- `post-x-linkedin-1pm`: dynamic source-driven image post.
- `post-x-linkedin-3pm`: dynamic source-driven image post.
- `gauntlet-ai-referral-tue-thu`: fixed Gauntlet X + LinkedIn post, Thursdays at 2:30 PM ET.

Production changes:

- Gauntlet fixed bank replaced with 10 factual X variants and 10 factual LinkedIn variants.
- X and LinkedIn media changed to `https://gauntletai.com/images/og-image.jpg`.
- Dynamic RSS transformation removed mandatory `why it matters` framing and now requires source facts plus language provenance.
- X and LinkedIn fallback templates no longer contain `{{whyMatters}}`.

Backups:

- `/data/backups/social-poster-before-max-language-reset-20260722.db`
- `/data/backups/social-poster-before-language-provenance-rss-20260722.db`

## Queue and publish proof

- Scheduled/approved future post rows: 0.
- Published rows in the 30 minutes around the audit: 0.
- Public health: database OK, 4 enabled schedules, 4 runtime registrations, drift 0.
- Gauntlet image returned HTTP 200.

## Remaining boundary

The X-liked autopost worker is enabled in production and has no scheduled item now. A clean patch was rebuilt from deployed `HEAD`, independently of the dirty worktree, and committed in a detached worktree as `06ed2bb` (`fix: ground social copy in language evidence`). Focused tests, typecheck, focused lint, and diff check pass there. It is not pushed or deployed. Do not claim the X-liked runtime prompt changed until Max approves pushing the scoped commit and the production image/canary proves it.
