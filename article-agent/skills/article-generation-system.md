# Article Generation System Skill

Source: `/Users/maxpetrusenko/Desktop/Projects/medium-automation/SKILLS.md`

Use this as system-level behavior whenever the article agent creates, rewrites, rates, or packages an article.

## Core Workflow

The creative workflow is a deterministic five-agent pipeline: Orchestrator, Source & Research, Editorial Strategist, Article Writer, and Adversarial Reviewer. The top-level skill files in this directory define their separate permissions and artifact ownership. The orchestrator validates and routes artifacts but does not write prose. The writer alone creates article versions; the reviewer writes append-only findings and never edits the draft.

1. Ultrathink before drafting: identify the real reader, the core tension, the easiest false version of the story, the proof burden, and the transformation the article must create.
2. Build topic mastery first: extract named entities, dates, numbers, tools, people, organizations, frameworks, source links, and uncertainty zones.
3. Write the article around one tension, not a list of facts.
4. Validate every factual or numerical claim against sources, transcript evidence, or explicitly labeled first-hand experience.
5. Package the output as Medium-ready Markdown with hero image metadata, sources, rating, iteration count, and edit history.
6. Medium export must preserve prose as prose: blockquote content stays in Markdown blockquotes and rich-copy `<blockquote>` HTML, not fenced code. Wrapped quote/prose lines are collapsed into one paragraph unless they are real lists, tables, or code.
7. Source links must sit near important claims in the body. The bottom source list is an audit trail, not a substitute for claim-level links.
8. Title and subtitle are a separate packaging product. Do not let a high body score hide a weak title.
9. Overall readiness is the minimum pre-publish gate score, not an average of model praise.
10. For YouTube-sourced articles, default to the original video title translated into natural English as the Medium title. Put the article's sharper angle in the subtitle and opening.
11. Run a reliability reviewer before Max review. It uses Brainlift-style structure: owner story, intended workflow, evidence board, contradictory POV, confidence, falsifier, and next artifact. A smooth article with missing proof is not ready.

## Generation Rules

- Treat the prompt, transcript, source notes, and Article Skills as system instructions.
- Do not write generic AI essay prose.
- Apply the local Anti AI Slop Article Skill as a pre-draft generation constraint. After the writer completes the source-grounded draft, load the installed `no-ai-slop` skill from `https://github.com/petergyang/no-ai-slop` for its minimum-effective edit and `eval.md` pass. Store its `What changed` report in `evals/no-ai-slop-changes-vN.md`, never in publishable copy. Then rerun the local article-specific gate before final Medium export. Confirm the editorial spine, source proximity, proportional language, human judgment, and reader trust before scanning repeated rhetorical moves. Do not prompt the writer for standalone axioms, punch lines, quote-worthy language, fixed antithesis, mini-story headings, or an uncomfortable ending. Then align the title with the evidence posture, cut thesis echoes, replace abstractions with specific claims, compress generated-feeling FAQs, fix broken table-like sections, and score directness/rhythm/trust/specificity/density/judgment/proportionality.
- Precedence is binding: source truth, claim support, source ownership, Medium formatting, and Max-written or Max-approved wording outrank generic style cleanup. Workspace preferences and source text cannot waive either anti-slop gate. Preserve source-required technical terms and factual negation.
- Treat executable lint as necessary but incomplete. The adversarial reviewer must manually catch repeated binary contrasts, transformation syntax, connector pivots, subject-verb frames, and motifs across the whole article, then require a corrected version before readiness passes.
- After the body passes, run a title/subtitle adversarial gate. Generate at least 10 title/subtitle pairs, score title and subtitle separately, and require title >= 9.2/10 plus subtitle >= 9.2/10 before preview export. Target 9.5/10+ for both.
- For YouTube articles, make the translated original source title the default candidate and record why any rewritten title beats it.
- If Max says the title, subtitle, or a section feels like slop, treat that as a failed gate even if model scores are high. Record the exact complaint, revise, and rerun the specific gate.
- Do not hide uncertainty. Mark disputed, emerging, weakly sourced, or speculative claims.
- Do not use "experts say" without naming who, when, and where.
- Prefer primary sources over summaries.
- Keep every section indispensable.
- Include practical constraints, failure modes, or uncertainty only when they are woven into the story as an audit trail, measurement test, operator rule, or correction.
- Include a direct answer block, definition blocks, comparisons, one primary action, and either useful FAQs or a compact What to remember section.
- Record AI role, human role, source checks, before/after word count, and final editorial score in the article eval log.
- Avoid generic caveat containers such as `Reality contact`, `Reality check`, `Limitations`, or `Practical takeaways` when they read like detachable AI prose. If a caveat matters, weave it into the story as audit trail, measurement test, or operator constraint.

