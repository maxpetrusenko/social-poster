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

## Adopted policy run (2-of-3, 2026-10-04) [superseded by W12b below: first pass is final, confirmation is telemetry only]

`judge.judge_claims` now implements the policy: prompt B, identity pre-filter, and 2-of-3 confirmation (flagged claims only, batched per segment, two extra passes; per-claim `votes` recorded; `overturned` lists flags the vote dropped). Runner: `python -m scripts.fingerprint_eval.calibration.policy_eval --heavy --max-calls 150` (raw replies cached in `results/policy_cache.jsonl`, metrics in `results/policy_metrics.json`).

Fixtures: the 41 light-edit cases plus 10 heavier ones (`calibration/heavy.py`): 5 PASS are multi-sentence paraphrases of a whole reference segment (8 to 12 claims each) keeping every fact; 5 FAIL are the same paraphrase with exactly one number changed. First passes for the 41 light cases are replayed from the earlier prompt-B run 0 (same prompt text and model; evidence/dimension were not stored then); every confirmation call and all 10 heavy first passes are fresh `claude -p` calls.

| Set | Policy | TP/FP/TN/FN | precision / recall | judge calls per case |
|---|---|---|---|---|
| light (41) | first pass only | 24/0/17/0 | 1.00 / 1.00 | 1.0 |
| light (41) | 2-of-3 | 24/0/17/0 | 1.00 / 1.00 | 2.15 |
| heavy (10) | first pass only | 5/0/5/0 | 1.00 / 1.00 | 1.0 |
| heavy (10) | 2-of-3 | 5/0/5/0 | 1.00 / 1.00 | 2.0 |
| all (51) | 2-of-3 | 29/0/22/0 | 1.00 / 1.00 | 2.12 |

- Calls: 69 real judge calls this run (49 light, 20 heavy), within the 150 budget. PASS cases cost 1 call, FAIL cases 3 (1 + 2 confirmations); a case costs more than 3 only when a retry fires (1 retry in this run).
- Flip rate: case-level 0.0% and claim-level 0.2% for prompt B across its 2 complete runs on the light set (table above; not re-measured). On the 51-case policy run, 41 confirmed claims produced 1 non-unanimous vote: in `hf_b` a second claim was flagged on the first pass and dropped 2-of-3, while the real number change was confirmed 3-of-3. So the vote overturned exactly one false flag and never an actual change.
- Heavy FAIL cases: all 5 flagged the changed number with dimension `number` and a 3-of-3 vote; heavy PASS cases (long paraphrase, every sentence rewritten) produced 0 flags in the first pass.
- Caveats: still one article and small n; heavy edits are 5 per class and share 3 reference segments; the PASS paraphrases were written by one author in one style. Zero errors this run, so the session-limit failure mode was not exercised.

## Held-out calibration of the adopted policy (W12, 2026-10-04)

Question: does the adopted policy (prompt B + identity pre-filter + 2-of-3, `judge.judge_claims` unchanged) hold up on an article it was never tuned on? No tuning: `judge.py` and the prompt were not touched, labels were committed first (commit `test(fingerprint): commit held-out judge fixtures and labels...`), the numbers below are the first and only run.

Fixtures (`calibration/heldout/`): article `youtube-ai-born-9-seconds-9xloavitugi/article-v1.md` (about AI behavior under observation; copied read-only from the mini), claims from the production extractor (`claude:sonnet`, `extraction.json`, no coverage retry). 48 judged cases, 4 per category, each a minimal edit of one segment: PASS = paraphrase, merge, split, reorder; FAIL = number, entity, causality, qualifier, certainty, added-claim, removed-claim, short-claim. Plus 6 identity cases (unchanged segment, one with an appended image). Cases are 48 not 60 because of the call budget: 3 full runs cost about PASS + 3 x FAIL per run, which is 112 calls at 48 cases and about 140 at 60 (420 total, over the 350 cap).

Run: `python -m scripts.fingerprint_eval.calibration.heldout.run` (`claude -p --model sonnet` through `gateway.claude_env`, subscription, 3 full runs, raw replies cached in `heldout/results/cache.jsonl`, metrics in `results/metrics.json`). 293 real calls (cap 350), 0 errors, 0 retries failed.

