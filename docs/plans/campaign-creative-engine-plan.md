---
read_when:
  - implementing Campaigns
  - changing profile workspace, image generation, or calendar media flows
  - connecting Gemini image generation to social platform crops
---

# Campaign Creative Engine Plan

Last updated: 2026-04-22

## Goal

Build Campaigns as a profile-owned creative engine:

```text
profile DNA + website + assets + channel rules
  -> campaign brief
  -> oversized master image
  -> editable text/image layers
  -> platform crops
  -> calendar drafts per selected platform
```

The core product behavior is many campaigns per workspace, each campaign tied to one selected profile. A campaign generates image concepts from that profile, lets Max select one source image, edit header/description/CTA overlays on canvas, approve or deny creative versions, optionally animate, then apply the approved rendition to the calendar for each platform with the correct image size.

## Intent From Screenshots

The target UI has two connected surfaces:

- Campaign gallery: a campaign summary on the left, creative cards in a row, an Add Creative action, per-creative menu, and quick actions such as Animate and Edit.
- Creative editor: large canvas on the left with version history, image preview, editable header/description/CTA layers, and a right inspector with Image, Header, Description, and Call To Action accordions.

The generated image should not be a tight final crop. It should be an oversized square source with the subject/object pulled back and centered, leaving enough environment around it to crop cleanly for Instagram portrait, Instagram square, X landscape, LinkedIn landscape, Pinterest vertical, and other outputs.

## Current Implementation Review

Useful current files:

- `src/app/dashboard/campaigns/page.tsx`
- `src/components/profiles/profile-campaigns-dashboard.tsx`
- `src/components/profiles/profile-campaign-editor.tsx`
- `src/components/profiles/profile-workspace-config.ts`
- `src/lib/platform-specs.ts`
- `src/db/schema.ts`
- `src/components/platform-post-preview.tsx`

What exists now:

- Campaigns are shown under `/dashboard/campaigns`.
- A profile selector exists, so a campaign can be edited in the context of a profile.
- Campaign data is currently stored as markdown inside the profile workspace config under hidden `channels/campaigns/.../campaign.md` paths.
- The editor is a useful prototype: header, description, visual prompt, image seed, animation, and crop previews.
- Platform sizes already live in `src/lib/platform-specs.ts`.

Gaps:

- Campaigns are not first-class DB rows.
- Campaigns cannot yet select connected platforms and push approved renditions to the calendar.
- Generated image assets, layers, crops, approvals, and version history are not persisted separately.
- The editor preview is not yet the same render pipeline that will produce the final posted image.
- The current markdown campaign storage is good for planning, but it should become an optional campaign notes layer after the DB model exists.

## Backend Reference From Nerdy

Reference repo: `https://github.com/alediez2048/nerdy`

Useful patterns to borrow:

- `app/api/routes/campaigns.py`: campaign CRUD with user ownership and aggregate stats.
- `app/api/routes/sessions.py`: a campaign can launch async generation sessions and expose progress plus previews.
- `iterate/ledger.py`: append-only JSONL ledger for generation, evaluation, regeneration, and decisions.
- `generate/visual_spec.py`: structured visual spec extraction before image generation.
- `generate/image_generator.py`: anchor, tone shift, and composition shift image variants.
- `evaluate/image_selector.py`: score variants and select the winner.
- `generate/aspect_ratio_batch.py`: extra ratio generation for final winners.

How to adapt it here:

- Keep `social-poster` in Next.js/TypeScript instead of copying FastAPI.
- Port the concepts: campaign, generation session, visual spec, variants, score, decision ledger.
- Prefer cropping from one approved master image. Regenerate per aspect ratio only when the crop evaluator says the master image cannot satisfy a platform.

## Product Model

