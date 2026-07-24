# Weekly YouTube to Medium Hermes Flow

Last updated: 2026-07-21

## Recovered Thread Intent

Max's goal in the June 2026 thread was not a one-off Medium article. The intended product is a Hermes-owned article factory:

1. Max adds a YouTube video to the Medium/Create Article playlist, or likes a video that is explicitly eligible.
2. Hermes on max-mini polls every 6 hours and processes at most one new eligible source.
3. The source transcript and visual storyline drive a standalone story article, not a video recap.
4. A five-agent pipeline separates source research, editorial strategy, article writing, and adversarial review. Before strategy or drafting, research must pass the 20-source gate defined below. Review `article-v1.md`, allow at most two targeted writer revisions, and stop at `article-v3.md` with a pass or explicit human-resolution blocker.
5. The package exports a phone-openable public noindex preview at `https://www.maxpetrusenko.com/medium/<slug>/`.
6. Hermes notifies Max in Matrix with review instructions. Current valid approval transport is signed approval/reject links, or a proven live Matrix reply watcher for the exact article thread. A plain text request to reply `APPROVE`, `DENY`, or `REVIEW <notes>` is not valid unless that watcher is running and updates `workflow.json`.
7. Only after Max approves, Hermes uses the already-open headed Medium session on mini to create or update the draft with rich formatting and hosted images. Prefer GStack/Chrome-for-Testing when that is the live logged-in Medium surface; if normal Google Chrome is already open, logged in, and visible on mini, use that exact window instead of declaring a stale GStack blocker or opening a new browser.
8. Only after the Medium draft is correct, Hermes schedules it by visible Medium UI clicks and proves the scheduled row in Medium Stories.
9. Completion means proof exists on every required surface: package metadata, public preview, Matrix notification, Medium draft/save state, and Medium scheduled row when scheduling was requested.

Non-goals:

- Codex app recurring automation.
- First-draft autopublish.
- Headless browser mutation when Max asked to watch the headed GStack browser.
- Internal workflow status counted as proof without public/Medium UI evidence.

## Done Definition

The workflow is done for a source only when the current phase has real evidence:

| Phase | Required evidence | Hard fail if missing |
| --- | --- | --- |
| Source detected | playlist/liked-video ID, source URL, source title, channel, discovery timestamp in `workflow.json` | no package should be generated from a guessed topic |
| Transcript captured | transcript or timedtext fallback saved under `sources/youtube/transcript.md`; blocker if transcript unavailable | source-faithful article cannot pass |
| Research gate | at least 20 unique opened external sources: 2 X, 2 Reddit, 2 LinkedIn, 4 specialist forums, 5 official/primary, 5 independent expert/research/reporting; at least 3 challenge or limit the thesis | stop as `research_insufficient`; transcript and search snippets do not count |
| Story engine | cold open, central tension, stakes, turning point, practical rule, ending realization in `workflow.json` | draft reads like a recap |
| Article loop | `article-vN.md`, cross-model feedback packet, loop count, adversarial rater, failed gate list | model praise without applied feedback |
| Title/subtitle | `evals/title-vN.json`, at least 10 candidates, separate title/subtitle scores, chosen rationale, rejected options | body score hides weak packaging |
| Images | hosted/public assets, provenance, no presenter-only default, no visible timestamps/non-English infographic text | Medium preview cannot be trusted |
| Public preview | clean URL returns HTTP 200 and contains final title plus one source/research marker | HTML exists only locally |
| Preview retention | preview files are deployed and retained until Max approves removal, with a default minimum retention of 7 days | phone link disappears before review |
| Matrix review | Hermes Matrix message sent with preview URL plus signed approval/reject links, or a proven reply-watcher contract, or exact `approval_channel_blocked` / `matrix_notification_blocked` blocker recorded | Max cannot review on phone |
| Medium draft | visible headed session, `Draft`, `Saved`, `/p/{postId}/edit`, title/subtitle/body/images verified | paste was plain Markdown or unsaved |
| Medium topics | visible Story preview topics, at most five, matching approved topic set when provided | story is scheduled without distribution metadata |
| Medium schedule | visible `Schedule for later` flow, final schedule confirmation, Medium Stories row exact title/date/time | local status says scheduled but Medium does not |

Medium mutation has two mandatory skill gates:

1. `medium-visible-ui-mutation`: first prove the already-open visible Medium browser on mini is on a usable Medium editor/submission UI. Valid visible surfaces are the already-open GStack/Chrome-for-Testing window or the already-open logged-in normal Google Chrome window. If login, Cloudflare, MFA, Not Found, blank tab, or permissions block that live window, stop as `BLOCKED` with exact evidence.
2. `medium-proof-reviewer`: after any Medium mutation, independently verify UI proof and forbidden-path compliance. If the reviewer does not return `PASS`, the Medium step is not complete.

Overall readiness is the lowest critical gate, not an average. If Max says the article is `8/10`, the package is reopened even when model metadata says `9.5+`.

## Goal

Once a week, Hermes should pick one YouTube video Max liked or placed in a "create article" playlist, extract source material, generate a Medium-ready article package, export a noindex phone-visible preview, notify Max in Matrix for review, then after approval create/update the Medium draft and schedule it when the browser/session is available. No first-draft autopublish.

Review-first rule: do not mutate Medium while the article is still being edited or rated. The working artifact is the local package plus public preview. Medium draft creation or update is a downstream paste step after Max approves the reviewed local version. Once approved, the scheduled flow owns Medium reconciliation and scheduling; it must not leave stale title/subtitle metadata on Medium.

## Runtime Ownership

This is a max-mini/maxiclaw Hermes automation. It must not run as a Codex app automation.

Operational owner:

- Host: `maxiclaw` / max-mini
- User: `maxsmacmini`
- Workdir: `/Users/maxsmacmini/Desktop/Projects/social-poster`
- Scheduler: `hermes cron`
- Delivery: local Hermes, with `hermes send --to matrix:hermes` notification from the job
- Public preview target: `/Users/maxsmacmini/Desktop/Projects/maxpetrusenko.com/nextjs/public/medium/<slug>/`