| Category | label | policy TP/FP/TN/FN (3 runs x 4 cases) | first pass only |
|---|---|---|---|
| paraphrase | PASS | 0/0/12/0 | 0/0/12/0 |
| merge | PASS | 0/0/12/0 | 0/0/12/0 |
| split | PASS | 0/0/12/0 | 0/0/12/0 |
| reorder | PASS | 0/0/12/0 | 0/0/12/0 |
| identity (pre-filter) | PASS | 0/0/18/0, 0 calls | same |
| number | FAIL | 12/0/0/0 | 12/0/0/0 |
| entity | FAIL | 12/0/0/0 | 12/0/0/0 |
| causality | FAIL | 12/0/0/0 | 12/0/0/0 |
| short-claim | FAIL | 12/0/0/0 | 12/0/0/0 |
| certainty | FAIL | 8/0/0/4 | 11/0/0/1 |
| removed-claim | FAIL | 8/0/0/4 | 9/0/0/3 |
| qualifier | FAIL | 3/0/0/9 | 7/0/0/5 |
| added-claim | FAIL | 0/0/0/12 | 0/0/0/12 |
| **overall (162 case-runs)** | | **67/0/66/29, precision 1.00, recall 0.70** | 75/0/66/21, precision 1.00, recall 0.78 |

Majority of the 3 runs per case (54 cases): TP 23, FP 0, TN 22, FN 9, precision 1.00, recall 0.72.

- Precision: 0 FP in 66 PASS case-runs (48 judged, 18 pre-filtered). The 18 identity case-runs hit the pre-filter, 0 judge calls.
- Stability: per-case policy verdict identical across the 3 runs for 52 of 54 cases; flip rate 3.7% (2 cases: `fk1`, `fr3`, both FAIL cases at the edge of detection). First-pass flip rate is the same 3.7%.
- 2-of-3 confirmation: 75 case-runs were flagged on the first pass; confirmation overturned 8 of them (9 claims) to PASS. All 8 were wrong: every overturned flag sat in a FAIL case (`fq1`, `fq3`, `fk3` in all 3 runs each, `fr3` once, plus none in PASS cases). The vote never overturned a false flag because there were none to overturn (first-pass FP = 0). Net effect on this set: recall 0.78 down to 0.70, precision unchanged at 1.00. The overturns were systematic, not noise: for those 3 claims the first pass said `changed` and both confirmations said `entailed`, every run. Of 73 confirmed claims, 4 had a non-unanimous vote.
- Calls: 1.81 per case-run overall; PASS 1.00, FAIL 2.56 (3.0 when the first pass flags and 1.0 when it does not), identity 0.

Honest note on the misses (all FN, all on FAIL categories; no category with PASS misses):
- added-claim, 0/12: structural, not a prompt miss. The judge only checks each reference claim against the candidate. A sentence added to the candidate that contradicts no reference claim cannot be flagged. The gate has no candidate-to-reference direction, so unsupported additions pass unseen. This is the largest hole.
- qualifier, 3/12 (fq1 "might mean" to "means" and fq3 "a reason to expect" to "will" were flagged by the first pass and overturned; fq4 deleting "partly" was never flagged): hedge deletions on claims whose extraction was already loose ("might merely reflect" stored as "might merely reflect") are judged entailed when the confirmation sees the claim without segment context.
- certainty, 8/12 (fk3 "evidence that" to "proves that", flagged first then overturned in 3 of 3 runs; fk1 flapped): "suggests" to "proves" is the weakest dimension after hedges.
- removed-claim, 8/12: `fr1` (a one-line sentence "Anthropic wrote the caveat into their own report") was never flagged in any run: the following sentence still says "Anthropic's own reading", so the stored claim "Anthropic included this caveat" looks entailed. `fr3` is unstable (missing, entailed, changed).
- Not covered: still one article, 4 cases per category, one author's edit style. 12 case-runs per category are 4 independent cases, not 12.

