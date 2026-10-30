# Thesis stage — Phase 0

Status: implemented behind `THESIS_STAGE` (off by default). Owner: Max. Date: 2026-10-30.

## Problem

The pipeline can summarize but cannot hold a position. `buildHumanPostPrompt` binds the writer to
"stay neutral… do not invent Max's opinion, emotion, thesis, hook, metaphor, or conclusion", and the
only quality layer is a keyword scorer (`post-framework.ts`, HOOKS). Result: source-faithful drafts
that read as neutral digests, while the accounts Max benchmarks against lead with a judgment and the
stakes. Nothing in the pipeline reads a second source, checks a number, or decides what is true that
the headline misses.

## Job to be done

For one candidate story: read the source and independent coverage, decide whether a defensible view
exists, and either state that view with an evidence trail or skip the story.

## Contract

`src/lib/pipeline/thesis.ts`

```ts
type Thesis = {
  claim: string;      // judgment, not a summary or a headline restatement
  stakes: string;     // who wins/loses, or what changes for a builder
  falsifier: string;  // what would prove the claim wrong
  confidence: "low" | "medium" | "high";
  evidence: { id; kind: "primary"|"coverage"|"quant"|"reaction"|"counter"; url; title; quote }[];
};
type ThesisResult = { action: "post"; thesis } | { action: "skip"; reason };
```

Validation gates (deterministic, `validateThesis`): claim 40–240 chars, not a question, not
"this article…", content-word overlap with the headline ≤ 0.6, stakes ≥ 30 chars, falsifier ≥ 15
chars, at least two cited sources, at least one `primary`, every quote ≥ 20 chars. Failure = skip
with the reasons, never a fallback opinion.

`src/lib/pipeline/thesis-generator.ts` fetches the source page (`safeFetchRemote`, HTML stripped),
calls the writing model with `buildThesisPrompt`, parses and validates. Skips when the source is too
thin or the model finds no view.

Writer integration: `draftHumanPostContent({ thesis })` → `buildHumanPostPrompt(..., thesis)` swaps
the neutral goal for `THESIS_WRITING_RULES` + `<thesis-data>`, and keeps "do not add facts, numbers or
quotes that are not in the evidence list". Without a thesis the old neutral contract is unchanged.

Lanes: `runners/image-post.ts` adds a `thesis:decide` step and fails the run with
`thesis:skip: <reason>` instead of publishing a viewless post; `POST /api/post-generation/rss`
returns `{skipped, reason}` or `{thesis, content}` for review.

## Risks / open questions

- Model-written claims can be plausible and wrong. Mitigated by quote-level evidence ids, the counter
  evidence kind, and the claim/headline overlap check — not eliminated. Human review still required
  for the first weeks.
- Cost: one extra model call per story, plus one page fetch. Acceptable at current volume.
- Coverage gathering is only the primary page today. Cross-feed corroboration and a search provider
  are the next slice; `generateThesisForStory({extraSources})` already accepts them.
- Skip is a failure state for the run, by design: silence is easier to ignore than a red run.

## Phase D — confirm

`src/lib/pipeline/thesis-confirm.ts` checks the finished post against its own evidence: every
numeric token in the post must appear in the evidence corpus, no raw links, no "see evidence". It
counts digits, not claims, so it is cheap and hard to fool. Failures become `thesis:confirm` in the
run steps and block the publish; the RSS route returns `{skipped, reason}`.

## Repair and tighten

- The thesis prompt now states the hard limits, and a failed validation triggers one repair call that
  keeps the same facts and fixes only the stated problems.
- The writer gets an explicit 180–240 character target. A draft that breaks a hard limit goes through
  one `tightenDraft` rewrite (same claim, fewer words) before the deterministic fallback is used.

## Slices

1. thesis module + validation + tests (done)
2. generator with source fetch + skip rule + tests (done)
3. writer integration + prompt tests (done)
4. image-post runner step + RSS route wiring (done)
5. phase D confirm + repair/tighten passes (done)
6. `THESIS_STAGE=on` in Coolify, container verified (done)
7. cross-feed coverage + search provider (open)

## Proof gates

- `npm run test:unit` — 976 passing, includes 22 thesis tests
- `npx tsc --noEmit -p tsconfig.typecheck.json` — clean
- real story run: thesis with ≥ 2 cited sources, post under 275 chars, claim not a headline restatement
- run visible in `pipeline_runs.steps` as `thesis:decide` with claim/stakes/confidence
