# Hermes Medium release guard

Status: ready for the lead to apply on `mini`. Nothing here has been applied live. Companion to `docs/fingerprint-gate-integration.md`.

Invariant: the automated path must not mutate Medium unless `release verify` passes for the exact current bytes. Unattended publishing stays disabled (the cron already stops at `approval_channel_blocked`); this guard is the mechanical second lock, not a reason to turn that off.

## What actually mutates Medium (evidence)

The Medium job (`youtube-playlist-to-medium-article`, id `cf72679130c9`, workdir `social-poster`, `enabled_toolsets: null`, so every tool is available) is told to use the visible GStack / Chrome-for-Testing window. The only Hermes tool that can do that is `computer_use` (cua-driver):

- Evidence: `data/article-workspace/articles/_blocked-weekly-youtube-medium-2026-07-05-1022z/BLOCKER.md` on mini: "computer_use list_apps returned an empty app list. Captures for Google Chrome for Testing, GStack Browser, and Google Chrome returned 0x0 ...". Schema: `~/.hermes/hermes-agent/tools/computer_use/schema.py`.
- `computer_use` args: `action` in `capture|click|double_click|right_click|middle_click|drag|scroll|type|key|set_value|wait|list_apps|list_windows|focus_app`, plus `app`, `element` (SOM index), `coordinate`, `text`, `keys`, `value`, `delivery_mode`. Mutating shapes: `{"action":"type","text":"..."}` (title/subtitle/body), `{"action":"key","keys":"cmd+v"}` (paste), `{"action":"click","element":N}` (Publish / Schedule for later / Save / Update), `{"action":"set_value",...}` (pickers). Navigation to `/new-story`, `/p/<id>/edit`, `/p/<id>/submission?...submitType=publishing-post` is also typed/keyed into the omnibox.
- Limitation that shapes the design: a click payload carries only an element index, never the page or button label. The guard cannot tell "click Publish" from "click a link", so every input action aimed at a browser (or at the unspecified frontmost app) counts as a mutation. Read actions (`capture`, `list_*`, `wait`, `scroll`, `focus_app`) pass.
- The built-in `browser_*` tools (`browser_navigate{url}`, `browser_click{ref}`, `browser_type{ref,text}`, `browser_press{key}`, `browser_console{expression}`, `browser_cdp`, `browser_exec`) and `terminal` / `execute_code` (`$B goto|click|fill`, `curl`, `osascript`) are forbidden for Medium by the prompt but available, so they are covered too. Last navigated URL per `session_id` is remembered in signed guard state (`~/.hermes/guards/state/url-memory.json`, see Hardening) so `browser_click` on a Medium page is recognised.
- Recent runs (2026-09-24 to 2026-10-04) all stopped before Medium mutation (`cron/output/cf72679130c9/*.md`), so there is no recent transcript of a successful mutation. Run transcripts live in `state.db`, which must not be opened ad hoc (see memory note on WAL), so tool-call shapes come from the Hermes source and the July blocker file, not a replayed session.

## Hook payload and blocking semantics (evidence)

`~/.hermes/hermes-agent/agent/shell_hooks.py` on mini:

- stdin JSON: `{hook_event_name, tool_name, tool_input, session_id, cwd, profile, extra}`. `tool_input` is the tool's args dict (`_payload_fields`).
- Block: exit code 2 (`BLOCK_EXIT_CODE`), stderr is the message; or stdout JSON `{"action":"block","message":...}` / `{"decision":"block","reason":...}`. The guard emits both.
- `fail_closed: true` (config) blocks on timeout, spawn error, other non-zero exit, and unparseable stdout, for `pre_tool_call` only.
- `model_tools.py::_pre_dispatch_guards` turns a block message into a tool error before dispatch, so the tool never runs.

Gaps found in the Hermes side (these are why a hook alone is not claimed as complete):

