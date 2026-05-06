# Content Engine Article Agent Plan

Last updated: 2026-05-05

## Decision

Build the article and Medium automation as a first-class module inside ClawPoster, not as a separate product yet.

The product boundary should be:

- **ClawPoster UI:** admin review, content queue, publishing controls, distribution analytics.
- **Content engine module:** research, article generation, image generation, framework validation, Medium-format export.
- **Future product option:** split into a standalone Content Studio only if non-social article workflows become the main demand.

This keeps the first version close to the existing social automation value: one system creates, validates, publishes, and repurposes content across blog, Medium, X, LinkedIn, and later newsletter.

## Non-Goals

- Do not automate the consumer ChatGPT web UI for production jobs.
- Do not silently autopublish first drafts.
- Do not make Medium the source of truth.
- Do not create a second app with separate auth, billing, settings, and content state yet.
- Do not let generated factual claims bypass source validation.

## Model Strategy

Use official APIs for production automation.

### Text

Primary text generation should use the OpenAI API through a server-side adapter.

Recommended env:

```env
BLOG_ARTICLE_MODEL=gpt-5.3
BLOG_ARTICLE_REVIEW_MODEL=gpt-5.3
OPENAI_API_KEY=
```

ChatGPT Max can still be useful for manual drafting, prompt experiments, and human review. It should not be treated as the production automation surface because browser/UI automation is brittle, hard to monitor, and not appropriate for a user-facing backend workflow.

### Images

Hero images should use the official Gemini / Imagen API through a server-side adapter.

Recommended env:

```env
GEMINI_API_KEY=
BLOG_IMAGE_MODEL=imagen-4
```

Generated images should be uploaded to R2 and saved as durable app URLs before publication.

### Research

Use a pluggable research layer.

Phase 1 can reuse the existing `medium-automation` service if configured:

```env
MEDIUM_AUTOMATION_API_URL=
MEDIUM_AUTOMATION_API_KEY=
```

Phase 2 should add native research adapters:

- web search provider
- RSS sources
- official documentation fetcher
- competitor blog scanner
- user-provided source URLs

## Architecture

Target module layout:

```text
src/lib/content-engine/
  agents/
    topic-scout.ts
    research-agent.ts
    article-agent.ts
    image-agent.ts
    editor-agent.ts
    distribution-agent.ts
  providers/
    openai-article-provider.ts
    gemini-image-provider.ts
    medium-automation-provider.ts
    web-research-provider.ts
  validation/
    source-of-truth-framework.ts
    evidence-gate.ts
    policy-gate.ts
  storage/
    article-assets.ts
    source-cache.ts
  workflows/
    generate-article.ts
    revise-article.ts
    publish-article.ts
    repurpose-article.ts
```

Existing `src/lib/blog/*` can either stay as the blog-specific facade or move under `content-engine` once the module expands beyond blog publishing.

## Quick Generation Controls

The article view should expose a compact preset bar plus an advanced popover. Do not turn every Medium automation setting into permanent chrome.

### High-use controls

Always visible near the prompt composer:

- Length preset: Short / Standard / Deep / Custom. The current backend is word-count based, so a character UI should convert roughly to words (`chars / 6`) until native character targeting exists.
- Research: on/off. Default on for new factual articles; off for opinion, rewrite, or provided-source-only drafts.
- Sources section: on/off. Default on when research is enabled or source URLs are provided.
- Hero image: Agent / Use URL / None. Default Agent for publishable drafts, None for fast outline/rewrite.
- Format: Medium / Blog / Source-of-truth / Thread seed. Medium stays default.

### Advanced popover controls

Put these behind a “Generation options” button:

- Writer model/provider. Useful, but not high-frequency enough for top-level UI. Avoid a fake dropdown unless the request path actually honors it.
- Image model: Gemini image / OpenAI image / Existing URL / None.
- Image overlay: on/off. Default on for Medium/social-ready hero images.
- Tone/voice: Max builder, technical explainer, founder essay, practical guide.
- SEO/AEO: on/off. Default on for public articles.
- Bio/footer: on/off. Default on for Medium export, off for internal blog drafts if the site already has author chrome.
- Iterations/quality: Fast draft / Balanced / Max quality. Maps to max iterations 1 / 3 / 5.
- Language.

### Format suggestions from the Medium automation repo

Offer these as article format presets rather than raw template IDs:

- Source-of-truth article: direct answer, thesis/tension, definitions, comparison, checklist, FAQ, sources, action close.
- Practical builder guide: problem, constraints, implementation steps, trade-offs, mistakes, checklist.
- Opinionated founder essay: narrative hook, argument, counterargument, operating lesson, action close.
- Research-backed explainer: direct answer, evidence map, examples, limitations, FAQ, sources.
- Product/update article: what changed, why it matters, how to use it, examples, rollout notes, next actions.
- Medium-ready export: Markdown, hero image, inline links, sources, footer/bio.

### Current implementation note

`/dashboard/articles/new` currently only sends `prompt` and `targetWords` to `/api/article/create`. That route forwards only `topic`, `length`, and `save` to Medium automation `/api/articles/streamlined`. The richer Medium automation controls already exist in the standard `/api/articles/generate` path and prompt-pack (`template`, `length`, `tone`, `style`, `language`, `voice`, `seo`, `images`, `image_size`, `image_quality`, `image_overlay`, `links`, `research`, `sources`, `footer`, `format`, `iterations`, `provider`), but the streamlined path does not honor most of them yet. Next implementation should either expand `/api/article/create` + streamlined payload support, or switch to the standard generation endpoint when advanced controls are used.

## Workflow

### 1. Topic Scout

Inputs:

- manual admin topic
- product keywords
- RSS feeds
- competitor gaps
- platform trends
- user questions
- feature release notes

Output:

- topic
- target reader
- core query
- misconception or tension
- source search plan
- risk level

### 2. Research Agent

Responsibilities:

- collect primary sources
- collect official docs and original datasets where available
- identify dates, named entities, frameworks, tools, companies, and numbers
- identify counterexamples and limitations
- reject weak source sets

Output:

- source list
- extracted claims
- source excerpts or summaries
- evidence map
- unresolved verification gaps

### 3. Article Agent

Responsibilities:

- generate the article with the 11/10 source-of-truth framework
- include the direct answer block immediately after the title
- alternate narrative, structured, definition, quantified, comparison, checklist, FAQ, and conclusion sections
- avoid forbidden phrases
- include the reality contact section
- include action steps

Output:

- title
- slug
- excerpt
- direct answer
- markdown body
- citations/source links
- FAQ blocks
- action blocks
- image prompt

### 4. Image Agent

Responsibilities:

- generate a hero image from the article thesis, not a generic decorative image
- avoid dark, blurred, stock-like visuals
- create alt text
- upload to R2
- attach public URL to the draft

Output:

- image URL
- alt text
- prompt metadata
- model metadata

### 5. Editor Agent

Responsibilities:

- validate the framework
- rate the article
- rewrite until the draft reaches pass or stops with a clear failure reason
- separate hard blockers from soft warnings

Hard blockers:

- missing 40 to 60 word direct answer block
- answer block not immediately after title
- missing image
- fewer than three sources
- forbidden phrase hit
- no reality contact
- unsupported factual claims
- legal, medical, financial, or reputational-risk content without stronger review

### 6. Admin Review

Admin can:

- preview article
- regenerate article
- regenerate hero image
- request changes
- approve
- publish to ClawPoster blog
- export Medium-ready markdown
- archive

Default state is always review-first. Autopublish is a later opt-in setting per source/template, not a global default.

### 7. Distribution Agent

After article approval:

- create X thread
- create LinkedIn post
- create short newsletter teaser
- create Medium-ready version
- optionally create carousel/image snippets later

Distribution drafts should land in the existing social post composer or a content distribution queue, not publish automatically.

## Data Model

Current v1 already has:

- `blog_automation_posts`
- `blog_automation_runs`

Add later when workflows grow:

```text
content_sources
  id
  source_url
  canonical_url
  title
  publisher
  author
  published_at
  fetched_at
  content_hash
  extracted_text
  metadata
  status
  error
  created_at
  updated_at

content_assets
  id
  post_id
  kind
  provider
  model
  prompt
  public_url
  storage_key
  alt_text
  metadata
  created_at

content_reviews
  id
  post_id
  reviewer_email
  status
  notes
  framework_score
  framework_json
  created_at
```

Keep `posts` / `post_targets` for social publishing only. Blog/article state should stay separate and feed social drafts after approval.

## Admin UI

Current admin entry:

- `/admin/blog`
- `/admin/blog/[id]`

Expand into:

- `/admin/blog`
  - queue
  - generate article form
  - daily worker state
  - model/provider status
- `/admin/blog/[id]`
  - article preview
  - source list
  - framework checks
  - image preview
  - revision actions
- `/admin/blog/runs`
  - agent runs
  - errors
  - model/provider cost
- `/admin/blog/sources`
  - source URLs
  - RSS/competitor feeds
  - allowlist/blocklist

Later user-facing route:

- `/dashboard/content`
- `/dashboard/content/articles`
- `/dashboard/content/distribution`

## API Routes

Current routes:

- `POST /api/admin/blog/generate`
- `POST /api/admin/blog/[id]/publish`
- `POST /api/admin/blog/[id]/archive`
- `GET /api/cron/blog-daily`

Add next:

- `POST /api/admin/blog/[id]/revise`
- `POST /api/admin/blog/[id]/generate-image`
- `POST /api/admin/blog/[id]/validate`
- `POST /api/admin/blog/[id]/export-medium`
- `POST /api/admin/blog/[id]/repurpose`
- `POST /api/admin/blog/sources/import`
- `GET /api/admin/blog/runs`

## Environment

Required for production article/image automation:

```env
OPENAI_API_KEY=
BLOG_ARTICLE_MODEL=gpt-5.3
BLOG_ARTICLE_REVIEW_MODEL=gpt-5.3

GEMINI_API_KEY=
BLOG_IMAGE_MODEL=imagen-4

R2_PUBLIC_BASE_URL=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
S3_BUCKET_NAME=
S3_ENDPOINT_URL=

BLOG_AUTOMATION_DAILY_ENABLED=false
BLOG_AUTOMATION_TOPIC_PROMPT=
BLOG_AUTOMATION_TARGET_WORDS=2200
```

Optional bridge to the existing local Medium automation service:

```env
MEDIUM_AUTOMATION_API_URL=
MEDIUM_AUTOMATION_API_KEY=
```

## Safety And Cost Controls

- Require admin auth for all manual generation.
- Require `CRON_SECRET` for cron execution.
- Cap daily automatic generation to one draft per day.
- Add per-run cost metadata.
- Store provider/model/prompt version on every run.
- Do not autopublish without explicit approved state.
- Block publish on validation `fail`.
- Warn on validation `warn`.
- Use source allowlists before enabling any future autopublish.
- Keep generated images in app-owned storage, not transient provider URLs.

## Rollout Plan

### Phase 1: Native Article Provider

- Add OpenAI article provider.
- Keep Medium automation provider as optional fallback/bridge.
- Add prompt pack for the 11/10 framework.
- Store model, prompt version, token/cost metadata in run output.
- Add tests for provider request shaping and validation gates.

### Phase 2: Image Provider

- Add Gemini/Imagen provider.
- Add R2 upload for generated image output.
- Add admin button to regenerate hero image.
- Article workspace preview reads image provenance from `version.json` and displays provider/model/status when present.
- Test missing image, failed image generation, and successful R2 upload with mocked provider.

### Phase 3: Research Agent

- Add source URL import.
- Add RSS and official-doc search adapters.
- Add evidence map schema.
- Add hard source-count and source-quality gate.
- Add unresolved-claim warnings.

### Phase 4: Editor Loop

- Add revise/regenerate action.
- Article workspace preview reads Medium-style `rating` / `rating_model` / `iterationCount` from `overview.md`, `rating.md`, `workflow.json`, `version.json`, or eval JSON, then shows the rating as number plus model in overview cards.
- Add framework score history.
- Add change notes.
- Add pass/warn/fail diff between revisions.

### Phase 5: Distribution

- Generate X thread and LinkedIn draft from approved article.
- Push drafts into existing post composer queue.
- Add Medium-ready markdown export.
- Add newsletter teaser later.

### Phase 6: Productization Decision

Revisit separate product only if:

- non-social article customers appear
- article workflow needs separate billing
- editorial teams need independent approval workflows
- Medium/blog automation becomes larger than social posting

Until then, keep it inside ClawPoster.

## Tests

Unit:

- framework validator pass/warn/fail
- forbidden phrase hard fail
- direct answer length and position
- source count gate
- image required gate
- model provider request payloads
- cost metadata normalization

Integration:

- admin generate route creates draft
- daily cron skips when disabled
- daily cron creates only one draft per day
- publish route blocks validation fail
- publish route exposes approved article on `/blog/[slug]`
- sitemap includes published dynamic articles

E2E:

- admin generates article
- admin reviews framework checks
- admin publishes
- public blog renders title, image, answer block, sources, FAQ
- social repurposing creates draft posts only

## Open Decisions

- Which OpenAI model should be the default article model in production once current key access is verified?
- Should Gemini/Imagen be the only image provider, or should OpenAI image generation stay as a fallback?
- Should Medium be copy/export only, or should we add browser-assisted posting later?
- Should source research use a paid search API, the existing Medium automation research layer, or both?
- Should approved articles create social drafts automatically, or only after clicking “repurpose”?