```text
workspace
  has many profiles
  has many campaigns

profile
  has business DNA, website notes, tone, assets, skills, memory, knowledgebase

campaign
  belongs to workspace
  belongs to profile
  has name, brief, objective, status, selected platforms
  has many creatives

creative
  belongs to campaign
  has source image, prompt, visual spec, scores, status
  has many editable layers
  has many platform renditions

rendition
  belongs to creative
  targets one platform + format + size
  stores crop box, exported media URL, validation status
  can create or update calendar drafts
```

## Data Model

Add these tables after the current profile/calendar schema is stable:

```text
campaigns
  id
  workspace_id
  profile_id
  owner_user_id
  name
  brief
  objective
  status draft | generating | review | approved | scheduled | archived
  selected_platforms_json
  selected_creative_id nullable
  metadata_json
  created_at
  updated_at

campaign_generation_sessions
  id
  campaign_id
  status pending | running | completed | failed | canceled
  input_snapshot_json
  model_config_json
  result_summary_json
  error
  ledger_path nullable
  created_at
  completed_at nullable

campaign_creatives
  id
  campaign_id
  generation_session_id nullable
  title
  source_prompt
  visual_spec_json
  image_model
  source_image_url
  source_image_width
  source_image_height
  source_focal_point_json
  source_safe_zone_json
  score_json
  status draft | review | approved | denied | archived
  created_at
  updated_at

campaign_layers
  id
  creative_id
  kind image | header | description | cta | logo | shape
  text
  media_url nullable
  x
  y
  width
  height
  rotation
  font_family
  font_size
  line_height
  color
  background_color nullable
  visible
  locked
  z_index

campaign_renditions
  id
  creative_id
  platform_type
  format
  width
  height
  aspect_ratio
  crop_json
  layer_overrides_json
  exported_media_url
  validation_json
  status draft | ready | applied | failed
  post_id nullable
  post_target_id nullable
  created_at
  updated_at

campaign_events
  id
  campaign_id
  creative_id nullable
  event_type
  payload_json
  actor_user_id nullable
  created_at
```

## Generation Pipeline

1. User opens Campaigns and selects a profile.
2. App builds a profile snapshot from business DNA, website notes, tone/language files, assets, skills, platform rules, and any campaign prompt.
3. Text model produces a campaign brief, platform angle, visual spec, and overlay candidates.
4. Gemini image model generates 3 to 5 master source variants:
   - anchor
   - tone shift
   - composition shift
   - optional brand/style variation
   - optional asset-reference variation
5. Each source image is generated as a high-resolution square with overscan. Prompt rule: subject centered, camera pulled back, no baked text unless explicitly requested, leave usable negative space.
6. Evaluator scores each source image:
   - prompt adherence
   - brand/profile fit
   - subject/focal point centered
   - crop safety across required platform sizes
   - overlay legibility potential
   - policy/platform risk
7. User selects a creative or asks for more versions.
8. User edits layers directly on the canvas.
9. Rendition exporter crops from the source image, composes overlays, validates each platform output, and stores exported media.
10. Apply to Calendar creates one draft post with post targets, or separate drafts if captions/media must diverge per platform.

## Gemini Image Model

Use Google GenAI SDK with model configured by env:

```text
GEMINI_IMAGE_MODEL=gemini-3.1-flash-image-preview
GEMINI_IMAGE_FALLBACK_MODEL=gemini-2.5-flash-image
```

Official docs currently describe Nano Banana 2 as `gemini-3.1-flash-image-preview`, Nano Banana Pro as `gemini-3-pro-image-preview`, and older Nano Banana as `gemini-2.5-flash-image`. They also show JavaScript image generation through `@google/genai` and image bytes returned in `inlineData`.

Implementation files:

```text
src/lib/campaigns/profile-snapshot.ts
src/lib/campaigns/visual-spec.ts
src/lib/campaigns/gemini-image.ts
src/lib/campaigns/evaluate-creative.ts
src/lib/campaigns/render-rendition.ts
src/app/api/campaigns/route.ts
src/app/api/campaigns/[id]/route.ts
src/app/api/campaigns/[id]/generate/route.ts
src/app/api/campaigns/[id]/apply-to-calendar/route.ts
```

