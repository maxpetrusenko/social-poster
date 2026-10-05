# Write pipeline

read_when: changing the `/generate-article` skill, `scripts/write_pipeline`, or how an article package reaches the review stop.

One `/generate-article` invocation runs 18 stages and stops for Max's review. The agent (Sonnet through `claude -p`) writes prose and judgement artifacts. `scripts/write_pipeline` is the deterministic half: stage state, hash-bound artifacts, cache, validators, our own fingerprint metrics, and calls to the existing evaluator modules. It has no publish command and never mutates Medium.

## Canonical skill and sync

- Canonical `write Medium article` skill on the main Mac: `~/.codex/prompts/generate-article.md` (the `/generate-article` command). FRAMEWORK.md V6 (`medium-automation/FRAMEWORK.md`) stays the editorial authority and is not edited here.
- Hermes (mini) loads `~/.hermes/skills/medium-article-generator/SKILL.md`, which defers to `/generate-article` and V6. The `creative/medium-article-generator` copy is byte-identical and shadowed (the list shows one entry with an empty category, the top-level copy). `content-publishing/*` duplicates (`unslop`, `anti-slop-prose-check`, `favorite-writers-voice`, `article-hero-image-pipeline`, `medium-article-pipeline-ops`) are byte-identical too.
- The cron `youtube-playlist-to-medium-article` (host `mini`, `17 */6 * * *`) loads by name: `gstack`, `medium-article-generator`, the five `source-of-truth-*`, `medium-article-pipeline-ops`, `medium-article-from-source`, `anti-slop-prose-check`, `unslop`, `favorite-writers-voice`. It follows its own prompt and does not call this CLI.
- No sync mechanism exists. `~/Desktop/Projects/skills/AGENTS.md` and `agent-scripts/scripts` are absent on the main Mac; `maxp-skills` on the mini holds no Medium skill; `hermes skills` manages hub installs only (these are `local`); the codex memory mirror syncs memory, not skills. The mini's `~/.codex/prompts/generate-article.md` is a hand-adapted copy (three paths rewritten) and had already drifted by path only. Apply updates by hand with the patches in `docs/skill-patches/`.

## Commands

`python -m scripts.write_pipeline <cmd> --package P` with `init`, `status [--json]`, `next`, `begin <stage>`, `submit <stage> --file F [--report R]`, `run review|critic|integrity|hash|package|stop`, `antifp baseline|rank|try|finish`, `repair try|done`, `finalize`, `revalidate`, `rebase --reason`, `block <stage> --reason`.

Exit: 0 ok, 1 artifact rejected, 2 usage or waiting on an upstream stage, 3 NOT_READY, 4 BLOCKED (model or evaluator unavailable, retry later), 5 QUARANTINED, 6 FINAL.md edited after PASS.

## Stages

source, research, angle, outline, draft, validate, editorial, voice, antifp, review, title, images, critic, repair, integrity, hash, package, stop.

- Each stage's artifact is stored under `write-pipeline/artifacts/` with a bundle hash. A stage is DONE only while its recorded input hashes (its dependencies, the pipeline version and the framework hash) still match; otherwise it is STALE. Resubmitting identical bytes is a cache hit and invalidates nothing downstream.
- `antifp` measures `scripts.fingerprint_eval.metrics` (template hits, em dashes, repeated n-grams, one-sentence paragraphs, transitions). A try is kept only if the targeted signal and the composite both improve, the edit is local (3 blocks at most), the deterministic guard holds (no link or number lost or invented, headings, code, images and frozen blocks unchanged, no invented experience) and the claims gate (`fingerprint_eval --gate`) passes. No third-party AI detector is called or targeted. A draft still heavy after the loop ends NOT_READY.
- `title` and `images` build the final frame. The candidate and the reference frame share the same title, subtitle and images, so the gate compares only body edits. The reference is the text after the voice pass, before any anti-fingerprint edit, bound through `evals/prepublish-v<N>.json`.
- `critic` is a separate `claude -p` process that sees only the framework, the evidence ledger and the article. A finding counts as major only if its quoted passage is in the article. Three rounds at most, then NOT_READY. `repair` edits must pass the guard and the claims gate against the reference; a fix that needs a claim change is rejected three times, then NOT_READY.
- `integrity` writes FINAL.md and runs `release authorize --max-repairs 0` then `release verify`, always, on the exact bytes. It never reuses an earlier PASS. Content failure found by the deterministic precheck is NOT_READY; an evaluator quarantine is QUARANTINED (sticky for the same bytes); an infrastructure failure is BLOCKED. `FINGERPRINT_EVAL_WORKSPACE` points inside the package so the production ACTIVE selector is not replaced. Publishing still needs the normal `release authorize` and `release verify` in the production workspace.
- `package` writes FINAL.html, a Medium review bound to the final bytes, a `publish_route decide` recommendation, and PACKAGE.md (final article, title, subtitle, images, sources, editorial scorecard, integrity, anti-fingerprint report, Medium route, author opportunities). `stop` sets READY_FOR_REVIEW.
- A change to FINAL.md after PASS is detected on the next command (state USER_MODIFIED, exit 6). `revalidate` adopts the edit as the candidate, reruns the critic and the final gate, and repackages. A claim-changing edit fails closed; `rebase --reason` accepts it as the new reference and records an override.

## Tests

```
~/.local/bin/uv run --python 3.12 --with pytest --with markdown-it-py==4.2.0 python -m pytest -q --runxfail scripts/fingerprint_eval/tests scripts/hermes scripts/medium_review/tests scripts/publish_route scripts/publish_broker scripts/write_pipeline
```

The evaluator tree must be committed: one test runs the real `release authorize` and `release verify` on the identity path and is skipped when the tree is dirty.
