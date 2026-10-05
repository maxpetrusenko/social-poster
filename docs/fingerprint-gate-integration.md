# Fingerprint gate: release authorization, self-healing, nightly watchdog

Status: spec for social-poster PRs after #8. One canonical evaluator (`scripts/fingerprint_eval`). Nothing here duplicates evaluation rules.

## Invariants

1. No article reaches a Medium mutation unless an authorization exists for its exact current bytes AND the current evaluator version AND the current author-corpus hash.
2. A PASS is produced only by the canonical gate (`run_gate`) evaluating the exact bytes. Repairs never self-approve.
3. Every content change (repair or edit) yields a new content hash and a full new gate run. No PASS reuse.
4. Infrastructure recovery never modifies article bytes.
5. Repairs are grounded only in the rated reference version, source notes, or cited sources. No invented facts. If support can't be established: quarantine.
6. Bounded: max 3 content repair cycles; infrastructure retries have their own bounded backoff; per-dependency circuit breakers.
7. One bad article never stops the queue: quarantine, notify, continue.
8. The nightly job never edits articles.

## Versions and hashes

- `content_sha256`: sha256 of the final candidate bytes.
- `evaluator_version`: `git rev-parse HEAD` of the social-poster checkout, plus a sha256 over `scripts/fingerprint_eval/**/*.py` (sorted path+bytes) as `evaluator_tree_sha256`. If the tree has uncommitted changes under `scripts/fingerprint_eval`, the version is `<sha>-dirty-<treehash12>`. Release refuses a dirty evaluator (`DEPENDENCY_FAILURE`, no publish).
- `author_corpus`: frozen corpus shipped at `data/fingerprint-eval/author-corpus/` (Max's pre-2023 Medium posts as plain .txt, plus `MANIFEST.json` listing file sha256s). `author_corpus_sha256` = sha256 of the canonical MANIFEST.
- Pipeline corpus: the latest version of the 30 most recent packages, hashed into `pipeline_corpus_sha256` (advisory only; not part of authorization).

## Package files (per article package)

- Final candidate: `version.json.finalFile` if present, else `article-medium.md` if present, else `version.json.articleFile`. The resolver lives in one function. Record which rule chose it.
- Reference (last known-good): the rated version, i.e. the file whose hash the adversarial/prepublish review is bound to (`evals/prepublish-vN.json` or `version.json` rating fields). Fall back to `version.json.articleFile` when final != articleFile. If final == reference bytes, record `reference_identical: true` (legitimate PASS path; claims are judged trivially by identity, so skip the model judge but still run every structural check).
  - The reference choice needs a real look at existing packages; document the rule in the docs.
- Source notes: `sources/source-notes.md` and the evidence/claim ledger if present.
- `evals/fingerprint-gate/runs/<UTC-ts>-<content12>.json`: immutable eval record (schema below).
- `evals/fingerprint-gate/ledger.jsonl`: append-only state transitions.
- `release/medium-final.md` + `release/authorization.json`: written only on PASS.
- `QUARANTINE.json`: written on quarantine; status `NEEDS_REVIEW`.

## Eval record schema (minimum)

slug, final_path, final_resolver_rule, content_sha256, reference_path, reference_sha256, reference_identical, timestamp_utc, evaluator_version, evaluator_tree_sha256, author_corpus_sha256, pipeline_corpus_sha256, models {extractor, judge, embedding} each with name/family/backend/version string, claims {total, preserved, changed, missing, added_unsupported}, links {expected, preserved, missing[]}, images/headings/code/frozen blocks {expected, preserved, diffs}, semantic {whole, section_min, threshold}, advisory {author_distance, sentence/paragraph JSD, repeated_ngram_rate, rule_of_three_count, templates, pipeline_outlier_z, advisory_errors[]}, result PASS|FAIL|ERROR, classification (category below), reasons[], runtime_seconds, raw_report_path, heal_cycle index, parent_content_sha256 (if a repair produced it).

## State chain (ledger.jsonl events)

GATE_REQUESTED (content hash, requester) → GATE_EXECUTED (record path) → RESULT_VALID (schema-valid record, result in PASS/FAIL/ERROR) → RESULT_MATCHES_CONTENT (record.content_sha256 == current bytes AND evaluator_version == current AND corpus == current) → PUBLISH_AUTHORIZED | PUBLISH_BLOCKED (reason). A `status` command reconstructs these five booleans for a package from files alone. A log line is not proof; the record file plus hashes are.

## CLI (single entry point, `python -m scripts.fingerprint_eval.release`)

- `authorize --package <dir> [--max-repairs 3] [--dry-run]`: resolve final → gate → heal loop → on PASS write release files, ledger PUBLISH_AUTHORIZED, exit 0. On quarantine: write QUARANTINE.json, exit 3. On circuit open/infra exhaustion: quarantine with infra category, exit 4. Never publishes anything.
- `verify --package <dir>`: exit 0 only if `release/medium-final.md` bytes == current final bytes, the authorization record is PASS, and evaluator version + corpus hash equal current. Otherwise exit 1 with reason. Medium mutation guards call this.

## Tamper resistance (round 3)

- Binding = content_sha256, evaluator_id, author_corpus_sha256, `evaluator_tree_sha256`, `reference_sha256`, `reference_record_sha256` (sha256 of the prepublish/rating record that bound the reference, "" if none). `verify` recomputes every field from the package and evaluator as they are now; any difference is invalid. Git SHA and tree hash must both match; any change to the reference bytes or to its rating record invalidates the PASS.
- `verify` loads the authorization's `record_path` only from `<package>/evals/fingerprint-gate/runs/`: relative, no `..`, no symlink in any component, resolved path inside the runs dir. The raw gate report the record names must exist under `evals/fingerprint-gate/raw/` (same containment rules) and its sha256 must equal the `raw_report_sha256` stored in the signed record. A PASS whose raw report cannot be persisted is downgraded to ERROR.
- Records and `release/authorization.json` carry `hmac_sha256`: HMAC-SHA256 over their canonical JSON (sorted keys, compact separators), keyed by `~/.config/fingerprint-eval/record.key` (created 0600 in a 0700 dir on first use; a key readable by group/other is refused). `FINGERPRINT_EVAL_KEY_FILE` overrides the path (tests). `verify` and the ledger reconstruction reject unsigned or badly signed files.
- Residual (same user): the key lives next to the user that runs the gate. Any process running as that user can read it and mint a valid record plus authorization. The HMAC stops edits by anything that cannot read the key (other users, a model or tool that writes files into a package, scripts that do not know to sign), not a hostile process with the owner's privileges. Closing that needs the signer outside the user (a separate service account, or an OS keychain with a per-process ACL). `nightly`/`watchdog` integrity scans still read raw JSON and do not yet check signatures.
- Coverage rules: every non-frozen reference prose segment must yield at least one claim, else ERROR (`MALFORMED_MODEL_OUTPUT`); every new factual sentence in the final must map to at least one extracted claim (token overlap >= 0.5 of the smaller set), and an empty post-filter extraction is ERROR. Nothing is skipped silently.
- Every subprocess under `scripts/fingerprint_eval` receives an allowlisted env (`gateway.child_env`); `max_cycles` is validated as a finite int and clamped to `[0, MAX_REPAIR_CYCLES]` at the heal and release boundaries.
- `status --package <dir> [--json]`: the five-state reconstruction plus the human block.
- Human-visible block written to `evals/fingerprint-gate/SUMMARY.md` and printed:
  ```
  Fingerprint / integrity gate: PASS
  Claims: 154/154 preserved
  Links: 24/24 preserved
  Semantic retention: 0.989
  Author distance: 0.235 [report only]
  Pipeline repetition z-score: 2.13 [report only]
  Evaluator: <sha>
  Evaluated content: <hash>
  Evaluated at: <ts>
  ```
  On FAIL/ERROR/NEEDS_REVIEW, show the exact reasons and heal-cycle history.

## Classifier categories and policies

| Category | Kind | Policy |
|---|---|---|
| PASS | n/a | authorize |
| MISSING_LINK | content | deterministic: restore link from reference at the matching sentence; else restore the paragraph from reference |
| STRUCTURAL_DAMAGE | content | deterministic: restore missing section/image/heading/frozen block from reference |
| CONTENT_CLAIM_FAILURE | content | deterministic: restore the affected section(s) from reference |
| ADDED_UNSUPPORTED_CLAIM | content | claim in final not entailed by reference or source notes: restore the section from reference; if the section has no reference counterpart → NEEDS_REVIEW |
| MISSING_SOURCE | content | reference/source notes missing or unreadable → NEEDS_REVIEW (cannot ground a repair) |
| STALE_EVALUATION | infra | rerun gate on same bytes |
| MODEL_TIMEOUT | infra | backoff retry (e.g. 3 tries, 10s/30s/90s), then approved fallback |
| MODEL_UNAVAILABLE | infra | health probe, approved fallback, circuit breaker |
| GATEWAY_FAILURE | infra | backoff retry, health probe `/v1/models`, circuit breaker; embeddings have no approved fallback → quarantine (infra) if open |
| MALFORMED_MODEL_OUTPUT | infra | stricter structured-output retry (already 1 retry in judge), then approved fallback |
| DEPENDENCY_FAILURE | infra | doppler/uv/binary missing, dirty evaluator: allowlisted checks only, then quarantine (infra) |
| UNKNOWN_ERROR | infra | one rerun, then quarantine (infra) |
| NEEDS_REVIEW | terminal | quarantine, notify, continue queue |

Approved fallbacks (explicit table in code, no LLM choice): judge/extractor `claude:sonnet` → `qwen3:8b` (gateway). Embeddings `nomic-embed-text:latest`: none.

Allowlisted infra operations only: sleep/backoff, `GET /v1/models` health probe, `claude -p` one-token ping, `codex --version`, re-read Doppler fallback, switch to an approved fallback. No arbitrary shell, no service restarts of remote hosts. Content repair is deterministic code; an LLM repairer is not part of v1 (a hook for one may exist but defaults off and is never the judge).

## Circuit breaker

State file `data/article-workspace/fingerprint-eval/circuits.json` per dependency (gateway-chat, gateway-embed, claude-cli, codex-cli): consecutive failures, opened_at, next_probe_at. 3 consecutive failures open it. While open: skip calls, use the approved fallback or quarantine (infra), and continue the queue. Half-open probe after a cooldown (e.g. 30 min); close on success. Every transition is logged.

## Heal-cycle audit (in the record and ledger)

Per cycle: input content hash, classification, reasons, repair attempted (function + what was restored, from which file/hash), kind (content|infra), agent/model used, resulting content hash, evaluation result, elapsed time. Content and infra paths are labeled distinctly. Repaired content goes to `article-healed-<n>.md` (never overwriting earlier versions). On PASS, `finalFile` in version.json points to it and release/ carries its bytes.

## Nightly (`python -m scripts.fingerprint_eval.nightly`)

Read-only over packages. Writes `data/article-workspace/reports/fingerprint-nightly/<date>.{json,md}`:
- cross-article repetition, n-gram overlap, rule-of-three frequency, sentence/paragraph distribution drift, author-distance drift, pipeline convergence trend over the last N articles.
- watchdog: counts of generated, evaluated, authorized, published/scheduled, PASS artifacts, quarantined, unresolved ERRORs; model/gateway availability probes; circuit states.
- integrity: every package whose workflow says scheduled/published must have a matching authorization (release bytes hash == recorded PASS hash). Any violation = CRITICAL incident, listed first, Matrix notify.
- retry quarantined packages whose category is infra (calls `authorize`, which may only write gate/release files, never article prose beyond the existing heal policy). Editorial quarantines are not retried.

## Tests (must call the real release/authorize code paths; stub only model/network)

Release/authorization: valid → PASS → authorized; removed link → FAIL then healed → new hash → PASS; changed claim → healed from reference; evaluator unavailable → ERROR → infra retry → recovered PASS on the same hash (assert bytes unchanged); style anomaly only → PASS with warning; article changed after PASS → verify fails → authorize reruns; missing artifact → verify fails; artifact for another hash → verify fails; obsolete evaluator version → verify fails, authorize reruns; dirty evaluator → blocked; malformed model output → strict retry → fallback; unsupported claim with no reference counterpart → NEEDS_REVIEW, exit 3, no release files; bad repair (fault-injected repairer that damages) → gate rejects → bounded → quarantine, never authorized; circuit opens after 3 gateway failures and the queue continues with the next package; nightly flags a scheduled package without a matching PASS as CRITICAL; nightly never writes inside packages except via `authorize` retries of infra quarantines.