Codex can manually repair the workflow, generate one-off examples, or pause a bad job. Codex should not own the recurring schedule.

## Inputs

- Primary queue: YouTube playlist named `Create Article`.
- Secondary queue: liked videos, newest first.
- Manual override: one URL pasted into Hermes, for example `https://www.youtube.com/watch?v=QMimkh3Nv1Y`.
- Max playlist monitor: `https://www.youtube.com/playlist?list=PLOgmJw9hZGS8&jct=W-r_35lIngYal8pzjNUBqQ`

Use playlist first because likes are noisy. Likes can include reference material, entertainment, or saves for later. A dedicated playlist is the cleaner publishing intent.

Current monitored playlist snapshot on 2026-06-10:

- Playlist title: `medium`
- Playlist ID: `PLOgmJw9hZGS8`
- Current item count: 1
- Current item: `bgyI1L1p4Nw` — `Neuroscientists Have Confirmed Our Suspicions | Pushka. Brain` by `SciOne`

Future automation should treat the snapshot as baseline. When a new playlist item or explicit liked-video queue item appears, create an article package for the new video and notify Max when the draft is ready.

## Queue Policy

- Start with one approved article per week for 52 weeks.
- Fresh/news/time-sensitive articles schedule sooner and may reshuffle the evergreen backlog.
- Evergreen/long-term articles fill later weekly slots.
- After the cadence is stable, expand to 2/week, then 3/week for a year.

## Cadence

- Cron: every 6 hours on max-mini through Hermes.
- Publishing cadence: one finished article is scheduled ahead after Max review; the generator should not create multiple unsupervised Medium drafts in one run.
- Max items per run: 1 article.
- Duplicate guard: skip a video if an article package already exists with the same YouTube video ID.
- Failure mode: write a blocked note with the URL, reason, and next manual action, then notify Matrix if Matrix env is configured. If Matrix notification itself fails, record `matrix_notification_blocked` with the exact missing env/tool/auth issue. If Matrix sends but there is no signed approval link and no proven reply watcher, record `approval_channel_blocked` and stop before Medium mutation.
- Quality target: review `article-v1.md`, then allow at most two targeted writer revisions. Preserve every version and hash-bound review. Stop after `article-v3.md` with an explicit blocker list instead of optimizing against the reviewer indefinitely.
- Research source gate: inspect at least 20 unique external pages before strategy or drafting. Discover first through X, Reddit, and LinkedIn, then specialist forums, then verify with official/primary and independent accountable sources. The supplied transcript/source does not count. Social/community sources cannot be sole verification for material factual claims. Search snippets, duplicates, mirrors, reposts, and unopened results do not count. Any unmet total, class minimum, or platform access requirement stops as `research_insufficient` unless Max explicitly approves a recorded exception.
- Packaging target: title and subtitle are rated separately from the article body. A 9.5 body with a weak title is not review-ready.
- Title policy: for YouTube-sourced Medium articles, start from the original video title translated into natural English, then refine it into a shareable story title when the literal translation is vague. Put the article's sharper angle in the subtitle and opening. Use a fully rewritten editorial title only when Max explicitly asks for one or the translated source title is misleading/clickbait beyond the source.
- Title/subtitle gate: title and subtitle are first-class publish gates. Generate at least 10 pairs, rate each separately, require title >= 9.2/10 and subtitle >= 9.2/10 before preview export, target 9.5/10+, and block Medium scheduling if the Medium editor, story preview, or Stories row shows stale title/subtitle text.
- Medium scheduling target: after Max approves a draft, scheduling must happen by visible headed-browser button clicks in the existing live Medium window on mini. Prefer GStack/Chrome-for-Testing when it is the logged-in surface; use already-open normal Google Chrome when that is where Medium is logged in. Hidden DOM scripts, API calls, or new browser windows are fallback-only and must be disclosed as fallback, not claimed as the normal flow.
- Medium mutation target: visible click/type/paste first in the existing live mini browser. CuaDriver/AX is allowed when it attaches to that visible window and only performs user-equivalent click/type/paste plus proof reads. `gstack browse` CLI, CDP, DOM scripts, Medium private endpoints, cookie inspection/import, new browser/profile creation, Playwright/Puppeteer writes, or direct HTTP mutation are forbidden unless Max explicitly approves fallback in the same turn. AppleScript/osascript may be used only for non-mutating window discovery.
- Existing-window hard gate: when a visible Medium window is already open on mini, Hermes must attach to and focus that exact window. This includes normal Google Chrome when it is already logged in as Max. It must not launch a second GStack window, random Chrome window, new browser process, new tab set, or new browser profile. If the existing window cannot be attached, focused, or controlled, record `medium_visible_window_attach_blocked` and stop before opening anything else.
- Medium topics target: before schedule confirmation, add and visibly verify up to five Medium topics. If no approved topics exist, generate candidates during packaging and require Max approval or an explicit package topic gate before scheduling.

## Pre-Publish Rating Scorecard

Use a min-gate, not an average. The article is not `9.5/10` unless every required pre-publish gate is at the target or the package records an explicit blocker. A strong body cannot mask a weak title, missing images, broken public preview, bad Medium paste, or unverified schedule.

Rate these before Max sees a "ready" article:

