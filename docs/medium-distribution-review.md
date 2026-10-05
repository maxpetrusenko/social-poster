# Medium distribution review

read_when: changing the release order of operations, adding a pre-publish evaluator, or interpreting a Medium review scorecard.

Advisory evaluator for how Medium's published Distribution Guidelines would read a story. Code: `scripts/medium_review/`. Policy source of truth: <https://help.medium.com/hc/en-us/articles/360006362473-Medium-s-Distribution-Guidelines-How-curators-review-stories-for-Boost-General-and-Network-Distribution>.

A score does not guarantee Boost. Medium describes the guidelines as nuanced characteristics, not a checklist; curators decide.

## Three separate concerns

| Concern | Module | Question | Blocks release |
|---|---|---|---|
| Integrity | `scripts/fingerprint_eval` gate | Did the bytes keep the claims, links, images and structure of the reference? | Yes (only producer of PASS) |
| Fingerprint | `scripts/fingerprint_eval` advisory metrics | Style diagnostics: author distance, JSD, repeated n-grams | No |
| Distribution | `scripts/medium_review` | Would Medium curators see substantive author contribution, originality, reader value, craft, sourcing; any policy risk? | No. Advisory; the release controller decides |

The three share no logic. `medium_review` imports only `authz.resolve_package` (the one canonical final-article resolver), `gateway.claude_env`/`extract_json`, `refs.find_refs` and `textutil` helpers from fingerprint-eval and edits nothing there. Model calls go through `medium_review/llm.py`, a local `claude -p` wrapper (subscription env from `claude_env`, no API keys) that keeps the stdout/stderr tail in the error record because `gateway.claude_cli` drops stdout; rate-limit and session-limit messages map to `MODEL_UNAVAILABLE`, and the ERROR record's `error` text is prefixed with the category, e.g. `[MODEL_UNAVAILABLE]`.

## Order of operations

1. Author contribution / originality review (what does the author add beyond the source material?)
2. Medium distribution review (`review`)
3. Safe self-healing (`autofix`, optional `propose`)
4. Integrity gate (fingerprint-eval)
5. Fingerprint diagnostics
6. Exact content hash
7. Release authorization
8. Publish

Any edit invalidates the integrity PASS. `autofix` and `propose` write new files (`article-medium-fix-<n>.md`, `article-medium-proposal-<n>.md`) and flag `requires_integrity_gate: true`; the edited bytes have a new hash and must pass step 4 again, then the review is re-run on the final bytes (the cache is keyed by content hash, so this costs one model call only if the bytes changed).

## AI policy framing

Policy constraints, not detector evasion. The reviewer is told to judge the substantive author contribution (is real experience, analysis or reporting integral to the piece, or is it a derivative summary?) and explicitly not to judge AI-detectability or guess provenance. Nothing here rewrites text to look human. When author contribution is weak the tool never invents experience; it surfaces trusted author material or sets `AUTHOR_INPUT_REQUIRED`.

## CLI

```
python -m scripts.medium_review review  --package P [--article F] [--json] [--force]
python -m scripts.medium_review autofix --package P [--article F] [--json]
python -m scripts.medium_review propose --package P [--article F] [--json] [--force]
```

Exit 0 = reviewed (advisory), 2 = ERROR (policy unreachable with no cache, model reply invalid after one retry, or no article). The package may be any directory plus `--article` (e.g. an `experiments/` dir).

## Policy cache (`policy.py`)

`data/medium-policy/<YYYY-MM-DD>-<sha12>.md|.json` plus `CURRENT.json`. Fetch order: page, `browse.sh get`, Zendesk API. Re-fetched at most daily; a failed fetch falls back to the cache and records `fetch_status: cache-fallback` and the error. `policy_version = <content sha256[:12]>@<page updated_at>`. A review never fails because the network is down while a cache exists.

## Artifacts (`<package>/evals/medium-distribution/`)

- `MEDIUM_REVIEW.json` (and identical `latest.json`): the artifact. `binding` ties it to the article content sha256, policy version/date/hash, evaluator git SHA and timestamp.
- `<content12>-<policy12>.json`: cache-keyed copy. Cache key = content sha256 + policy_version + evaluator id (git SHA, `-dirty-<tree>` if `scripts/medium_review` is uncommitted). A hit makes zero model calls.
- `SUMMARY.md`: human summary; always states that a score does not guarantee Boost.

Top-level sections: `scorecard` (dimensions writer_experience, originality, reader_value, craftsmanship, title_quality, image_quality, sourcing with rating + evidence quote, plus `boost_candidate`, `general_distribution_risk`, `derivative_summary`, `author_contribution`), `hard_policy_risks[]`, `warnings[]`, `boost_quality_opportunities[]`, `safe_auto_fixes[]` (applied or available), `author_input_required {required, reason, candidate_trusted_material[]}`, and `deterministic` (code checks, no model). Model risks carry a category (`hard_policy`, `formulaic`, `content_marketing`, `traffic_harvesting`, `derivative`, `other`); only `hard_policy` lands in `hard_policy_risks`. Evidence quotes are verified against the article (`quote_found`).

## Safe autofix

ALT text from an existing caption, a meaningful filename or the nearest H2+ heading; image credit from recorded provenance; formatting cleanup; re-attaching a link recorded in `sources/source-notes.md`; removing exact duplicated text; deterministic tag normalization (written as `tags-medium-fix-<n>.json`, metadata files untouched). Never edits claims, never overwrites. Test asserts the non-ALT prose is unchanged.

## Editorial proposal and author material

One optional Sonnet call for weak structure/reader value/title. A validator rejects candidates that add first-person sentences absent from the article and trusted sources, drop or add links/images, or introduce new numbers. Trusted sources searched: `data/fingerprint-eval/author-corpus/`, the package `sources/` and notes, and the allowlist `data/medium-policy/author-sources.json`. Matches are suggestions with file paths; none found sets `AUTHOR_INPUT_REQUIRED`.

## Nightly learning

`nightly_learning.py` (`row_from_package`, `build_rows`, `correlation_table`, `write_report`) is importable by the nightly job; `nightly.py` is not edited. One row per published article, schema `data/medium-policy/learning-row.schema.json`: review characteristics, title features, fingerprint metric references, outcomes (`boost_observed` true/false/unknown, views/reads/claps/fans/earnings with the source of each), `policy_version`, `observed_at` dates. Unknown outcomes are never zero. Tables report n per bucket and are correlation, not causation; do not tune articles toward a bucket.