1. mini currently has NO hooks (`hermes hooks list`: "No shell hooks ... configured"); the `secret_guard` entry exists only on the main Mac.
2. A hook is registered at process start, and only if allowlisted. `hooks_auto_accept: false` plus a non-TTY (cron, gateway) means a new, unapproved hook is silently skipped (`shell_hooks.register_from_config`, warning only). Approve it once interactively, and restart the gateway so the long-running process loads it.
3. `HERMES_SAFE_MODE=1` skips all shell hooks.
4. `model_tools._pre_dispatch_guards` swallows exceptions raised by the dispatcher itself (`except Exception: logger.debug(...)`) and proceeds. `fail_closed` covers the hook subprocess, not a bug in the dispatcher.
5. Whether delegated child agents fire `pre_tool_call` in the parent's hook registry was not verified.

## Alternatives considered (Max's ordered list)

| # | Option | Synchronous choke point? | Bypass paths left | Evidence |
|---|---|---|---|---|
| 1 | Guarded release artifact (`release/medium-final.md` exists only after exact-hash PASS) | No, on its own. It is a precondition, not a gate | Agent can read and paste `article-v*.md` / `article-healed-*.md` from the same package; same Unix user, nothing forces use of the release file | Package layout in `fingerprint-gate-integration.md`; Hermes runs as `maxsmacmini` with full file access |
| 2 | Wrapper around the Medium publish action/tool | No such action exists to wrap. Publishing is UI clicks through `computer_use` | n/a | Tool inventory above; Medium has no maintained write API in this stack |
| 3 | Dedicated Hermes publish skill/tool requiring authorization | A skill is prompt text, not synchronous. A real tool (plugin that authorizes then drives the UI) would be, but only if raw `computer_use` input to Medium is also blocked, which is the hook again | Skill form: model can ignore it. `medium-visible-ui-mutation` is `disable-model-invocation`, exists only in `codex-memory-mirror`, and is not in the job's skill list | Skill front matter; `hermes cron list` skills for `cf72679130c9`; earlier runs log "skill not found ... loaded manually from disk" |
| 4 | Capability minted only from a valid PASS | Yes for "no mutation without a currently valid authorization": `release/ACTIVE.json` names the package, `release verify` runs synchronously inside the `pre_tool_call` hook on every mutating call | Content paste is only partly checked (below); hook availability caveats 1-5 above | `scripts/hermes/medium_publish_guard.py`, 59 tests; Hermes source above |
| 5 | Stage final bytes where Hermes cannot read them until authorized | No. Requires an OS boundary (second user, sandbox). A hook-based read block is the same hook dependency and is bypassable via `terminal` tricks | Same-user file access | `secret_guard.py` approach is heuristic; no separate user for Hermes on mini |

Chosen and implemented: option 4 enforced through the `pre_tool_call` hook, plus option 1 as a precondition (the prompt tells Hermes to paste only `release/medium-final.md`), plus byte checks the hook can do:

- `computer_use type`: any typed string longer than 40 chars must be a whitespace-normalised substring of the active package's `release/medium-final.md`.
- `pbcopy` / clipboard writes (terminal): must reference `release/medium-final`. This is the paste-source check.

Honest answer to "is there a fully reliable synchronous point": there is no reliable synchronous guarantee about the exact bytes that reach Medium. The hook reliably (by source reading, not by live test) blocks Medium-bound input when there is no valid release. It cannot see clipboard contents on `cmd+v`, cannot read the page, and cannot tell a Publish click from any other click. Therefore: keep unattended publish and schedule disabled; require the human approval step (already in the prompt) for the scheduling click. The nightly integrity check is a detector, not the guarantee.

Unclosed bypasses:

1. Clipboard contents at `cmd+v` (hook sees the keypress, not the clipboard). Mitigated only by the `pbcopy` source rule and the prompt.
2. Release valid, then the agent types/pastes other bytes through paths the hook does not classify (for example a JS `execCommand` through a tool name outside `computer_use|browser_*|terminal|execute_code`; the matcher in the snippet lists those four families only).
3. Hook not registered (not allowlisted, safe mode, gateway not restarted) or dispatcher exception (gaps 2-4 above). Verify after applying with `hermes hooks list` and by running `hermes hooks test` against a denial fixture.
4. `computer_use` with `app` naming a non-browser app is allowed (for example a Finder click). Typing into Chrome through a different app name than `BROWSER_APP_RE` matches is not caught; an omitted `app` is caught.
5. Another process on mini (Codex, Claude, a human shell) touching the same browser is outside Hermes entirely.
6. Mutation-like detection in `terminal` is regex based; an obfuscated command (base64, split strings) that never mentions `medium.com` and never calls `osascript/cliclick/cua-driver/pbcopy` evades it.

