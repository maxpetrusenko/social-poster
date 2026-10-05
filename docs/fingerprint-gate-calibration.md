# Fingerprint gate: claim-judge calibration

Scope: the strict claim judge (`judge.judge_claims(strict=True)`, `claude -p --model sonnet`, subscription). Question: on the production comparison (final candidate vs the rated reference, i.e. light edits), does it pass benign edits and fail factual ones?

## Method

- Reference: `experiments/youtube-body-thinks-before-mind-bgyi1l1p4nw/draft-v1.md`, claims from the existing `extraction.json` (meta claims filtered as in `extract_cache`).
- 41 judged cases, each a minimal edit of one prose segment (`scripts/fingerprint_eval/calibration/cases.py`): 17 PASS (spelling, punctuation, synonym, split, merge, reorder, image, reword, formatting) and 24 FAIL (number, unit, name, entity, negation, causal direction, qualifier, scope, removed claim, swapped attribution, magnitude, polarity). 2 more PASS cases (title change, image between segments) leave every prose segment byte-identical and are covered by the pre-filter with zero calls.
- 11 identity baselines (unchanged segment judged against its own claims) measure the noise floor of the extracted-claim-vs-text comparison.
- Case verdict = gate FAIL if at least one claim is non-entailed. `raw` counts every non-entailed claim. `delta` ignores claims already flagged on the unchanged baseline segment (this is what a production gate should do, see policy).
- Run: `python -m scripts.fingerprint_eval.calibration.run [--plan current:3 A:1 B:3] [--report-only]`. Cache: `calibration/results/cache.jsonl` (keyed by model + exact prompt + run index); metrics: `results/metrics.json`. Prompts: `calibration/prompts.py`.

## Results

| Prompt | Runs | raw TP/FP/TN/FN | precision / recall (raw) | delta FP/FN | baseline flags on unchanged text | case flip rate | claim flip rate |
|---|---|---|---|---|---|---|---|
| current (judge.py) | 3 | 24/4/13/0 (single run) | 0.857 / 1.00 | 1 / 0 (majority of 3: 1 / 0) | 2/102 | 12.2% | 3.1% |
| A: "paraphrase = entailed, changed only on fact dimensions" | 1 | 24/2/15/0 | 0.923 / 1.00 | 2 / 0 | 0/102 | n/a (1 run) | n/a |
| B: A + quote evidence + name the dimension | 2 full + 5 partial of 3 | 24/0/17/0 | 1.00 / 1.00 | 0 / 0 (single, majority, any) | 1/102 | 0.0% | 0.2% |

Per-category misses:
- current: PASS punctuation (n02, n03 raw), split (n08 raw), formatting (n16, bold markers). Flaky: n03, n04, n11, n16. No FAIL category missed.
- A: PASS punctuation (n02) and formatting (n16).
- B: none.

Caveats, stated plainly:
- Sonnet hit the subscription session limit during B's third run (47 of 52 third-run calls failed with `claude -p failed rc=1`, then "You've hit your session limit"). B's stability figures are therefore from 2 complete runs plus 5 third runs, A has 1 run. Re-run `--plan current:3 A:3 B:3` after the limit resets (cache makes it incremental) to close this.
- Real calls: 364 successful, plus up to about 94 failed attempts. Slightly over the 400 budget.
- Each FAIL case is a single edit, so one flagged claim is enough; 2-flag thresholds are meaningless here (recall drops to 0.125).
- Small n (41) and one article. Zero FN on all three prompts means this set does not separate them on recall. Differences are in FP and stability only. The current prompt on the earlier full Claude rewrite (11 changed, 1 missing of 148) is a different regime (heavy paraphrase) that these light-edit fixtures do not cover; A/B were not re-run on that rewrite (budget).

## Recommendation

1. Prompt: adopt B (`docs/calibration/judge.patch`, applies cleanly to `judge.py`: new `JUDGE_PROMPT` plus parser accepting the extra `evidence` / `dimension` keys). Best precision and stability here, equal recall. A is a cheaper fallback if output tokens matter.
2. Baseline-delta rule: judge the reference against its own claims once (cache with the extraction), store the claims flagged there, and fail the gate only on non-entailed claims outside that set. With the current prompt this alone cut FP from 4 to 1 in a single run, because extraction paraphrases (e.g. "registers a fact") are the main source of noise.
3. Tolerance: target 0 FN. Gate fails on any new non-entailed claim after baseline-delta. Do not allow "N changed is fine": every FAIL case here produced exactly the flag we want from 1 claim, so a count tolerance would only create false negatives. Absorb noise with confirmation instead: when a segment has flags, re-judge that segment 2 more times and fail only if at least 2 of 3 runs flag the same claim (majority). Under the current prompt, any-of-3 gave 5 FP while majority-of-3 gave 1. It costs extra only on flagged segments.
4. Pre-filter (`calibration/prefilter.py`): if `normalize(candidate_segment) == normalize(reference_segment)` (NFKC, lowercase, image markdown stripped, whitespace collapsed; punctuation kept because `13.2` vs `132` matters), skip the judge. Skips title edits, inserted images, and untouched segments. Zero FAIL cases were wrongly skipped. In production most of the 19 prose segments will be identical, so judge calls drop roughly in proportion to the unedited share.
5. Unexplained differences stay failures: a segment that cannot be judged after the retry still raises (unchanged strict behaviour). Note the rc=1 session-limit failure mode above: the gate should surface it as an infrastructure error, not as a content failure.

## Cost per article (estimate)

Article: 148 claims, 19 prose segments. Subscription means no marginal dollars, but call volume counts against the session limit. Without pre-filter: 19 calls per run. Current prompt output is about 25 tokens per claim (about 3.7k tokens); B is about 2.4x that (about 9k) because of evidence quotes. At Sonnet API list prices (not billed here) that is roughly $0.11 (current) versus $0.18 (B) per full pass. With pre-filter plus confirmation re-judging of flagged segments only, a typical light-edit article is 2 to 6 calls. Measure real wall time and token usage once the limit resets; these figures are estimates from prompt/claim sizes, not metered.
