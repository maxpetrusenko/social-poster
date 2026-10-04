---
read_when: touching the Medium article pipeline final review, style metrics, rewrite experiments, or the fingerprint gate
---

# Fingerprint / style eval stage

Eval-only. Nothing here changes a publish path, an article package, or Medium. The stage reads an article, writes candidates and metrics under `experiments/<slug>/`, and (in `--gate` mode) exits non-zero on blocking failures. Wiring into the Hermes cron is a separate change owned by Hermes.

**Objective: style preservation toward Max's pre-2023 corpus plus meaning retention. Detector scores are not an optimization target.** Detector and watermark numbers, when they exist, are observations only.

Protocol: `manager/brain/shared/ops/ai-fingerprinting-research-protocol.md`.

## Tiers

| Tier | Runs | Contents |
|---|---|---|
| fast | every article | style metrics, author-anchor distance, semantic similarity, claim preservation, structure preservation, repeated n-grams, templates, human diff |
| research | stub, nightly later | passive detectors, watermark probes (no vendor keys, so GPT/Claude watermarks are not verifiable), factorial rewrite study, image provenance. `--tier research` only writes `research-tier.json` saying not run |

## Run

```bash
export HTTPS_PROXY= HTTP_PROXY=            # the gateway is direct; the broker proxy breaks it
# gateway key: LLM_GATEWAY_API_KEY from env, else fetched from Doppler api_keys/dev in-process (never printed)
python3 -m scripts.fingerprint_eval.run \
  --article .cache/fingerprint-eval/target/<slug>/article-v8.md \
  --author-corpus <medium-export>/posts \
  --pipeline-corpus .cache/fingerprint-eval/pipeline \
  --out experiments/<slug>/ \
  --rewriters qwen3:8b,gemma4,claude:sonnet --control codex --judge claude:sonnet
python3 -m unittest scripts.fingerprint_eval.tests.test_fingerprint_eval
```

Corpora: author = posts dated before 2023-01-01 with at least 150 words (HTML stripped). Pipeline = latest `article-vN.md` of each article dir (skip `_blocked*`, newest 30). Cache dirs are gitignored; the one committed experiment is the reviewed output.

### Gate mode (final review)

A hard pre-publish gate that fails closed.

```bash
python3 -m scripts.fingerprint_eval.run --gate --article <final.md> --draft <approved-draft.md> \
  --author-corpus ... --pipeline-corpus ... --out <dir> [--gate-threshold 0.90] [--extractor claude:sonnet] [--judge claude:sonnet] [--refresh-extraction]
```

Writes `gate.json` (a stale one is deleted at start). Exit codes:

- 0 PASS
- 1 FAIL: every check completed and the content violates policy
- 2 ERROR: anything that prevented reliable evaluation. Never read 2 as a pass or as a content verdict.

ERROR covers: missing or same-path `--draft` (identical content under a different path is a legitimate PASS, recorded as `reference_identical: true`), missing files or corpus dirs, `--gate-threshold` outside (0, 1], `--tier research`, extraction failure, any prose segment or the whole reference with zero claims, any judge reply that is not exactly one schema-valid JSON list with the requested claim ids (one retry, then ERROR), any unjudged claim, bad embeddings (count, dimensions, non-finite, zero vector), failure to write `gate.json`, and any unexpected exception.

FAIL (blocking): changed or missing claim; any difference in frozen blocks (lists, quotes, code, tables, images, short and boilerplate paragraphs; compared exactly, diff in `reasons`); lost heading, code block, image (inline or reference-style anywhere in a line) or link (inline, reference plus definition, autolink, bare URL); whole-document similarity below the threshold. Advisory (reported, never fail, so an advisory error does not change the exit code): author-anchor distance, style shape, n-grams, templates, per-section similarity. Advisory checks become blocking only after about 10 articles of calibration.

Extraction cache (`gate-extraction.json`, `extraction.json`) stores schema version, source sha256, extractor id and per-segment hashes; any mismatch or missing segment regenerates. Child processes get allowlisted envs only: `claude -p` gets PATH/HOME/USER/LANG/TERM plus Claude subscription auth (`CLAUDE_CODE_OAUTH_TOKEN`), `codex exec` gets the minimal set; no API keys or gateway key.

## Rewrite (rewrite.py)

Proposition regeneration, own implementation of the reweave idea. Headings, images, code, lists, quotes, boilerplate sections and tiny blocks are frozen and re-emitted verbatim. Each remaining prose segment is reduced to atomic propositions (JSON, extractor qwen3:8b), the source wording is dropped, and prose is regenerated from the propositions by a rewriter of a different model family. Links ride on propositions and are checked after regeneration.

`writer_family != rewriter_family` is enforced in code (`assert_different_family`). The `--control` flag is the only way around it: an A to A rewrite whose family must equal the writer's known family (`assert_same_family`; otherwise error), e.g. `codex exec`, labeled `control` in metrics.json, so any A to B movement can be read against what any rewrite does.

## Metrics (metrics.py), grouped by `signal_family`

| Group | signal_family | Meaning |
|---|---|---|
| sentence/paragraph-length JSD, repeated n-gram rate, templates, pipeline outlier | stylistic_structural | Jensen-Shannon distance (0 identical, 1 disjoint) between length histograms; share of 3 to 5 gram tokens that repeat; regex detectors for "This isn't X. It's Y.", "Not X, but Y", rule-of-three lists, hook, bullets, caveat, conclusion flow; z-score and percentile of the composite distance against the pipeline corpus centroid |
| author distance before/after | author_anchor | JSD for sentence, paragraph, punctuation histograms; function-word cosine and Burrows Delta (z-scored over author plus pipeline documents); composite = mean of the four distances. Lower = closer to the pooled pre-2023 corpus. Negative delta = moved toward the author |
| semantic similarity, claims, structure | semantic_retention | nomic-embed-text cosine per section and whole; claims extracted from the original judged entailed, changed, or missing in the rewrite; headings, images, code, links verbatim |
| watermark_tests | watermark | research only, not run |
| provenance | provenance | n/a for text |

Caveats: the author corpus is short-form (comments, notes) while pipeline articles are long digests, so genre differences inflate distances for both. One article and one run is indicative, not a result. Reports state which signal moved, by how much, under which transform; they do not claim attribution or provenance changes.

## Judge and models

- Gateway (`https://llm.maxpetrusenko.com/v1`): qwen3:8b (emits hidden reasoning, so `max_tokens` must be large and generation is slow), nomic-embed-text. `gemma4` is not served by the gateway at the time of writing (`model 'gemma4-32k' not found`).
- `claude -p` and `codex exec` use subscriptions only; child env is an allowlist (no API keys) (`apiKeySource=none` verified on `claude -p --output-format stream-json --verbose`).
- Proposition extractor defaults to `claude:sonnet` (`--extractor`), recorded in metrics.json `extractor`, separate from each rewriter. The family guard applies to rewriters only.
- Self-family judging is possible when the judge shares a family with a rewriter; the report names the judge per column.

## External lanes (external.py, optional)

pystylometry (Burrows/Cosine Delta cross-check, separate py3.12 uv venv) and reweave `score` (offline human-signature, observational only). The `ai-text-watermark-remover` clone lives in `~/Desktop/Projects/oss/` and no code from it is copied into this repo.