- Source-faithful storyline: the article follows the transcript/source sequence closely enough that it could not have been written from the topic alone.
- Story engine: wait-what hook, central tension, reframing, micro-to-macro movement, practical rule, and ending realization.
- Title: feed strength, specificity, evidence fit, shareability, non-generic voice, and ability to stand alone in the Medium feed.
- Subtitle: added stakes, source context, reader consequence, story angle, and non-repetition of the title.
- Body content: argument density, evidence quality, pacing, and section-to-section momentum.
- Standalone voice: no repeated source recap voice such as "in this video", "Mic explains", "Greg says", or timestamp-led narration.
- AI slop scan: no generic disclaimers, filler transitions, listicle scaffolding, "Reality check/contact" blocks, or excessive negation.
- Shareability: specific claims, images, or consequences that remain useful when excerpted, without an aphorism quota or slogan engineering.
- Current technique gate: use latest researched writing/search/distribution guidance for the run, not stale assumptions.
- Research depth: claims have source links near the claim, and deep research adds context instead of padding word count.
- Visual evidence: hero plus section images exist, are hosted or pasteable, avoid talking-head-only frames, and have no visible timestamps or non-English infographic text unless the article needs that artifact.
- Medium formatting: rendered/rich paste preserves title, second-line subtitle, headings, links, images, and source links.
- SEO: concise descriptive title, snippet-worthy opening, no keyword stuffing, and no clickbait mismatch.
- AEO/GEO: one direct answer block or clearly citable passage where useful, entity clarity, source proximity, and crawlable public preview.
- Public preview: exact phone URL returns HTTP 200 and contains the final title plus a unique source/research marker.
- Medium scheduling: after approval, Medium Stories shows the exact article row scheduled for the intended date/time.
- Notification/review state: Matrix notification was sent with a valid approval path, or the exact Matrix/approval-channel blocker is recorded.
- Rater provenance: model names, unavailable models, loop count, cross-feedback used, and Max-corrected rating are honest.

Required publish target: `9.5/10` for source-faithful storyline, story engine, title, subtitle, body content, standalone voice, AI slop, shareability, research depth, visual evidence, and Medium formatting. SEO and AEO/GEO target `9.0/10+` unless the piece is intentionally private/noindex. Public preview, Medium scheduling, Matrix notification, and rater provenance are pass/fail.

If Max flags any latest article as `8/10`, reopen the package even if model metadata says `9.5+`. Set `rating=8`, `consensusRating=8`, `consensusStatus=reopened_by_max_review`, and create the next `article-vN.md` only after addressing the exact failed gates. Current examples reopened this way: `youtube-body-thinks-before-mind-bgyi1l1p4nw` and `youtube-ai-agent-loops-human-loop-7clj8ih784q`.

## Quality Reliability Reviewer

Run this as a separate reviewer sub-agent after article generation and before Matrix review. Its job is drift control, not rewriting.

Inputs:

- final `article-vN.md`
- transcript and source notes
- current web-researched writing/search/distribution guidance for this article type
- image manifest and preview manifest
- prior Gemini/GPT/Claude/DeepSeek feedback when available
- Max-caught failures from previous runs

Checks:

- Brainlift-style evidence board: every major claim has source support, uncertainty/contradiction, confidence, falsifier, and decision implication
- current-technique packet: anti-slop signals, shareability signals, SEO/AEO/GEO signals, and which guidance was deliberately rejected
- min-gate score: the overall article score is the lowest critical score, not the average
- proof gates: public preview `200`, preview retained, Matrix message sent or blocked with exact reason
- no Medium mutation happened before Max approval

Output:

```text
evals/prepublish-vN.json
reports/article-quality-review-<slug>.md
```

The reviewer can veto. A veto means Hermes must revise the article package or record a blocker; it must not ask Medium to draft/schedule yet.

## Five-Agent Editorial Pipeline

Load these Hermes skills together for article creation:

- `source-of-truth-editorial-orchestrator`
- `source-of-truth-source-research`
- `source-of-truth-editorial-strategist`
- `source-of-truth-article-writer`
- `source-of-truth-adversarial-reviewer`

The orchestrator owns state and routing only. Source & Research owns provenance and the claim ledger. Editorial Strategist freezes one reader job, mode, purpose, scope, stance, and outline. Article Writer alone writes versioned prose. Adversarial Reviewer is read-only and returns hash-bound findings. Parallel work is allowed only for independent research questions; never run competing writers against a shared draft. No editorial specialist receives preview, scheduling, or publishing tools.

## Hermes Command Shape

```bash
cd /Users/maxpetrusenko/Desktop/Projects/social-poster
eval "$(/Users/maxpetrusenko/Desktop/Projects/manager/scripts/agent-shell-env 2>/dev/null || true)"

hermes chat -Q --worktree -s source-of-truth-editorial-orchestrator,source-of-truth-source-research,source-of-truth-editorial-strategist,source-of-truth-article-writer,source-of-truth-adversarial-reviewer,gstack,browse,open-gstack-browser,setup-browser-cookies,medium-article-generator,review -q '
Create one Medium article draft from the next eligible YouTube source.

Priority:
1. YouTube playlist: Create Article
2. YouTube liked videos, newest first
3. Manual URL if supplied

For each candidate:
- fetch metadata, chapters, thumbnail, and transcript
- extract candidate source-video frames and select only frames that explain a claim, show an infographic, or preserve the video's visual storyline
- store transcript at data/article-workspace/articles/<slug>/sources/youtube/transcript.md
- generate Medium-ready article-v1.md
- create overview.md, version.json, workflow.json, evals/rating-v1.json
- rate with Gemini and GPT when available
- revise from the rating notes, transcript chapter map, and anti-ai-slop checklist
- review article-v1, apply at most two targeted writer revisions, and stop after article-v3 with pass or needs_human_resolution
- run a title/subtitle adversarial gate after the body passes: generate at least 10 title/subtitle pairs, rate title and subtitle separately, and require title >= 9.2/10 plus subtitle >= 9.2/10 before preview export
- prefer the original YouTube title translated into English as the Medium title; keep the article angle in the subtitle unless Max explicitly asks for a rewritten editorial title
- export a noindex public preview under maxpetrusenko.com/medium/<slug>/
- after Max approves the local/public preview, create/update/schedule Medium through the already-open headed GStack browser when authenticated; click visible buttons, verify page text after each click, and if login/MFA or browser control blocks the flow, record medium_draft_blocked or medium_schedule_blocked with exact evidence
- before any Medium mutation, read `medium-visible-ui-mutation` and `medium-proof-reviewer`; if the visible editor is not reachable, stop as BLOCKED; do not use CLI/CDP/API/DOM/cookie/AppleScript/accessibility-tree fallback unless Max explicitly approves it in the same turn
- before scheduling, add and verify Medium topics in Story preview; for the body/brain article use: Neuroscience, Consciousness, Human Body, Psychology, Science
- notify Max in Matrix from max-mini with the title, source URL, ratings, public preview URL, and next action: `Review article`
- do not publish
- write a gbrain note with article slug, source URL, status, and review request
'
```

