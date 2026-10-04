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

```bash
python3 -m scripts.fingerprint_eval.run --gate --article <final.md> --draft <approved-draft.md> \
  --author-corpus ... --pipeline-corpus ... --out <dir> [--gate-threshold 0.90]
```

Writes `gate.json`. Exit 0 pass, 1 blocking failure, 2 could not evaluate (never a silent pass). Blocking: any changed/missing/unjudged claim, any lost heading, image, code block or link, whole-document semantic similarity below the threshold. Advisory (reported, never fail): author-anchor distance, style shape, n-grams, templates, per-section similarity. Advisory checks become blocking only after about 10 articles of calibration.

## Rewrite (rewrite.py)

Proposition regeneration, own implementation of the reweave idea. Headings, images, code, lists, quotes, boilerplate sections and tiny blocks are frozen and re-emitted verbatim. Each remaining prose segment is reduced to atomic propositions (JSON, extractor qwen3:8b), the source wording is dropped, and prose is regenerated from the propositions by a rewriter of a different model family. Links ride on propositions and are checked after regeneration.

`writer_family != rewriter_family` is enforced in code (`assert_different_family`). The `--control` flag is the only way around it: an A to A rewrite with the same family (`codex exec`), labeled `control` in metrics.json, so any A to B movement can be read against what any rewrite does.

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
- `claude -p` and `codex exec` use subscriptions only; API keys are stripped from the child env (`apiKeySource=none` verified on `claude -p --output-format stream-json --verbose`).
- Proposition extractor defaults to `claude:sonnet` (`--extractor`), recorded in metrics.json `extractor`, separate from each rewriter. The family guard applies to rewriters only.
- Self-family judging is possible when the judge shares a family with a rewriter; the report names the judge per column.

## External lanes (external.py, optional)

pystylometry (Burrows/Cosine Delta cross-check, separate py3.12 uv venv) and reweave `score` (offline human-signature, observational only). The `ai-text-watermark-remover` clone lives in `~/Desktop/Projects/oss/` and no code from it is copied into this repo.