Recommendations (not applied, policy unchanged here):
1. Add the reverse direction: judge the candidate segment's sentences against the reference text (or extract claims from the candidate and check them against the reference) so added claims are caught. Highest value; closes the 0/12 category.
2. Do not drop first-pass flags on modality (hedge, certainty) dimensions via a 2-of-3 vote. Confirmation re-judges the flagged claim alone without the surrounding sentence; either give confirmation passes the same full batch and prompt context, or require unanimous `entailed` (3 of 3) to overturn a first-pass flag on dimension `modality`. On this set that would restore 8 of the 8 overturned true flags and cost no FP (first-pass FP was 0), but it is a hypothesis to test on a new held-out set, not something to tune on this one.
3. Re-extract hedged claims with the hedge as a separate, mandatory claim ("X is stated as uncertain") so `might` to `means` is a number-like check.
4. Keep the pre-filter and prompt B as they are; they held (0 FP, 0 judge calls on 18 unchanged case-runs, 3.7% flip rate).

## Baseline-delta (optional, not implemented)

Judging the reference against its own claims and ignoring claims flagged there is NOT part of `judge_claims`. With prompt B plus 2-of-3 it removed no FP (raw FP is already 0 on these 51 cases), so it is left as an optional hardening for articles whose extraction paraphrases are noisy. Wiring it needs a gate.py change (cache the reference's baseline flags next to the extraction and subtract them from `flagged`).

## Recommendation

1. Prompt (adopted): B (`docs/calibration/judge.patch`, applies cleanly to `judge.py`: new `JUDGE_PROMPT` plus parser accepting the extra `evidence` / `dimension` keys). Best precision and stability here, equal recall. A is a cheaper fallback if output tokens matter.
2. Baseline-delta rule (optional, see above; not adopted): judge the reference against its own claims once (cache with the extraction), store the claims flagged there, and fail the gate only on non-entailed claims outside that set. With the current prompt this alone cut FP from 4 to 1 in a single run, because extraction paraphrases (e.g. "registers a fact") are the main source of noise.
3. Tolerance: target 0 FN. Gate fails on any new non-entailed claim after baseline-delta. Do not allow "N changed is fine": every FAIL case here produced exactly the flag we want from 1 claim, so a count tolerance would only create false negatives. Absorb noise with confirmation instead: when a segment has flags, re-judge that segment 2 more times and fail only if at least 2 of 3 runs flag the same claim (majority). Under the current prompt, any-of-3 gave 5 FP while majority-of-3 gave 1. It costs extra only on flagged segments.
4. Pre-filter (adopted; implemented in `judge.py`, re-exported by `calibration/prefilter.py`; judged segments are reported as `prefiltered_segments`, `judge_calls` counts real calls): if `normalize(candidate_segment) == normalize(reference_segment)` (NFKC, lowercase, image markdown stripped, whitespace collapsed; punctuation kept because `13.2` vs `132` matters), skip the judge. Skips title edits, inserted images, and untouched segments. Zero FAIL cases were wrongly skipped. In production most of the 19 prose segments will be identical, so judge calls drop roughly in proportion to the unedited share.
5. Unexplained differences stay failures: a segment that cannot be judged after the retry still raises (unchanged strict behaviour). Note the rc=1 session-limit failure mode above: the gate should surface it as an infrastructure error, not as a content failure.

## Cost per article (estimate)

Article: 148 claims, 19 prose segments. Subscription means no marginal dollars, but call volume counts against the session limit. Without pre-filter: 19 calls per run. Current prompt output is about 25 tokens per claim (about 3.7k tokens); B is about 2.4x that (about 9k) because of evidence quotes. At Sonnet API list prices (not billed here) that is roughly $0.11 (current) versus $0.18 (B) per full pass. With pre-filter plus confirmation re-judging of flagged segments only, a typical light-edit article is 2 to 6 calls. Measure real wall time and token usage once the limit resets; these figures are estimates from prompt/claim sizes, not metered.

## W12b: recall-first gate, measured end to end (2026-10-05)

Policy reasoning: a FAIL is cheap (the healer restores the section from the rated reference), a missed factual change is expensive, so every doubt resolves toward FAIL. The held-out finding above (judge level: precision 1.00, recall 0.70) came from the 2-of-3 vote overturning true flags and from claims the judge never sees (additions, hedges). Changes, all in `scripts/fingerprint_eval/`:

1. `judge.py`: any first-pass changed/missing flag is final. `judge_claims(confirm_telemetry=True)` (gate constant `JUDGE_CONFIRM_TELEMETRY`, default off, so no confirmation calls) re-judges flagged claims twice and records the votes on the flag; a vote never clears anything and a failed telemetry call is ignored. `majority()` is gone; `overturned` is always empty.
2. `claimcheck.py` (new, no LLM): every reference prose sentence is aligned to the final sentence(s) carrying it (merge and split aware, content-token containment: 0.7 single, 0.6 adjacent pair, 0.5 weak single). Per aligned group the union of numbers, negations and the hedge/certainty/quantifier lexicon must be equal; any add, remove or swap is a `changed` finding (CONTENT_CLAIM_FAILURE). Lexicon: the brief's list plus will/would/should/must/usually/typically/generally/sometimes/few/several/mostly/largely/mainly/seldom/definitely/certainly/clearly/possible/probable/potentially/roughly/virtually, verbs lemmatised (shows/showed/shown), phrases (at least, up to, at most, more than, less than, fewer than, a few, "part of" = some), "about" only before a number. Numbers and negations reuse `added._signature`.
3. Same module, removed sentences: a reference sentence with >= 4 content tokens and no counterpart is a `missing` finding whatever the extractor produced. A lexically unaligned sentence gets one embedding rescue (cosine >= 0.85 against the final sentences of its own section, singles and adjacent pairs) so a heavy paraphrase is not read as a removal; embeddings are only requested when some sentence is unaligned. The 0.85 was read off held-out set 1 (paraphrases 0.86 to 0.91, removals 0.64 to 0.81); the margin is thin.
4. `gate.py`: the deterministic claim check runs before extraction and judging; a hit returns a partial FAIL (`checks_skipped: claim_judge, added, semantic`), with one `flagged_claims` entry per finding (section, verdict, dimension) that the healer already consumes. Extraction prompt keeps hedges and quantifiers verbatim in the claim text; extraction cache schema 3 to 4.
5. Defects found by the first real end-to-end runs, fixed because they blocked or inflated the measurement (all in files this work owns):
   - The judge pre-filter compared a segment's reference text with the WHOLE final section, so every segment of a multi-segment section looked edited and cost one call (about 11 calls per case instead of 1 to 3). `gate.py` now marks a segment identical when it survives verbatim in its section.
   - A reference sentence that the extractor, asked about exactly that sentence, says carries no claim ("Here is the part that keeps the picture honest.") made the whole gate ERROR. It is now recorded in the extraction cache (`nonfactual`) and counted as covered; its removal is still caught by the removed-sentence check.
   - "Read next: [title](url)" and "For a useful next read, try [..](..)" paragraphs yield no claim and ERRORed the gate; they are frozen (byte-exact) now.
   - `added.new_sentences` sent a benign split fragment ("So is the deployment.") or merged sentence to the extractor as a new claim (ERROR, or an unsupported-claim false alarm). A final sentence that only re-cuts reference sentences that no final sentence retains verbatim, and adds no number, negation or entity, is no longer new.

Run: `doppler run -p api_keys -c dev -- env HTTPS_PROXY= HTTP_PROXY= python -m scripts.fingerprint_eval.calibration.e2e --set {1,2} --max-calls N [--resume] [--work DIR]`. It calls `gate.run_gate` (identity shortcut off) once per case with `claude -p --model sonnet` for extraction, judge and added-claim support (subscription, `gateway.claude_env`) and the gateway for embeddings; the reference extraction is done once per set. Rows: `calibration/heldout{,2}/results/e2e.jsonl`, metrics `e2e_metrics.json`. Set 1 identity is one byte-identical final (the appended-image case is a structure check, not a claim check, and is omitted).

### Set 1 (SEEN: the first run exposed the defects above and the code was adjusted against it; do not read these as an estimate)

| Category | label | TP/FP/TN/FN | caught by |
|---|---|---|---|
| paraphrase | PASS | 0/1/3/0 | pa1 judge first pass |
| merge, split, reorder, identity | PASS | 0/0/13/0 | none |
| number | FAIL | 4/0/0/0 | claim-det 4 |
| entity | FAIL | 4/0/0/0 | judge 4 (added 3) |
| causality | FAIL | 4/0/0/0 | judge 4 |
| qualifier, certainty, removed-claim | FAIL | 12/0/0/0 | claim-det 12 |
| added-claim | FAIL | 4/0/0/0 | added 4 |
| short-claim | FAIL | 4/0/0/0 | claim-det 1, judge 3 |
| **overall (49)** | | **32/1/16/0, precision 0.97, recall 1.00** | |

About 280 real `claude -p` attempts over 4 invocations (the first one burned most of its 160 on the pre-filter defect). Judge-level baseline on the same cases was recall 0.70.

### Set 2 (UNSEEN, the number that counts)

Article `youtube-immune-system-actually-works-lxfek8g8cui/article-v11.md` (a third article, biology, copied read-only from the mini), 49 cases (4 per category, same 12 categories, plus one byte-identical final). Labels committed before any model call (`calibration/heldout2/cases.py`, commit `test(fingerprint): commit held-out set 2 labels...`). Code frozen before the run; one run, nothing tuned afterwards.

| Category | label | TP/FP/TN/FN | caught by |
|---|---|---|---|
| paraphrase | PASS | 0/2/2/0 | FP pa2, pa4: claim-det |
| merge | PASS | 0/0/4/0 | none |
| split | PASS | 0/1/3/0 | FP ps1: judge first pass |
| reorder | PASS | 0/0/4/0 | none |
| identity | PASS | 0/0/1/0 | none |
| number | FAIL | 4/0/0/0 | claim-det 3, judge 1 |
| entity | FAIL | 4/0/0/0 | judge 4 (added 2) |
| causality | FAIL | 3/0/0/1 | judge 3; FN fc4 |
| qualifier | FAIL | 4/0/0/0 | claim-det 4 |
| certainty | FAIL | 4/0/0/0 | claim-det 4 |
| added-claim | FAIL | 4/0/0/0 | added 4 |
| removed-claim | FAIL | 4/0/0/0 | claim-det 4 |
| short-claim | FAIL | 4/0/0/0 | claim-det 2, judge 2 (added 1) |
| **overall (49)** | | **31/3/14/1, precision 0.91, recall 0.97** | |

Calls: 59 `claude -p` calls (10 reference extraction + 49 across the cases, 0 errors, 0 budget hits; cap 200), 544 gateway embedding requests. Cases that the deterministic check fails cost 0 calls.

Misses, documented only (nothing was changed after seeing them):
- FP pa2: "sometimes willing to die" rewritten "sometimes will die"; the lexicon reads `will` as an added modal. FP pa4: "a defense system missing a stop rule becomes dangerous by continuing to defend" rewritten "without a stop rule ... by never ceasing"; `without` and `never` are negations/modality terms that the paraphrase introduced for a "missing"/"continuing" reading. Both are honest consequences of "any add, remove or swap is a FAIL": the check cannot tell a meaning-preserving substitution from a change. Cost: the healer restores the section.
- FP ps1: the judge's first pass flagged one claim on a split paragraph; before this change the 2-of-3 vote could have cleared a lone flag like this one.
- FN fc4: a reversed "because" clause in a one-sentence paragraph ("Slow precision can lose the organism ... because the body accepts collateral damage"). Every token, number, negation and hedge is unchanged, so the deterministic checks are blind to it and the judge entailed it. The judge is the only defense against causality reversals and missed one of four here; set 1 saw four of four.
- Not claimed: set 2 is 4 cases per category by one author; 31 TP of 32 FAIL cases is an interval, not a rate.