Current shell note: `gbrain` is available here. `gstack` and `grabin` were not on PATH in this Codex shell on 2026-06-10, even after loading `manager/scripts/agent-shell-env`. Keep `gstack` in the Hermes skill list where installed, but do not make the run depend on an unverified local binary.

## Source Extraction

Use this order:

1. YouTube Data API for playlist/liked-video discovery.
2. `yt-dlp` for metadata, chapters, thumbnails, and caption endpoint discovery.
3. Caption download or YouTube timedtext endpoint.
4. If captions are missing or blocked, mark the article as blocked unless Max explicitly allows an article from metadata plus external sources only.

For the monitored playlist, `yt-dlp --flat-playlist --dump-json` worked on 2026-06-10 without browser cookies.

For the example URL, direct subtitle download hit `HTTP Error 429: Too Many Requests`, but the info JSON exposed timedtext URLs. Russian original auto-captions fetched successfully from the stored timedtext endpoint.

## Package Contract

Each draft package should look like:

```text
data/article-workspace/articles/<slug>/
  article-v1.md
  overview.md
  version.json
  workflow.json
  sources/youtube/transcript.md
  sources/youtube/frames.md
  sources/source-notes.md
  assets/youtube-frames/selected/
  evals/rating-v1.json
```

The article must include:

- strong Medium title
- subtitle directly under the title
- hero image or hero placeholder metadata
- 40 to 60 word direct-answer block after the title/subtitle
- visible story spine from the YouTube transcript, with chapter/timestamp references when useful
- selected source-video frames when the frame adds evidence, an infographic, or visual story momentum
- English or textless regenerated bitmap visuals for non-English infographics or screenshots; do not ship Russian/non-English text-heavy images in the final preview unless the foreign text itself is the subject
- no local HTML/CSS-generated diagrams as normal final Medium art; if every better image path is blocked, record the fallback reason in `version.json`
- no readable text, labels, numbers, timestamps, logos, watermarks, fake charts, or UI chrome inside generated article visuals unless the article explicitly needs a sourced chart
- no visible timestamp captions under images in the public preview; keep timestamps in source notes or alt text only when useful for traceability
- short paragraphs
- source links near important factual claims in the body, not only a bottom source list
- reality-contact section
- sources section
- Medium footer only when this package is exported standalone

Story article rule: generate the article as a standalone story/argument, not as a summary, transcript rewrite, or "what the video said" recap. The source provides evidence, scenes, sequence, and factual constraints. The article provides the frame, tension, stakes, interpretation, practical rule, and ending realization. A reader should not need to know there was a video until they reach the sources.

Before sentence polishing, identify and record the story engine:

- cold open: the concrete contradiction or problem that pulls the reader in
- central tension: the misconception or risk the article reframes
- stakes: why this matters to the reader now
- turning point: the idea that changes how the reader sees the topic
- practical rule: what the reader can use after reading
- ending realization: the line or image that makes the argument stick

Story voice rule: after transcript-faithfulness passes, run a source-scaffolding cleanup. The article can be inspired by a YouTube source without repeatedly saying "the video says," "the episode shows," or "the host does." Keep the source in the sources section and private source notes, but rewrite the body as a standalone story unless the source itself is part of the claim.

Standalone voice gate: before preview export, scan the body and fail the draft if it still reads like a recap of the source video. The final Medium draft should sound like Max making an argument, not "Mic explains the episode." Remove or rewrite:

- inline timestamp links in the body, including `[09:55]`, `[12:29]`, and `youtube.com/watch?...&t=...`; timestamps belong in source notes, not the public article body
- recurring attribution scaffolding: "Mic says", "Mic explains", "Mic describes", "Mic starts", "Mic gives", "Mic adds", "Greg says", "Greg's analogy", "the host says"
- video recap scaffolding: "in this video", "in the conversation", "the episode shows", "the viewer learns", "the whiteboard version", "the conversation earns"
- captions or image alts that advertise "source frame", "from the video", or visible timestamps unless needed for factual traceability

Rewrite toward standalone essay voice:

- "An AI loop is..."
- "The failure mode is..."
- "I use a stricter test..."
- "A good loop has..."
- "The practical rule is..."
- "The source that sparked this piece is listed below."

The transcript still controls factual sequence and claim boundaries. The article body should not expose that scaffolding to the reader.

Reframing reality rule: the goal is not to explain the source. The goal is to turn the source into a sharper model of reality. Start from a comfortable myth or boring textbook frame, then replace it with a colder, stranger, more useful frame. The worked example moved from `forests are the lungs of the planet` to `plants are older infrastructure: food base, weather machinery, alien mergers, distributed signal networks, and biological sovereignty`.

Reshare velocity rule: the draft needs modular lines a reader can retell. Before preview export, check for:

- wait-what hook: a contradiction like `If every plant died today, the air would be fine. But dinner would be over.`
- cross-domain analogy: biology plus security, infrastructure, finance, software, or systems language, such as `two-factor authentication made of tissue`
- micro-to-macro connection: chloroplast to coal, calcium wave to forest behavior, breath to paper, cell to weather
- high-definition nouns: concrete mechanisms and mental movies instead of abstract adjectives
- micro-story headers: every H2 teaches something even when scanned alone
- one human-relatability moment: make the system personal without becoming sentimental, for example `You cannot sneak up on a forest; the grass you stepped on has already started the signal chain.`