## Image And Crop Rules

Master source:

- Generate square, high-resolution source image.
- Keep important object inside central 60 percent safe zone.
- Leave additional environment around the object for platform crops.
- Store original dimensions and show original size in the UI.
- Keep text as editable overlay layers, not baked into the generated image by default.

Crop/render:

- One source image can produce many platform renditions.
- Crop box is stored as normalized `x`, `y`, `width`, `height`, and `scale`.
- Each platform preview uses the exact same render function as export.
- Recommended size chips open the platform preview and update crop/layer bounds.
- Exported media is validated for dimensions, file size, format, and platform-specific limits before calendar apply.

Regeneration rule:

- If a target crop would cut off the subject or make overlay text illegible, regenerate a new source variant or a platform-specific variant.
- Do not regenerate every aspect ratio by default. That wastes money and makes the creative less consistent.

## Platform Outputs

Use `src/lib/platform-specs.ts` as the app source of truth and reconcile it against official docs.

Initial required outputs:

| Platform | Formats to support first | Size |
| --- | --- | --- |
| Instagram Feed | square, portrait, landscape | 1080x1080, 1080x1350, 1080x566 |
| Instagram Story/Reel cover | vertical | 1080x1920 |
| X | landscape, square | 1200x628 or 1200x675, 1200x1200 |
| LinkedIn | landscape, square | 1200x628, 1200x1200 |
| Pinterest | standard pin | 1000x1500 |
| Reddit | link/image post | 1200x628 |

Important source notes:

- Instagram API image publishing requires JPEG, 8 MB max, and aspect ratio within 4:5 to 1.91:1. Stories and Reels covers should use 9:16 to avoid cropping.
- Pinterest recommends 2:3, or 1000x1500 pixels, and warns that taller ratios may be cut off in feeds.
- LinkedIn recommends 1200x628 for 1.91:1 landscape and 1200x1200 for square single-image ads.
- X image ads use 1.91:1 or 1:1 for website/standalone image ads. X also recommends 1200x1200 for 1:1 and 1200x628 for 1.91:1 standalone image ads.

## UI Plan

Campaigns list:

- Top control: Profile selector.
- Campaign cards grouped by selected profile.
- Empty state only says "No campaigns yet" and shows the create action.
- Campaign card shows title, status, selected platforms, selected creative thumbnail, last updated.
- Create campaign opens a profile-bound campaign wizard.

Campaign gallery:

- Back to Campaigns.
- Left summary card with campaign name and brief.
- Main row/grid of creative cards.
- Add Creative creates a new generation session or manual creative.
- Creative card actions: Select, Edit, Animate, Deny, Archive.

Creative editor:

- Left: exact render canvas.
- Top: version history and previous/next version controls.
- Canvas supports drag/resize for overlay layers.
- Right inspector:
  - Image: source thumbnail, original dimensions, focal point, safe zone.
  - Header: text, font, size, line height, color, visible/hidden.
  - Description: same controls.
  - CTA: text, position, style, generate action.
- Bottom or side: platform size chips. Clicking a size previews that exact final crop and render.
- Export/download uses the same render pipeline as calendar apply.

Markdown files:

- Keep rich markdown editing in profile workspace.
- Campaign docs can still exist as `campaign.md`, but DB rows own state.
- Markdown can be used for notes, briefs, creative direction, and review comments.
- Rich markdown should support headings, tables, checklists, links, code blocks, and image references.

## API Plan

```text
GET    /api/campaigns?profileId=...
POST   /api/campaigns
GET    /api/campaigns/:id
PATCH  /api/campaigns/:id

POST   /api/campaigns/:id/generate
GET    /api/campaigns/:id/events

POST   /api/campaign-creatives/:id/select
PATCH  /api/campaign-creatives/:id
POST   /api/campaign-creatives/:id/render
POST   /api/campaign-creatives/:id/renditions

POST   /api/campaigns/:id/apply-to-calendar
```