## Apply on mini (lead, after review)

1. Merge this PR chain and `git pull` on mini, then install the pinned guard copy (Hardening below): `scripts/hermes/install_guard.sh`. It prints the sha256; record it in the change ticket.
2. Add under `hooks:` in `~/.hermes/config.yaml` (the file has no `hooks:` block on mini today; the second entry mirrors the main Mac's secret_guard only if wanted). The command points at the INSTALLED copy, not the repo file:

```yaml
hooks:
  pre_tool_call:
    - command: python3 /Users/maxsmacmini/.hermes/guards/medium_publish_guard.py
      matcher: ^(computer_use|browser_.*|terminal|execute_code)$
      timeout: 90
      fail_closed: true
```

`timeout: 90` must exceed the guard's own 75 s verify timeout. Matcher is a full-match regex (`fullmatch`). The installed file is 0444 (no exec bit), hence the explicit `python3` interpreter. Not yet verified live: that `shell_hooks` splits a multi-word `command` into argv; if it does not, wrap it in an executable launcher outside the repo and put that path in the manifest flow instead.
3. Approve and load: run one throwaway `hermes --accept-hooks chat -Q -q 'Reply OK. Call no tools.' < /dev/null` (registration and approval happen at chat startup; `hermes hooks list` does NOT approve, verified live; the entry lands in `<HERMES_HOME>/shell-hooks-allowlist.json`), then restart the Hermes gateway (kills running agents; do it between cron slots). Check `hermes hooks list` shows the entry as allowed.
4. Run `scripts/hermes/guard_selftest.sh` (exit 0 required). Then smoke without touching Medium: `hermes hooks test pre_tool_call` is for the default synthetic payload; instead pipe fixtures by hand: `echo '{"tool_name":"computer_use","tool_input":{"action":"click","element":1}}' | python3 ~/.hermes/guards/medium_publish_guard.py; echo $?` should print the block JSON and exit 2 with no `ACTIVE.json`.
5. `ACTIVE.json` contract: `data/article-workspace/release/ACTIVE.json` = `{"package": "<slug or absolute dir>"}`, written by the release tooling (or the prompt step below) only after `release authorize` exit 0. Remove or overwrite it when the article is done so the next mutation is blocked until a new authorization.

## Cron prompt patch (job `cf72679130c9`, applied via `hermes cron edit`)

Insert this block immediately before the existing line "Medium mutation has two musts" in the prompt (also in `docs/hermes/youtube-medium-cron.prompt.txt`):

```text
Fingerprint release gate (mandatory, mechanical):
- Before ANY Medium draft, update, paste, schedule, or publish step for an article package, run on the final candidate: `cd /Users/maxsmacmini/Desktop/Projects/social-poster && ~/.local/bin/uv run --python 3.12 python -m scripts.fingerprint_eval.release authorize --package <package-dir>`.
- Exit 0: write `{"package": "<package-dir>"}` to `data/article-workspace/release/ACTIVE.json`, then paste ONLY the bytes of `<package-dir>/release/medium-final.md` (copy with `pbcopy < <package-dir>/release/medium-final.md`). Never paste article-v*.md, article-healed-*.md, or any rewritten text.
- Exit 3 (quarantined, needs review) or 4 (infra quarantine): do NOT touch Medium for this article. Record the exit code and the reason from `evals/fingerprint-gate/SUMMARY.md` in workflow.json, notify, and continue with the next article in the queue.
- Any other exit: treat as 4.
- After finishing (or abandoning) the Medium step, delete `data/article-workspace/release/ACTIVE.json`.
- A Hermes pre_tool_call hook runs `release verify` before every Medium-bound click, key, type, and navigation and will block the call if the release is missing, stale, or for different bytes. A block is a final answer for that article. Do not retry through another tool, the browse CLI, CDP, osascript, or the API.
- Releasing never replaces the human approval gate. Scheduling still requires Max's approval as above.
```

## Nightly watchdog cron

`hermes cron create --script` only accepts scripts under `~/.hermes/scripts/`, so install this wrapper first as `~/.hermes/scripts/fingerprint_nightly.sh` (executable). Matrix targets resolve empty on mini today (see 2026-09-26 and 2026-10-04 run reports), so the wrapper tries Matrix and always prints the summary for local delivery:

```bash
#!/usr/bin/env bash
set -uo pipefail
REPO=/Users/maxsmacmini/Desktop/Projects/social-poster
cd "$REPO" || { echo "fingerprint nightly: repo missing"; exit 1; }
out=$("$HOME/.local/bin/uv" run --python 3.12 python -m scripts.fingerprint_eval.nightly 2>&1)
rc=$?
summary=$(printf '%s\n' "$out" | tail -40)
if [ "$rc" -ne 0 ] || printf '%s' "$out" | grep -q CRITICAL; then
  hermes send --to matrix:hermes "Fingerprint nightly (rc=$rc): $summary" >/dev/null 2>&1 || true
fi
printf 'fingerprint nightly rc=%s\n%s\n' "$rc" "$summary"
exit 0
```

Create the job (03:40 daily; `--no-agent` so no LLM tokens, stdout delivered locally):

```bash
hermes cron create "40 3 * * *" --name fingerprint-nightly --no-agent \
  --script fingerprint_nightly.sh --deliver local --workdir /Users/maxsmacmini/Desktop/Projects/social-poster
```

The nightly is read-only over article prose; the only writes are reports under `data/article-workspace/reports/fingerprint-nightly/` and `authorize` retries of infra quarantines.

## Tests

`~/.local/bin/uv run --python 3.12 --with pytest python -m pytest -q scripts/hermes` (verify stubbed except `test_guard_real_release.py`; `test_guard_hardening.py` covers the Hardening section, `test_guard_round3.py` the round-3 rules below). Covered: every mutation shape denied with no active release, with failing verify, and allowed with a valid release; read-only Medium navigation allowed; stale release (verify exit 1), verify timeout, missing `ACTIVE.json`, corrupt `ACTIVE.json`, missing package dir denied; typed-text and clipboard-source checks; exit-code/stdout contract; unparseable payload and guard crash fail closed for mutation-like calls.


## W4b: clipboard-checked paste, receipts, click gating (implemented)

Policy once `release verify` passes (all in `medium_publish_guard.content_policy`):

- Paste keys (`cmd+v`, `ctrl+v`, `shift+insert`, with or without shift, `super/meta+v`; `computer_use key`, `browser_press`, `$B press|key|paste`): the guard runs `pbpaste` (and best-effort `osascript` for the HTML flavor) and allows a FULL paste only if the clipboard bytes equal the verified release bytes EXACTLY (no rstrip, no newline normalisation; `pbpaste` was shown not to append one: `printf abc | pbcopy; pbpaste | xxd` prints `616263`). A whitespace-normalised substring of at least 40 chars (title/subtitle) is a fragment paste, legal only after a full-paste receipt. An HTML flavor whose text differs from the plain flavor blocks. A pbpaste failure blocks. Allowed pastes append an HMAC-signed receipt to `~/.hermes/guards/state/receipts.jsonl`: `{ts, session_id, clipboard_sha256, release_sha256, kind: full|fragment}`.
- Before a verified full-paste receipt exists for the active release hash in this `session_id` (round-3 rules) ONLY these are allowed: (a) navigation to an exact Medium editor URL, `https://medium.com/new-story` or a draft edit URL recorded in the package's `workflow.json` (a `https://medium.com/p/<hex>/edit` string under a key containing `draft` or `edit`), plus one Enter that submits that exact URL typed with `computer_use type`; `cmd+a`; loading the clipboard from `release/medium-final.*` (`pbcopy <`); (b) the bootstrap FULL paste. Blocked: every click (including "to focus the editor": focus is keyboard-only, so use `cmd+a` then `cmd+v`), drag, `set_value`, all typing except the exact editor URL, every other key, fragment pastes, any other Medium write page (submission, other drafts, query strings, `http://`), every other `browser_*` tool, and right-click always (a context-menu Paste cannot be inspected). `cmd+l` is not allowed pre-receipt; navigate with `browser_navigate` or `$B goto`.
- After a full receipt: clicks are allowed. A fragment paste never unlocks clicks.
- Residual (stale draft): bytes already sitting in a Medium draft, or a verified paste later modified by typing. Typing is substring-checked, but deletions and cursor moves are invisible, and a click gate cannot see page contents, so a draft damaged by deletion-only edits can still be published after a legitimate paste. The receipt chain proves which bytes entered, not what the editor finally holds; the post-mutation proof reviewer must still compare the saved draft to the release.
- Decision log: `<HERMES_HOME>/logs/medium-guard-decisions.jsonl` (ts, session_id, tool, allow, reason). `MEDIUM_GUARD_LOG` overrides.

Residuals from reading the code, not closed:

1. TOCTOU, reduced not closed: the release bytes are now verified and read once under a lock, but the clipboard is still checked at hook time; another process could replace it between the check and the keypress landing. The flock only excludes cooperating writers (`release authorize`, other guard calls), not an arbitrary process that ignores it; the post-verify hash comparison catches a file swap but not a swap-and-restore.
2. (Reduced by Hardening, not closed.) Receipts are now HMAC-signed in `~/.hermes/guards/state/`, so a hand-written or edited receipt line is rejected. `ACTIVE.json` is still a plain file, but it only names a package that must still pass `release verify`. The key is readable by the Hermes OS user, so a same-user process that reads it can forge receipts.
3. (Reduced by Hardening, not closed.) The hook runs a pinned copy at `~/.hermes/guards/` that checks its own hash. The same OS user can still `chmod` the directory back and replace the guard, manifest and key together, or edit `config.yaml` to unhook it.
4. Child agents fire the hook (verified below) but with their own `session_id`, so a parent's paste receipt does not cover a delegated child's clicks. This is the safe direction; see the no-delegation rule below.
5. `HERMES_SAFE_MODE=1` skips hooks. Nothing on mini sets it (no LaunchAgent, `.env` or config mention; cron job records carry no env). A tool call cannot change the gateway process env, so the cron cannot enable it by itself; an operator `--safe-mode` start or env edit would.
6. The dispatcher swallows exceptions from `_dispatch_pre_tool_call_hooks` (fails open) as before; `fail_closed` covers only the hook process.
7. `pbpaste` needs the logged-in GUI session pasteboard; if the gateway runs where it cannot read it, every paste blocks (fails closed, visible in the log).
8. Round-3 residuals. (a) `workflow.json` is an unsigned, agent-writable file: it can add another `https://medium.com/p/<hex>/edit` URL to the pre-receipt navigation allowlist (still only an editor URL, and nothing but the full verified paste can follow). (b) The pre-receipt `pbcopy < release/medium-final.md` check is a substring test on the command; the paste is what is byte-checked. (c) After the receipt, `browser_console`/`browser_exec`/`browser_cdp` and clicks are allowed as before, so JS can still edit the page; the post-mutation proof reviewer must compare the saved draft. (d) A clipboard produced by another route than `pbcopy <` (for example the dashboard rich-copy button) must be byte-identical to the file, trailing newline included, or the paste blocks; this is intentional. (e) The name-token heuristic for unrecognized browser-touching tools can miss a tool with an opaque name; such a tool only passes if it also carries no Medium URL. (f) The guard still cannot see page contents: a stale draft, or a verified paste later changed by deletions, is invisible (see the stale-draft residual above). (g) The same-user caveats of Tamper resistance still apply: a same-user process can rewrite `config.json`, the manifest and the key together, or edit the pinned `uv`'s directory permissions.

## Live proof on mini (2026-10-04, no Medium interaction, no computer_use)

Setup: guard checked out with `git worktree add ~/Desktop/Projects/social-poster-fg-guard` (detached at the branch tip; main checkout untouched). Throwaway profile `fgguardtest` (`hermes profile create --clone`) whose config added only this guard as `pre_tool_call` (`fail_closed: true`). Approved once with `hermes --accept-hooks -p fgguardtest chat -Q -q ...`. All test calls ran non-TTY (`hermes -p fgguardtest chat -Q -q '...' < /dev/null`) without `--accept-hooks`, so the allowlist is what loaded the hook. Profile deleted afterwards. Side effect: the first `hermes -p` invocation ran Hermes' own dependency refresh (pip/node), unrelated to the guard.

Results (decision log copied to `docs/hermes-medium-release-live-decisions.jsonl`):

| Call (terminal tool) | State | Result |
|---|---|---|
| `echo "simulate: open https://medium.com/new-story and paste"` | no ACTIVE.json | blocked "no active release"; agent output shows the block and no echo output |
| same | valid ACTIVE (package authorized by the real `release.authorize` with stubbed models; the guard's real `uv run ... release verify` exited 0) | blocked "no verified paste receipt for the active release in this session" |
| `echo "simulate: $B goto https://medium.com/new-story"` | valid ACTIVE | allowed (navigation); echo ran |
| the blocked echo, issued by a `delegate_task` child | valid ACTIVE | blocked; the log row carries the child's own session id (`..._7f8f68`, parent `..._da1233`), so child agents DO fire the hook |

Not exercised live: the paste/receipt path (needs `computer_use`). It is covered by unit tests plus `test_guard_real_release.py` (real `release authorize` and real `uv run` verify, stubbed clipboard).


## Hardening: fail closed, pinned copy, signed state (F3)

### Fail closed everywhere

The guard never returns allow from an exception handler. One helper, `fail_closed()`, is the body of every handler (`decide` classify error, `main` decide error, unparseable or unknown payload, stdin read error, last-resort `__main__` catch). It asks `could_mutate()`, a deliberately crude check independent of the normal classifier, and blocks unless the call is clearly read-only:

- Blocks on error: any `computer_use` action outside the read set (`capture`, `list_apps`, `list_windows`, `wait`, `scroll`, `focus_app`), unknown actions, non-dict `tool_input`, every `browser_*` tool except `browser_snapshot|vision|get_images|screenshot|scroll`, `browser_navigate` to Medium or to an empty/unparseable URL, `terminal|execute_code|process|bash|shell` that mentions `medium` or a browser binary or driver (`$B`, `browse`, chrome, gstack, osascript, cliclick, cua-driver, peekaboo, playwright, puppeteer, CDP, pbcopy), unknown tools whose payload mentions medium, and any payload with a missing or non-string `tool_name`.
- State errors: unreadable, unsigned or tampered url memory raises and blocks any browser input call that needed it. A failed state write blocks Medium (or unparseable) navigations; a clearly non-Medium navigation still passes because a stale memory can only over-block later. A failed receipt write blocks the paste. A verifier, `ACTIVE.json`, clipboard or content-policy error blocks.
- Logging errors never change a decision. Block output errors still exit 2.
- Hermes `fail_closed: true` stays on as the outer net (crash, timeout, spawn error). It does not cover the dispatcher swallowing its own exceptions (gap 4 above).

### Round-3 hardening (Codex findings)

1. Browser tools fail closed. Every `browser_*` tool (and any `mcp__*__browser_*`) is a MUTATION unless it is on the explicit read-only allowlist: `browser_snapshot|vision|get_images|screenshot|capture|get_text|list|list_tabs|wait|scroll`. `browser_navigate` keeps its URL-based rule. An unrecognized tool whose name carries a browser or desktop token (`browser`, `chrome`, `playwright`, `puppeteer`, `cdp`, `selenium`, `computer`, `mouse`, `keyboard`, `click`, `desktop`, `osascript`, `cliclick`, `peekaboo`, ...) is a mutation too. A mutation with no active, verified release is blocked, on any page.
2. Preflight before the full paste: see the W4b section (editor navigation, Enter on that URL, `cmd+a`, full paste; no clicks, typing or other keys). Full paste equality is exact bytes.
3. TOCTOU. `decide` takes an `flock` on `<package>/release/.guard.lock`, then runs `release verify --package P --json` (depends on the G1 PR, which adds `--json`; exit 0 and `{"valid": true, "content_sha256", "release_article_sha256"}` required, the two hashes must agree), then reads `release/medium-final.md` ONCE into memory, requires its sha256 to equal the verified `content_sha256`, and compares the clipboard and typed text against those in-memory bytes. The lock is held until the decision is made; the file is never re-read. A release changed after verify blocks.
4. Verifier pinning. The verifier is the `uv` path and the `repo` path in `~/.hermes/guards/config.json` (manifest-checked), written by `install_guard.sh` with `uv_sha256`. At every verify the guard requires an absolute path, owned by the current user, not group/world writable, whose sha256 equals the pinned one; same ownership rule for `repo`. `MEDIUM_GUARD_UV`, `MEDIUM_GUARD_REPO`, `MEDIUM_GUARD_DIR`, `MEDIUM_GUARD_STATE_DIR`, `MEDIUM_GUARD_WORKSPACE` and `FINGERPRINT_EVAL_WORKSPACE` are ignored unless `MEDIUM_GUARD_TEST_MODE=1` AND the process is under pytest. A `uv` upgrade changes the sha, the guard then blocks mutations (visible reason): rerun `install_guard.sh`.
5. Secrets. `uv`, `pbpaste` and `osascript` run with an allowlisted env only: `PATH, HOME, USER, LANG, TMPDIR, UV_CACHE_DIR, UV_PYTHON_INSTALL_DIR` (plus the non-secret `FINGERPRINT_EVAL_WORKSPACE` for verify). No API keys or tokens reach them.

### Tamper resistance (best effort, same OS user)

`scripts/hermes/install_guard.sh` (idempotent; `--rotate-key` to rotate, which drops old receipts) creates `~/.hermes/guards/` (override `HERMES_GUARD_DIR`):

| Path | Mode | Purpose |
|---|---|---|
| `medium_publish_guard.py` | 0444 | pinned copy; the hook config points here |
| `config.json` | 0444 | repo, workspace, pinned `uv` path and `uv_sha256` (the copy no longer lives in the repo) |
| `manifest.sha256` | 0444 | sha256 of the two files above, printed at install |
| `key` | 0400 | 32-byte random HMAC key, generated at install |
| `state/` | 0700 | `url-memory.json`, `receipts.jsonl`; NOT in the repo or article package |
| the dir itself | 0555 | no new files without a deliberate chmod |

What the guard does with them:

- Self-check on every mutating call: sha256 of its own file and of `config.json` against the manifest, and `key` must not be group/world accessible. Any mismatch, missing manifest or missing key blocks mutations (reads still pass). A patched copy blocks itself.
- Receipts and url memory are HMAC-SHA256 signed. A receipt is only honoured if its signature verifies and its session, package path, release hash and `kind: full` match. Unsigned, edited or other-package receipts are ignored, so clicks stay blocked. Old `release/paste-receipts.jsonl` files in a package are ignored.
- Recovery after a tampered or corrupt state file: investigate, then delete the file under `~/.hermes/guards/state/` or rerun the installer.

What this does NOT do, plainly: the guard, key, manifest and state all belong to the same OS user as Hermes. A determined same-user process can read `key`, forge signed receipts, `chmod` the directory and replace the guard together with its manifest, or edit `~/.hermes/config.yaml` to remove the hook. This only defeats casual and file-edit tampering done through the agent's normal file tools (write_file, patch, shell redirection into the old paths, hand-written receipt lines). A real boundary needs a different OS user or sandbox for Hermes.

### No delegation

Do not run the Medium step inside `delegate_task` children. Child agents fire the hook but with their own `session_id`; receipts are per session, so a parent's verified paste does not carry over. A child mutation is blocked until the child makes its own verified paste (covered by `test_delegated_child_session_needs_its_own_verified_paste`, and seen live in the 2026-10-04 proof). Keep the whole Medium step (authorize, paste, click) in one top-level session.

### Operator check

`scripts/hermes/guard_selftest.sh` (`HERMES_GUARD_DIR` override) runs the installed guard as a subprocess, exactly as Hermes would, with a stubbed verifier and a temp workspace and state dir: no ACTIVE blocks a click, read-only capture passes, ACTIVE plus a signed verified-paste receipt allows a click, an edited or unsigned receipt blocks, an unwritable state dir blocks. It exits non-zero on any wrong decision, prints one line per case, and never touches Medium or the live state. Run it after install, after any Hermes upgrade and from the nightly (not wired yet).