New-school narrative rule: avoid textbook/explainer posture. Cut `Since the dawn of time`, nature-as-gift-giver, enthusiastic teacher voice, oversimplified mechanisms, and generic `we must save X` endings. Prefer cold, objective, slightly unsettling narrative when the source supports it; use complex terms when immediately contextualized; end with realization rather than advice.

Best-author negation rule: after the story-voice cleanup, scan for AI cadence before export. Count negation markers (`not`, `no`, `never`, `without`, `cannot`, `can't`, `doesn't`, `don't`, `didn't`, `isn't`, `aren't`, `wasn't`, `weren't`) and scaffolding phrases (`The next move`, `Then comes`, `This is where`, `The point is`, `The real story`, `The better question`) as diagnostic evidence. Judge rhetorical function, clustering, and cumulative cadence. Rewrite repeated rejection-replacement patterns into positive mechanism, sequence, image, or consequence. Preserve negation required for factual, legal, or scientific accuracy; raw token count alone does not fail the article.

Consequence-first cadence rule: use broad, non-imitative traits from Mark Manson-style directness and Paul Graham-style mechanism writing: plain stakes, concrete examples, honest consequence, and lived product-world contact. Do not copy any living author's voice, catchphrases, sentence music, persona, or signature formatting. Treat these as editorial constraints, not mimicry. For Medium automation, fail drafts that rely on aphoristic one-line punch paragraphs, repeated demonstrative paragraph starts (`That is`, `This is`, `That detail`, `The point is`), binary contrast loops, or named-source narration. Short standalone sentences are allowed only when earned by the surrounding paragraph; otherwise merge or expand them into a concrete mechanism, example, or consequence.

Max Voice Anti-Formula Gate: hard fail diagnostic signposts such as `A useful test:`, attributed `strongest line` framing, decorative paired aphorisms, and three-or-more unbulleted `Label: definition` fragments. Rewrite them as connected prose built from mechanisms, scenes, evidence, and consequences. Use a real list only when reference structure genuinely helps the reader.

Failed worked-example pattern:

```text
Plants are mergers, not simple machines
The next move is inside the cell.
Plants did not invent photosynthesis. Their ancestors captured it.
```

Better pattern:

```text
A leaf is full of old lives
Inside the cell, the story gets stranger.
Photosynthesis began before plants. Chloroplasts descend from once-independent organisms, so a plant cell carries multiple old lives inside it.
```

## Title and Subtitle Gate

Run this after the article body passes the adversarial rating gate and before public preview or Medium draft creation.

Pass criteria:

- title is a claim or tension, not a label like "The video that explains X"
- title can stand alone in a Medium feed
- subtitle explains the source context and why the claim matters
- title and subtitle do not overpromise beyond the transcript and verified source notes
- title is rated separately from the body; minimum title score is `9.2/10`, target is `9.5/10+`
- subtitle is rated separately from the body; minimum subtitle score is `9.2/10`, target is `9.5/10+`
- generate at least 10 candidate title/subtitle pairs after the final body exists
- include at least 3 title styles: high-tension thesis, practical operator rule, and curiosity/reframe
- reject titles that are merely accurate but generic, metaphor-only, management-cliche, or too soft for the article's argument
- reject subtitles that repeat the title instead of adding source context, stakes, or reader consequence
- if Max says the title is weak, treat it as a failed gate even if the article body rating is high; create a new `article-vN.md` or metadata revision and rerun the title/subtitle gate
- `version.json` includes `title`, `subtitle`, `articleFile`, and current `version`
- `evals/title-vN.json` records candidate list, separate title/subtitle scores, chosen rationale, and rejected options
- the article Markdown starts with `# <title>` followed by the subtitle as italic text
- when pasted through the Medium editor, the second paragraph must be Medium subtitle type, not a pullquote/blockquote

Worked-example approved title/subtitle:

```text
Plants Are Not Here to Help You Breathe

A Russian science video starts with the forest-lungs myth and ends somewhere stranger: plants are not background scenery. They are the planetary system humans live inside.
```

Failed worked-example title:

```text
An AI Agent Loop Needs a Steering Wheel
```

Reason: clear but too soft and generic. It sounds like a management metaphor, not a shareable thesis. The body can rate 9.5+ while this title rates around 3/10.

Better direction:

```text
AI Agent Loops Are Slop Machines Without a Score

Autonomy works only when the artifact is bounded, the critic is external, and the stop rule is real.
```

## Max-Caught Slop Rule

Max's review comments are part of the adversarial loop. If Max flags slop after the article already passed model gates, the model gate was incomplete.

When Max flags a line, section, title, subtitle, image, caption, or scheduling behavior:

1. Record the exact complaint in `workflow.json`.
2. Classify it as one of: title/subtitle failure, source-recap voice, generic caveat/disclaimer block, negation cadence, image quality, Medium formatting, public-preview availability, visible-browser scheduling failure.
3. Create a concrete rewrite or operational fix.
4. Rerun the relevant gate, not only the whole-article score.
5. Add the new rule to this runbook and the cron prompt if it can recur.

Specific recurring failures:

- Do not append generic caveat blocks like `Reality contact`, `Reality check`, `Limitations`, or `Practical takeaways` unless the article truly needs that container. Weave caveats into the story as audit trail, measurement test, or operator constraint.
- Do not call a public preview complete until the exact phone URL returns HTTP 200 for the intended clean URL and contains the title plus one unique research/source marker.
- Do not call Medium scheduling complete until Medium Stories shows the row as scheduled with the exact date/time.

## Medium Scheduling Gate

Scheduling is a visible UI workflow after Max approves the draft. The normal path is the already-open headed Medium browser on max-mini: GStack/Chrome-for-Testing when it is live and logged in, otherwise the already-open normal Google Chrome window if that is the authenticated Medium surface.

Pass criteria:

- use the already-open visible browser window when Max says it is open
- do not open extra Medium windows, tabs, browser processes, or profiles unless Max explicitly asks
- if the existing authenticated Medium window cannot be controlled, block instead of replacing it
- click `Schedule for later` visibly
- verify the schedule picker opened by reading page text or visible browser state
- set the date/time by visible controls
- verify the summary text before final submit, for example `6/16/2026, 11:00 AM EDT`
- click `Schedule to publish`
- verify Medium Stories shows the article row as scheduled with the exact date/time
- verify Story preview topics before final schedule confirmation
- record `mediumDraft.status = scheduled_on_medium`, `scheduledFor`, `postId`, `submissionUrl`, and proof text in `workflow.json`

Fallback policy:

2026-07-06 recovery rule:

- If GStack/Chrome-for-Testing has a stale `no active page`, Cloudflare, or attach blocker but normal Google Chrome is already open on mini at Medium and logged in as Max, Hermes must use that existing visible Google Chrome window after Max has approved visible mini posting. Do not reopen a browser and do not leave the job blocked on stale GStack state.
- Before clicking Publish or Schedule, verify the body is the approved clean article, not a preview/status wrapper. Hard-fail on `Draft status:` banners, duplicated titles, stale source-video recap language, missing title/subtitle, or missing images.
- For scheduling proof, the Medium picker may show local EDT while Medium Stories displays UTC-equivalent time. Record both surfaces. Example: picker `7/14/2026, 9:00 AM EDT`; Stories row `Jul 14, 1:00 PM`.

- If visible clicking fails after two concrete attempts, pause and research current browser-control options before using hidden automation.
- Research should check GStack browser tooling, browse.sh capability, Patchright/Playwright attachment options, Chrome DevTools Protocol, Browser MCP, and current repo docs before choosing a fallback.
- Hidden DOM scripts may be used only as a clearly labeled fallback. The final note must say it was fallback automation, not visible browser clicking.
- If Max requested to watch the headed browser, do not silently switch to hidden automation.
- `gstack browse` CLI, CDP, DOM writes, private endpoints, and new browser/profile creation count as fallback automation for Medium mutation. CuaDriver/AX proof reads and click/type/paste are allowed only when attached to the existing visible mini browser. AppleScript/osascript is allowed only for non-mutating window discovery.

## Rating Loop Contract

The first draft is not done. It is a candidate.

Each loop should:

1. Read `sources/youtube/transcript.md` and `sources/source-notes.md`.
2. Check whether the article follows the video's actual storyline rather than only using the video as a topic seed.
3. Build a cross-model feedback packet from prior ratings, progress so far, and unresolved blockers.
4. Give the feedback packet to the writer before creating the next version.
5. Rate with Gemini and GPT/OpenAI using the article, transcript, and feedback packet. Claude is optional if authenticated.
6. Pass each model's feedback to the other model on the next judging pass so raters can see progress and disagreement.
7. Pick the stricter, more source-faithful model as the adversarial gate for the current article. Use the friendlier model for publish-readiness/slop checks, not as the sole stop signal.
8. Convert the adversarial rater's weaknesses into an edit plan.
9. Create the next version file, for example `article-v2.md`.
10. Update `workflow.json`, `version.json`, `overview.md`, and `evals/`.
11. Stop only when adversarial gate and consensus are at least `9.5/10`, or after 5 quality passes with an explicit blocker: missing transcript, missing primary source, model/auth failure, copyright risk, judge disagreement, or Max review needed.

For YouTube-sourced pieces, a `9.5/10` draft should not merely summarize the topic. It should visibly transform the video's chapter sequence into an article argument.

## Adversarial Editorial Gate

The pasted external review of the worked example is now part of the gate. A draft that is merely smooth, complete, or "Medium-smart" is not enough.

Before the final score can pass, the adversarial rater must check:

- transcript faithfulness: the article follows the video's actual sequence and odd visual momentum, not only the topic
- compression: cut or merge sections that reconstruct the whole episode instead of making a sharp essay
- human voice: preserve friction, surprise, small imperfect reactions, and writer judgment; remove generic polished essay cadence
- source posture: flag every numeric claim that needs verification before Medium publish
- shareability: the title, opening, and specific evidence or judgment should remain useful when excerpted without manufacturing quote-worthy lines
- reframing: the article should move from comfortable myth to colder/stranger model, not merely explain the topic
- modular design: headers, captions, first 150 characters, and specific passages should remain understandable when excerpted
- high-definition nouns: concrete mechanisms should replace abstract adjectives wherever possible
- slop risk: penalize over-even section weights, thesis repetition, generic "here is why" scaffolding, and fake confidence
- source-scaffolding: penalize repeated "video/episode/host says" phrasing after the article has already proven transcript faithfulness; the final Medium draft should read like a story inspired by the source, not a running recap of the source
- story article: hard fail if the draft reads like a source recap rather than a standalone story/argument with cold open, tension, stakes, turn, practical rule, and ending realization
- standalone voice: hard fail if body contains timestamp links or repeated "Mic/Greg/video/conversation explains" recap voice after the source-faithfulness pass
- disclaimer-block gate: hard fail generic caveat sections with headers like `Reality contact`, `Reality check`, `Limitations`, or `Practical takeaways` when they read like a detached benchmark disclaimer; source limits and measurement cautions must be woven into the story as audit trail, stakes, or operator tests

If Gemini rates publish-readiness high but GPT/Codex says the piece is still not faithful to the transcript, GPT/Codex wins the gate for that iteration. If Claude is authenticated, use it as a third rater only when Gemini and GPT disagree by more than 0.4 points.

Implementation gap found on 2026-06-10: local article-agent code has one-shot rating helpers and iteration metadata, but no hard target-score controller. The needed optimization is an orchestrator that reads transcript + current draft + cross-model feedback packet, rates with Gemini/GPT, selects the adversarial gate, converts weaknesses to an edit plan, writes the next `article-vN.md`, updates package metadata, and stops only on target consensus/adversarial score or explicit blocker.

## Public Preview Export

After a draft passes the adversarial gate or reaches a blocker state worth reviewing, export a noindex preview page:

```bash
cd /Users/maxpetrusenko/Desktop/Projects/social-poster
npm run articles:export-public-preview -- \
  --package data/article-workspace/articles/<slug> \
  --article article-vN.md
```

The helper writes:

```text
/Users/maxpetrusenko/Desktop/Projects/maxpetrusenko.com/nextjs/public/medium/<slug>/index.html
/Users/maxpetrusenko/Desktop/Projects/maxpetrusenko.com/nextjs/public/medium/<slug>/preview-manifest.json
/Users/maxpetrusenko/Desktop/Projects/maxpetrusenko.com/nextjs/public/medium/<slug>/assets/...
```

The intended phone URL is:

```text
https://www.maxpetrusenko.com/medium/<slug>/
```

The page includes `noindex,nofollow` until Max approves Medium publication.

The exporter copies relative local image references from the article package into the public preview directory, so article Markdown can use paths like `assets/youtube-frames/selected/01-frame.jpg`.

Preview retention: keep public preview files available for at least 7 days or until Max explicitly says to remove them. Do not clean up preview directories during generation, retry, or deploy.

Deploy proof: after export, build/deploy the public site and verify the exact phone URL with HTTP `200`, `noindex`, final title, and one unique source/research marker. On max-mini the deploy path is the `maxpetrusenko.com/nextjs` normal deploy using Doppler `api_keys/prd`; `api_keys/dev` may not exist on that host.

Deploy guard: if deployment is blocked, keep the exported files, record `public_preview_deploy_blocked`, and notify Max with the local output path plus the intended URL. Do not claim the preview is ready until the phone URL returns `200`.

## Matrix Notification

Matrix env required:

```text
MATRIX_HOMESERVER_URL
MATRIX_ACCESS_TOKEN
MATRIX_ROOM_ID
```

Current check on 2026-06-10: these keys were missing in the plain shell and in Doppler `api_keys/dev`. On max-mini, prefer `hermes send --to matrix:hermes` because Hermes owns the recurring automation and Matrix route.

Ready-state rule: an article is not complete when the HTML exists. It is complete only after the noindex public preview is exported/deployed and Max receives the Matrix review notification, or after `workflow.json` records an explicit `matrix_notification_blocked` state.

Send the ready/blocked message with:

```bash
cd /Users/maxpetrusenko/Desktop/Projects/social-poster
doppler run --project api_keys --config dev -- \
  npm run notify:matrix -- --message "Medium article ready for review: <title>
Source: <youtube-url>
Ratings: Gemini <score>/10, GPT/Codex <score>/10
Preview: https://www.maxpetrusenko.com/medium/<slug>/
Next: Review article"
```

On max-mini, Hermes also exposes Matrix directly:

```bash
hermes send --to matrix:hermes "Medium article ready for review: <title>
Source: <youtube-url>
Ratings: Gemini <score>/10, GPT/Codex <score>/10
Preview: https://www.maxpetrusenko.com/medium/<slug>/
Next: Review article"
```

If `matrix:hermes` or `matrix:max` fails with `Could not resolve`, list exact Matrix targets and send to the exact id:

```bash
hermes send --list matrix --json
hermes send --to 'matrix:!ROOM_ID:matrix.maxpetrusenko.com:$THREAD_ID' --file /tmp/medium-review-message.txt --json
```

Preserve the literal `$THREAD_ID`. Prefer passing the target as a process argument from Python/Node instead of shell-interpolating it.

Current Hermes `send` is text-only. Text-only transport is fine for carrying URLs, but it is not an approval consumer. The review message must include signed approval/reject links when the approval broker is available. Do not ask Max to reply with `APPROVE`, `DENY`, or `REVIEW <notes>` unless the run proves a live Matrix watcher accepts that exact syntax from Max's Matrix identity, maps it to the current article id/content hash, and writes the durable decision into `workflow.json` or the approval package.

If neither signed approval links nor a proven reply watcher are available, send a review-only Matrix notice with the preview URL, record `approval_channel_blocked` in `workflow.json`, and stop before Medium draft/update/schedule. Notification success proves only that Max was notified; it does not prove approval.

If Matrix env is missing, record `matrix_notification_blocked` in `workflow.json`, include exact missing env names, and still report the result in the automation output.

## Review Gate

Hermes stops after preview creation and sends Max through Matrix:

- article title
- source video
- article path
- public preview URL if deployed, otherwise intended URL plus local preview path
- ratings and adversarial gate model
- status: `needs_review_notified`
- one sentence describing the article angle

Publishing to Medium requires explicit human approval.

## Medium Draft Creation

Draft creation is allowed after Max says to post or create a draft from the reviewed local version. Do not update Medium directly during article iteration; update `article-vN.md`, re-export the public preview, ask for review, then paste/update Medium only after approval. Publishing the live Medium post still requires explicit final approval inside the Medium editor.

Use this order:

1. Prefer the existing visible logged-in mini browser session. Do not open/close many Chrome windows. Use GStack/Chrome-for-Testing if it is the live authenticated Medium window; use already-open normal Google Chrome if that is where Medium is logged in.
2. Import both `.medium.com` and `medium.com` cookies from one real browser profile before opening the editor. Avoid mixing `.medium.com` cookies from one profile with `medium.com` cookies from another profile.
3. Open `https://medium.com/new-story` in that existing window, or continue from the existing `/p/{postId}/edit` / submission page if the article is already drafted.
4. Paste the final title, subtitle, article body, and images. Loading the editor is not proof of a usable write session. Require a successful autosave/post id before clicking Publish or Schedule.
5. If Medium editor paste is flaky, stop and record `medium_draft_blocked` unless Max explicitly approves a same-turn fallback. Do not silently switch to CDP, DOM scripts, Medium native/private endpoints, cookie inspection/import, AppleScript, accessibility-tree dumps, Playwright/Puppeteer, or direct HTTP mutation.
6. Save as a Medium draft and record the draft URL in `workflow.json` under `mediumDraft`.
7. If Medium login, CAPTCHA, MFA, missing cookies, Cloudflare, image-upload UI, disabled Publish, missing post id, or "you are no longer signed in" blocks automation, stop and record:

```json
{
  "mediumDraft": {
    "status": "blocked",
    "blockedReason": "exact blocker",
    "attemptedAt": "ISO timestamp"
  }
}
```

Do not use Social Poster's internal blog "published" status as proof of a real Medium draft. The real proof is a Medium editor draft URL or an explicit browser blocker.

Write gate learned on 2026-06-11: copied cookies can be enough to read `https://medium.com/new-story` but still fail writes. The page may show the editor, accept formatted paste, then display `We were unable to save your changes because you are no longer signed in`; in that state Publish remains disabled because Medium has no saved post id. Treat this as `medium_draft_blocked`, not scheduled. Fix is a real Medium login in the reusable mini browser session, then save that state as `medium-auth-current` and retry.

Historical worked-example gstack posting notes on 2026-06-10:

- `gstack browse connect` opened a fresh Chrome-for-Testing profile, not the existing Brave tab.
- Importing Medium cookies from Brave/Chrome into gstack succeeded, including `sid`, `uid`, `xsrf`, and `cf_clearance`.
- Medium still returned Cloudflare `403` at `https://medium.com/new-story` inside gstack.
- The visible gstack browser session was actually `Google Chrome for Testing` on CDP port `9223`, logged into Medium with Max's cookies.
- The reliable path was not raw HTML DOM insertion. Directly inserting `data:` images rendered visually but left Medium stuck in "Saving" with "Something is wrong and we cannot save your story."
- A historical fallback path used Medium's native upload and delta endpoints inside the authenticated gstack browser. This is not the current normal path and requires explicit same-turn approval from Max before reuse:
  - upload each YouTube frame to `/_/upload?source=8`
  - update the story with valid deltas through `/p/{postId}/deltas`
  - reopen the saved draft in a fresh gstack tab
- Worked example proof: saved Medium draft `https://medium.com/p/94634dcb6688/edit`, post ID `94634dcb6688`, latest revision `146`, 10 Medium-hosted images, editor state `Draft` plus `Saved`.

Visible-browser retry rule learned on 2026-06-11:

- If Max says a Medium browser is already open, do not start a second `gstack browse` daemon and do not open a new Chrome profile. First identify the visible Medium window on mini. Operate `Google Chrome for Testing` / GStack when that is the authenticated window; operate normal Google Chrome when that is already logged in and visible.
- The minimum retry path is two visible actions: open `https://medium.com/new-story` in that browser, then paste the approved article.
- Plain Markdown paste is a failure mode. It can save a draft, but headings, links, and images are wrong. Use rich rendered copy from the public preview. Do not switch to Medium-native deltas unless Max explicitly approves that fallback in the same turn.
- After rich paste, verify `Draft` + `Saved` and a real `/p/{postId}/edit` URL. In the `bgyI1L1p4Nw` retry, rich text headings/paragraphs saved successfully at `https://medium.com/p/a6ee8afb8283/edit`.
- Clipboard HTML may still drop images. When images do not appear, insert hosted image URLs from the public preview assets one by one by visible UI, or stop and ask Max for explicit same-turn fallback approval. The images must be hosted/public, not local file paths.
- Do not leave Terminal/screenshot helper windows covering the editor. Close capture/helper Terminal windows before handing back to Max.

## Worked Example

Source: `https://www.youtube.com/watch?v=QMimkh3Nv1Y`

Created package:

```text
data/article-workspace/articles/youtube-plants-oxygen-qmimkh3nv1y/
```

Draft angle:

> The useful correction is not "trees do not matter." It is that breathable air is a planetary accounting system where ocean plankton, cyanobacteria, forests, soil, and time all matter in different ways.

Current example status:

- `article-v1.md`: first-pass draft.
- `article-v2.md` through `article-v12.md`: rating-loop revisions grounded in the Russian YouTube transcript.
- `article-v13.md`: visual pass with selected YouTube frames.
- `article-v14.md`: title/subtitle gate.
- `article-v15.md`: story-voice pass from Max feedback; removes repeated video/episode/host scaffolding while preserving the transcript-derived sequence.
- `article-v16.md`: best-author negation pass from Max feedback; removes the `not X / next move / did not` section pattern and reduces avoidable negation/scaffolding counts before Medium update.
- Best current draft: `article-v16.md`.
- Gemini rating: `9.5/10` with transcript and cross-model feedback packet included in the judge prompt.
- GPT/Codex adversarial rating: `9.5/10` with transcript and cross-model feedback packet included in the judge prompt.
- Consensus status: passed adversarial gate.
- Claude status: blocked by local auth failure.

Why the first example did not loop: the manual worked example stopped after one rating, and the code path currently saves `iterationCount: 1` / one-shot rating metadata. The runbook now requires a bounded loop, cross-model feedback packets, adversarial rater selection, and explicit blocker note instead of silently treating an `8.5` first pass as done.

What worked in the example: Gemini was useful for publish-readiness and slop checks, but GPT/Codex was the better adversarial gate because it kept forcing the article back toward the video's actual sequence and odd visual momentum. Sharing prior feedback with both models moved GPT from `8.4` to `9.2`, then `9.4`, then `9.5`.

Post-draft Max feedback: the piece became more interesting once the article stopped referring to the video so often. Treat this as a mandatory final cleanup for future YouTube-to-Medium posts: source-faithful structure first, standalone story voice second.

Post-v16 style learning: keep writing toward `reframing reality`, not generic science explanation. The strongest pattern is an intellectual pivot from myth to cold truth, then micro-to-macro narrative. For the plant article, the reusable pattern is: a leaf is not just a leaf; it is an ancient merger, a proton turbine, a signal node, weather machinery, and evidence that humans live inside a plant-made world. This style rated 9.1/10 after Max review and should be the baseline for the next playlist article.