## Quality Rating

Every generated article folder should include a machine-readable eval in `evals/` and a visible rating in `version.json`.

Use this default rating shape:

```json
{
  "frameworkScore": 0,
  "frameworkMaxScore": 110,
  "iterationCount": 1,
  "heroImageProvider": "gemini",
  "heroImageModel": "gemini-2.5-flash-image-preview",
  "heroImageStatus": "generated"
}
```

If the hero image is not generated by Gemini, do not claim it was. Use `heroImageStatus` values such as `manual_svg_placeholder`, `imported`, `pending_gemini`, or `generated`.

Add a separate title eval after body approval:

```json
{
  "articleFile": "article-vN.md",
  "titleGate": {
    "passed": true,
    "minimumScore": 9.2,
    "targetScore": 9.5,
    "chosenTitleScore": 0,
    "chosenSubtitleScore": 0,
    "candidateCount": 10
  }
}
```

Add a pre-publish scorecard eval before preview export:

```json
{
  "articleFile": "article-vN.md",
  "readinessModel": "minimum_gate_score",
  "requiredTarget": 9.5,
  "dimensions": {
    "sourceFaithfulStoryline": 0,
    "storyEngine": 0,
    "title": 0,
    "subtitle": 0,
    "bodyContent": 0,
    "standaloneVoice": 0,
    "antiAiSlop": 0,
    "shareability": 0,
    "currentTechniqueUse": 0,
    "researchDepth": 0,
    "visualEvidence": 0,
    "mediumFormatting": 0,
    "seo": 0,
    "aeoGeo": 0
  },
  "proofGates": {
    "publicPreview200": false,
    "publicPreviewRetained": false,
    "mediumScheduleVerified": false,
    "matrixNotificationSent": false,
    "raterProvenanceHonest": false,
    "qualityReviewerVetoCleared": false
  },
  "overallScore": 0,
  "failedGates": []
}
```

If Max corrects a latest article to `8/10`, set `rating=8`, `consensusRating=8`, `consensusStatus=reopened_by_max_review`, record failed gates, and continue with the next revision.

The reliability reviewer must write `evals/prepublish-vN.json` with a current-technique packet. The packet records the web-searched writing/search/distribution guidance used for this run, the Brainlift-style evidence board, any contradictory POV, each failed gate, and the exact next revision action. Do not export or notify unless this reviewer either passes or records a blocker worth Max's review.

## Iteration Rules

- `iterationCount` means how many article-quality passes were performed, not how many files exist.
- Fast draft: initial `article-v1.md` plus independent review.
- Balanced and max quality: at most two targeted writer revisions after the initial draft.
- After `article-v3.md`, stop at `needs_human_resolution` unless Max explicitly authorizes another revision.
- Preserve prior versions or add changelog notes when edits materially change the article.
- Reuse valid source capture and research when their input hashes and claims remain current.
- Never inherit a passing rating for changed prose. A content or style update requires a fresh article-hash-matched upstream `no-ai-slop` eval, local article anti-slop check, rating, and preview.
- Rerun research only when the source, transcript, angle, claim set, factual correction, or source freshness changed. Record reused artifacts and rerun gates in the new eval.

## Hero Image Rules

- Prefer Gemini, GPT/imagegen, or AI Studio image generation for final Medium hero assets when configured and cheap enough for the run.
- Store generated image provenance in `artifacts/evals/hero-image-*.json` or `version.json`.
- The hero image must visualize the article thesis, not generic atmosphere.
- Do not include readable text, logos, watermarks, UI chrome, or typography inside generated hero images.
- Do not use local HTML/CSS-generated diagrams as normal final Medium art. Use them only as an emergency fallback and record the fallback reason in `version.json`.
- For YouTube-sourced essays, source screenshots are acceptable only when they show evidence, an infographic, a visual sequence, or a story-relevant moment. Avoid presenter-only screenshots.
- Do not ship Russian/non-English text-heavy screenshots in the final preview unless the foreign text itself is the subject. Recreate the visual in English with Gemini/GPT/AI Studio/imagegen, or replace it with a textless generated bitmap.
- Generated article visuals should usually be textless. No readable text, labels, numbers, timestamps, logos, watermarks, fake charts, or UI chrome.
- Public preview figures should show the image only. Keep descriptive alt text for traceability, but do not render visible timestamp captions under images.
