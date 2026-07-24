# X Posts

Date: 2026-04-08

## Decision

For X news reposts:

- use the source OG image first
- do not generate a custom infographic by default
- do not make SVG or PNG drafts unless the OG image is unusable
- use a GIF only when the source already is a GIF or motion is the whole point

## Why

X is speed lane.

- fast to ship
- lower design overhead
- closer to source context
- good enough for most news reposts

## Media Rule

Use the OG image when:

- image is clear
- crop is acceptable
- text is readable
- branding is not overpowering

Do not use the OG image when:

- it is ugly
- text is tiny
- it is just a logo block
- it breaks badly in feed

Fallback only then:

- padded square image using OG image inside
- simple title card
- or skip image and post text only

## Categories

### 1. News Repost

Default lane.

- media: OG image
- copy: short take + why it matters

### 2. Diagram / Explainer Repost

For posts like the attached RAG graphic.

- media: original image or GIF from source
- copy: one insight, not a summary dump

### 3. Benchmark / Claim

- media: source chart or OG image
- copy: what to trust, what to ignore

### 4. Product Drop

- media: launch OG image
- copy: who this is for

### 5. Opinion / Take

- media: optional
- copy: strongest framing

### 6. Portable Account / Ecosystem Signal

For posts where the source is really about account portability, model access, agent tools, or workflow ecosystems.

- media: optional
- copy: name the concrete platform implication and tie it to workflow quality
- strongest approved angles:
  - open platform signal: the account becomes portable infrastructure across tools
  - product confidence: letting users bring access into other tools is a bet that the first-party experience can still win
  - ecosystem formation: model first, account second, many workflow tools on top

Example:

`This is a platform signal. If your ChatGPT account works inside more coding tools, the account becomes the access layer and the tools compete on workflow quality: repo context, review flow, memory, and speed to landed change.`

### 7. Video Repost With Attribution

For a source video worth resharing because the media itself carries the proof or demo.

- media: repost the source video when rights/context are acceptable
- copy: add one clear interpretation above the video
- attribution: mention the source account in copy or first reply when the source account adds trust
- first reply can hold the source URL when the main X post needs a clean visual

Example:

`Qwen winning this kind of agent loop matters as a cost curve signal. Long self-improvement loops are where cheap frontier-ish inference starts changing product design.`

Source reply:

`Source: @atomic_chat_hq https://x.com/atomic_chat_hq/status/2057581603811901882`

### 8. Bookmark-Worthy Repo Find

For high-signal GitHub/tool posts where the goal is saves/bookmarks, with the repo as the hero.

- find the repo from the X post or screenshot
- verify useful signals: stars, recent commits, README clarity, install path, license
- post the direct repo link when the repo is the useful object
- copy should answer: what it does, who should save it, why it matters now
- attribution to the X poster is optional; attribution to the repo/project is usually better

Example:

`Save this if you burn free LLM credits while prototyping. FreeLLMAPI wraps provider free tiers behind an OpenAI-compatible endpoint with failover, so small experiments can keep running before paid infra makes sense.`

## Copy Format

Use:

`hook. core take. why it matters.`

Rules:

- 1 to 3 sentences
- no thread by default
- no list dump in the tweet
- image carries detail; copy carries angle

## Drafts

### A. Attached RAG Image

Use attached image as-is on X.

Draft:

`wild. most “agentic rag” systems are really just orchestration around retrieval, memory, and tools. the split between planner and fetch path is where these either feel sharp or fall apart.`

Alt text:

`Dark diagram titled “How Agentic RAG Works.” A user prompt flows into an aggregator agent, which connects to memory, planning, model calls, and external tools like local data, web search, and cloud platforms.`

### B. News Repost

Use source OG image.

Draft:

Draft from the verified headline and source facts. Add a personal implication only when Max supplied or approved it.

### C. Benchmark Claim

Use source chart / OG image.

Draft:

`interesting. <claim>. i care less about the headline number and more about what changed in the setup, eval, and cost curve.`

## Final Rule

If reposting news on X:

- OG image first
- custom asset only if OG image is bad
