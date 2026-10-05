# Fingerprint gate dry run

Read when: proving the release gate and the Medium guard work together on a real queued article, before enabling anything on mini. Companion to `fingerprint-gate-integration.md` and `hermes-medium-release.md`.

The driver runs the real `release authorize|verify|status` CLI and the real guard (as a subprocess, JSON payload on stdin, exit 2 = block) against sandbox copies of one package. It never opens a browser, never calls `computer_use`, never touches Medium, and never writes into the source package (a before/after tree digest is part of the evidence).

## Run

```bash
# fast, local: e2e fakes instead of models
python -m scripts.fingerprint_eval.dryrun \
  --source-package scripts/fingerprint_eval/tests/e2e/fixtures/package \
  --sandbox /tmp/fg-dryrun-sandbox --out /tmp/fg-dryrun-evidence --offline-models

# real: claude -p (subscription) + the LLM gateway, a real queued article, the installed guard bytes
python -m scripts.fingerprint_eval.dryrun \
  --source-package data/article-workspace/articles/<slug> \
  --sandbox /tmp/fg-dryrun-sandbox --out /tmp/fg-dryrun-evidence \
  --guard ~/.hermes/guards/medium_publish_guard.py
```

Flags: `--sandbox` must be empty or absent and must not overlap the source. `--only NAME ...` runs a subset. `--guard` defaults to `scripts/hermes/medium_publish_guard.py`. Exit 0 only if every case's actual outcome is in its expected set and the source digest is unchanged; exit 1 otherwise; exit 2 for bad arguments or a missing `pbcopy`/`pbpaste`.

Commit the evaluator before running: `release` refuses a dirty `scripts/fingerprint_eval` tree (this package lives inside it, so edits here count).

## What it sets up per case

Each case gets a fresh workspace `<sandbox>/<case>` (`FINGERPRINT_EVAL_WORKSPACE`), with the package copied to `<sandbox>/<case>/articles/<slug>` (without `release/` or `QUARANTINE.json`), a throwaway record key, and its own pinned guard directory under `<sandbox>/_rig/<case>/guards/` (`config.json`, manifest, key, state), laid out like `install_guard.sh` but pointing at that workspace. The guard process runs with a temp `HOME`, so the real `~/.hermes` and `~/.config/fingerprint-eval` are never read or written; guard decisions go to `<out>/guard-decisions.jsonl`. The `--guard` file is copied byte for byte into that pinned directory, so an installed guard is tested as it is.

Clipboard: the installed guard ignores env overrides outside pytest, so its paste check runs the real `pbpaste`. The driver sets the real clipboard with `pbcopy` before each paste and restores the previous plain-text clipboard when it finishes (rich or binary clipboard content cannot be preserved). Do not use the clipboard while it runs.

Models: `--offline-models` runs the CLI in-process under `tests/e2e/fakes.FakeModels` (real text comparison, scripted faults). Default runs the CLI as a subprocess so `claude -p` and the gateway are exactly as in production.

## Guard payloads

Shapes are the ones in `scripts/hermes/guard_selftest.py`, with `hook_event_name`, `session_id` (one per case) and `cwd` added:

| Step | Payload |
|---|---|
| navigate | `browser_navigate {url: https://medium.com/new-story}` |
| paste | `computer_use {action: key, keys: cmd+v, app: GStack Browser}` |
| click / publish click | `computer_use {action: click, element: N, app: GStack Browser}` |

The guard cannot tell a Publish click from any other click (payload carries an element index only), so "publish authorization" is simulated as a click after a verified full paste, which is the only thing the guard gates. The driver stops there.

## Cases

| Case | Mutation | Expected |
|---|---|---|
| normal_path | none | authorize 0; verify 0 and status authorized; nav allow, click before paste block, paste of release bytes allow, click allow, publish click allow |
| missing_link | one inline link flattened | healed to a new hash and PASS, paste allow; or (unrepairable) exit 3, verify 1, guard blocks |
| altered_number | one number or number word changed | healed with the original sentence restored, or exit 3 and blocked |
| deleted_section | a middle `##` section removed | restored from the reference, new hash, PASS |
| modify_after_pass | text appended after PASS | verify 1, guard blocks nav and paste of the old bytes, re-authorize gives a new hash and PASS, guard allows |
| missing_artifact | `release/medium-final.md`, then `authorization.json`, deleted | verify 1, guard blocks |
| artifact_other_hash | package B holds A's release and authorization; ACTIVE (signed through `release.write_active`) names B; A's release bytes tampered | verify 1, guard blocks |
| obsolete_evaluator | `binding.evaluator_id` edited in the package's authorization (original kept as `authorization.orig.json`) | verify 1 (signature invalid), guard blocks, re-authorize re-binds the real id |
| gateway_unavailable | `LLM_GATEWAY_URL=http://gateway.unroutable.invalid/v1` (offline: scripted refusals on gateway chat and embed) | exit 4, infra quarantine, no release files, guard blocks, article bytes unchanged, no `article-healed-*` |
| style_only | rhythm fragments appended to several paragraphs | PASS with advisory, no heal cycle |
| unsupported_claim | new section with unsupported facts | exit 3, `QUARANTINE.json` NEEDS_REVIEW, guard blocks |
| bad_repair | link removed, `FINGERPRINT_EVAL_REPAIRER=scripts.fingerprint_eval.repair:FaultyRepairer` with `FINGERPRINT_EVAL_TEST_MODE=1` | exit 3, never authorized, 1 to 3 heal cycles, guard blocks |
| queue_continuation | 3 packages in one workspace; the middle one loses its reference and a link | authorize exit codes 0,3,0; verify 0,1,0; with ACTIVE on package 3 its bytes paste and package 2's bytes block |

Mutations are generic (first link, first number, middle section), not tied to the fixture text. When the final candidate is the rated reference itself, the mutation is written to a new `article-medium.md` so the reference stays intact and repair stays possible.

## Evidence

- `<out>/dryrun-evidence.json`: run header (mode, evaluator id, dirty flag, author corpus sha256, guard file and sha256, source digest before and after) and one object per case: `expected` (list of acceptable outcomes), `actual`, `passed`, `exit_codes`, `hashes` (input, authorized, and so on), `notes`, `guard_decisions` (step, tool, exit, allow or block, reason), and per package `ledger_states`, `heal_cycles`, `quarantine`, `evaluator_id`, `author_corpus_sha256`, `final_sha256`, `release_article_sha256`, `authorized_sha256` and artifact paths.
- `<out>/SUMMARY.md`: the table.
- `<out>/guard-decisions.jsonl`: the guard's own decision log.

## Limits and what a real evaluator bump does

- Evaluator version: a real bump (any change under `scripts/fingerprint_eval` that is committed) changes `evaluator_id`. The authorization binding then differs from the current one, `verify` returns 1 with `authorization binding differs from current: evaluator_id`, the guard blocks, and `release authorize` re-runs the gate on the same bytes. The dry run cannot bump the evaluator without committing, so it forges the id in the authorization copy instead: that is caught earlier, by the HMAC signature, and exercises the same block and re-run path.
- Real-model mode for `gateway_unavailable` only fails the gate if the gate path actually needs the gateway (embeddings, fallback judge). If a build routes everything through `claude -p`, the unroutable URL will not cause an infra quarantine and the case will report that honestly.
- The guard still cannot see page contents, deletions after a verified paste, or non-`pbcopy` clipboard flavors (see the residuals in `hermes-medium-release.md`). Nothing here exercises a real Medium page.
