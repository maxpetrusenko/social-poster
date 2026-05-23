---
read_when:
  - changing platform capability checks
  - debugging why a post published as text, image, video, thread, or source share
  - adding a new social account provider
---

# Capability Decision Flow

Last updated: 2026-05-23

Visual HTML version: `docs/plans/capability-decision-flow.html`

## Capability Graph

```mermaid
flowchart LR
  W["workspace"] --> A["platform account"]
  A --> C["credential"]
  A --> G["capability graph"]
  G --> T["publish.text"]
  G --> I["publish.image"]
  G --> V["publish.video"]
  G --> L["publish.long_text"]
  G --> R["publish.reply"]
  G --> S["publish.source_share"]
  T --> E["evidence + confidence"]
  I --> E
  V --> E
  L --> E
  R --> E
  S --> E
  E --> D["publish decision"]
```

## Liked X Post Decision

```mermaid
flowchart TD
  Like["Max likes a post"] --> Fetch["Bird fetches liked post"]
  Fetch --> Lane{"classify lane"}
  Lane --> Repo["repo/bookmark"]
  Lane --> Launch["source-owned launch"]
  Lane --> Video["video/demo"]
  Lane --> Opinion["opinion/commentary"]
  Lane --> Risk["controversy filter"]
  Risk -->|high risk| Stop["skip + log reason"]
  Risk -->|AI-relevant| Media
  Repo --> Media{"media plan"}
  Launch --> Media
  Video --> Share["source-share: X embeds source URL; LinkedIn uploads video"]
  Opinion --> Media
  Media -->|X image/video attached| Snapshot["snapshot image only"]
  Media -->|external/GitHub link| OG["resolve Open Graph image"]
  Media -->|no media| Text["text/source post"]
  Share --> Caps["load target capabilities"]
  Snapshot --> Caps
  OG --> Caps
  Text --> Caps
  Caps --> Plan{"allowed by account?"}
  Plan -->|yes| Preview["preview + decision log"]
  Plan -->|no| Block["block with reason"]
  Preview --> Publish["publish only if worker enabled or Max explicitly asks"]
```

## Capability Keys

Current V0 keys:
- `publish.text`
- `publish.image`
- `publish.video`
- `publish.reply`
- `publish.schedule`
- `publish.thread`
- `publish.long_text`
- `publish.link_preview_image`
- `publish.source_share`

Each key has:
- `status`: `supported`, `unsupported`, `unknown`, or `degraded`
- `confidence`: `observed`, `verified`, `operator_confirmed`, `config`, or `provider_default`
- `evidence`: raw check output, publish outcome, operator note, or provider default

## Max X Account

Known rules:
- `publish.long_text` is a Max account capability, not a global X assumption.
- liked-post X publishing uses single long posts when possible.
- video/demo likes should source-share on X so the original post embeds, then reply with source attribution. LinkedIn should upload the copied video file natively and put source attribution in the first comment because LinkedIn does not embed the X video from the source URL.
- source-owned launches stay attributed to the source account.