`apply-to-calendar` should accept:

```json
{
  "creativeId": "creative_...",
  "targets": [
    {
      "platformId": "platform_...",
      "platformType": "instagram",
      "format": "Feed",
      "size": "1080x1350",
      "caption": "..."
    }
  ],
  "scheduledAt": "2026-04-24T09:00:00-04:00"
}
```

## Implementation Slices

### Slice 1: Clean Product Shape

- Remove explanatory campaign copy from dashboard header.
- Keep profile selector at top.
- Update docs with this plan.

Acceptance:

- Campaign dashboard no longer says "Campaigns are generated..." or "0 for this profile / 0 total".
- Plan exists in `docs/plans`.

### Slice 2: First-Class Campaign Data

- Add campaign tables and migrations.
- Move new campaign creation from profile config into DB.
- Keep old markdown campaign entries as a migration/import path.

Acceptance:

- Campaign can be created for a selected profile.
- Campaign remains after refresh.
- Campaign list can filter by profile.

### Slice 3: Creative Generator Backend

- Add profile snapshot builder.
- Add Gemini image route.
- Store generation sessions, creatives, visual specs, and events.
- Add mock mode for local/dev when `GEMINI_API_KEY` is missing.

Acceptance:

- Generate creates 3 variants.
- Each creative has source image URL, dimensions, prompt, and score.
- Generation can be replayed from event history.

### Slice 4: Canvas And Layer Editor

- Replace preview-only poster with an exact render canvas.
- Add drag/resize for image crop and text layers.
- Persist layer positions.

Acceptance:

- Header, description, and CTA can move on the canvas.
- Inspector edits update canvas immediately.
- Refresh keeps layer data.

### Slice 5: Platform Renditions

- Add platform size chips from `PLATFORM_SPECS`.
- Add original-size chip.
- Render/export exact PNG or JPEG for selected platform.
- Validate dimensions and file size.

Acceptance:

- Clicking 1080x1350 previews the actual Instagram portrait output.
- Exported file has exact dimensions.
- The preview and exported media match pixel-for-pixel except compression.

### Slice 6: Calendar Apply

- Add platform target selector.
- Create or update post and post targets with selected rendition media.
- Keep campaign, creative, and rendition IDs in post metadata.

Acceptance:

- Approved creative can create calendar drafts per selected platform.
- Draft preview matches campaign rendition.
- Post detail links back to campaign and creative.

## Tests

Minimum:

- campaign CRUD is workspace/profile scoped
- generation creates campaign events and creatives
- profile snapshot includes profile workspace files
- platform rendition picks sizes from `PLATFORM_SPECS`
- crop math keeps normalized crop inside source image bounds
- rendered image dimensions match selected size
- apply-to-calendar creates post targets and stores campaign metadata
- refresh keeps campaign, creative, layer, and rendition state

## Open Decisions

- Whether to store generated media locally first or directly in R2/S3.
- Whether animation is GIF/video generation or CSS-style motion rendered later.
- Whether campaign markdown remains in the profile filesystem or becomes a notes tab attached to the DB campaign.
- Whether to use one post with many post targets or separate posts when captions diverge heavily.
- Whether to keep `gemini-3.1-flash-image-preview` as default or route anchor images to `gemini-3-pro-image-preview`.

## Sources

- Google AI Developers, Nano Banana image generation: https://ai.google.dev/gemini-api/docs/image-generation
- Meta Instagram Platform media reference archive: https://archive.ph/20251231074512/https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media
- Pinterest Business product specs: https://help.pinterest.com/en/business/article/pinterest-product-specs
- LinkedIn single image ad specs: https://business.linkedin.com/advertise/ads/sponsored-content/single-image-ads-specs
- X Ads creative specs: https://business.x.com/en/help/campaign-setup/creative-ad-specifications-old
- Nerdy backend reference: https://github.com/alediez2048/nerdy
