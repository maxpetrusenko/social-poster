# Publish boundary: a synchronous enforcement point Hermes cannot reach

Status: design plus a dry-run prototype in `scripts/publish_broker/`. Nothing was created, changed or run with privileges on `mini`. Read-only evidence below was collected 2026-10-04 over `ssh mini`.

Companion to `docs/hermes-medium-release.md` (the `pre_tool_call` guard) and `docs/fingerprint-gate-integration.md` (the gate and its HMAC records).

## Invariant

No automated Medium publish without an authorization for the exact final bytes plus the evaluator, reference and corpus versions. The publishing agent must not be able to mint or modify its own PASS.

## Threat model

Attacker: Hermes (or anything it runs) as macOS user `maxsmacmini`, uid 501, with `terminal` and `execute_code`. It can:

1. read every file `maxsmacmini` owns: the HMAC key (`~/.config/fingerprint-eval/record.key`), the guard's keys and state, the browser profiles;
2. forge PASS records, authorizations, ACTIVE markers and receipts;
3. read Medium session cookies from the browser profile and POST to Medium directly, never touching a Hermes tool, so no `pre_tool_call` hook sees it;
4. edit its own Hermes config, plugins and the pinned guard copy (same owner).

The existing guard and the HMAC chain stop mistakes and non-hostile tools. They cannot stop (1) to (4), as `docs/hermes-medium-release.md` already records. A regex over tool arguments cannot close it: the capability (cookies plus network) is outside the tool boundary.

Rule that follows: **the secret that authorizes a publish, and the credential that performs it, must live under an OS identity Hermes cannot become.**

## Read-only evidence from mini

| Fact | Evidence | Consequence |
|---|---|---|
| Only one non-system account in the local directory: `maxsmacmini` (uid 501). `/Users/maxsagent` exists, owned by uid 502, with no matching account in `dscl . -list /Users` | `ls -ld /Users/*`, `dscl . -list /Users` | No service account exists yet. |
| `maxsmacmini` can list another user's home. `/Users/maxsagent` is `drwxr-x---+ staff`; `ls /Users/maxsagent` succeeded, `ls /Users/maxsagent/Library` was denied | `ls -led /Users/maxsagent`; `id` shows gid 20 `staff` | Default new users get primary group `staff` and `maxsmacmini` is in `staff`. A new user created with defaults leaks its top-level home. **The service account needs its own primary group and a 0700 home.** Subdirs with 0700 (like `Library`) held, but that is luck, not design. |
| `maxsmacmini` is in group `admin` (80). `sudo -n true` and `sudo -n -l` answer "a password is required" | `id`, `sudo -n` | No NOPASSWD sudo today. The boundary is only as strong as the secrecy of that password: if Hermes can read it (keychain, Doppler, env, a file), it can become root and read the broker. |
| `ssh localhost` as `maxsmacmini` succeeds with no prompt (`BatchMode=yes`) | `ssh mini 'ssh -o BatchMode=yes localhost id -un'` printed `maxsmacmini` | Any sandbox or wrapper applied to Hermes' process tree is escapable by spawning a fresh login session on the same user. Matters for option B below. |
| `~/Library/LaunchAgents` is `drwx------` owned by `maxsmacmini` and holds ~40 plists | `ls -ld` | Same-user can also start unsandboxed processes via launchd. |
| Medium cookies are in the GStack profile: `~/.gstack/chromium-profile` is a symlink to `~/.gstack/browser-profiles/medium-auth-clean-gstack` (dir mode 0755, `Default/Cookies` mode 0600, owner `maxsmacmini`). A second profile `medium-auth-current` exists. `Cookies` holds 6 rows for `*medium.com` (host names only were read, never values) | `ls -l`, read-only sqlite query with `immutable=1` | The Medium login is readable by Hermes. The same symlinked profile is what the X lane jobs use (`x-*` jobs match "browse"), so Medium cookies sit in a profile shared with other automation. |
| Hermes needs Medium cookies only for publishing and Medium state checks. Enabled cron jobs that mention Medium: `youtube-playlist-to-medium-article` (`cf72679130c9`, every 6h). `daily-agent-schedule-and-capacity-digest` (`e556d6935818`, disabled) has a read-only "Medium article quality audit addendum" that inspects Medium-visible title/subtitle | `~/.hermes/cron/jobs.json` | One writer. The audit is read-only and can become a broker `inspect` op later (not built). |
| A Chrome with `--remote-debugging` is running as `maxsmacmini` | `ps` | Any logged-in Medium state in that Chrome is also reachable over CDP by Hermes. |
| `/usr/bin/sandbox-exec` present; SIP enabled | `command -v`, `csrutil status` | Option C is mechanically available. |

## Recommendation (Option A): publish broker under a separate macOS service user

```
Hermes (maxsmacmini)                         mediumpub broker (_mediumpub)
  cron job / terminal                          owns, mode 0700, unreadable by Hermes:
   |  authorize <slug>                           - broker.key (signs authorizations)
   |  publish <auth_id> <action>                 - eval.key (signs gate records)
   v                                             - pinned social-poster checkout @ <sha>
 /var/mediumpub/run/broker.sock  ------------>   - Medium browser profile + cookies
   (peer uid checked by the kernel)              - snapshots/, auth/, audit.jsonl
```

### What the broker does

- `authorize {package: slug}`: refuses unless the pinned checkout is at `pinned_sha` and clean. Resolves the slug under the workspace (no symlinks, no paths), **copies the package into its own store** (omitting any `release/`, `QUARANTINE.json`, `evals/fingerprint-gate/` the agent may have pre-seeded), runs `python -m scripts.fingerprint_eval.release authorize` **from the pinned checkout with the broker's eval key**, runs `release verify --json`, and signs a broker authorization (HMAC with `broker.key`) binding: package, snapshot id, `content_sha256`, `pinned_sha`, the full evaluator binding (`evaluator_id`, `evaluator_tree_sha256`, `author_corpus_sha256`, `reference_sha256`, `reference_record_sha256`), issue and expiry time. Returns an opaque `auth_id`.
- `publish {auth_id, action, schedule_at?, dry_run}`: checks, in order: broker signature, expiry, policy ceiling (`max_action`, a broker-side setting: `draft` < `schedule` < `publish`), pinned checkout still at the pin and clean, snapshot bytes hash equals the authorized hash, a **fresh** `release verify` against the evaluator as it is now (its binding must still equal the authorization), snapshot binding equals the broker authorization binding. Only then does it hand the snapshot bytes to the executor.
- Executor order is fixed in `executor.execute`: paste exact bytes, read the editor back, `compare(release_md, editor_html) -> (ok, diffs)`, click only if `ok`. The comparator is the W13 interface; the stub fails closed, so an unwired comparison can never click.
- The client request can carry a slug or an `auth_id`. Article bytes, paths, inline authorization documents and unknown fields are rejected by schema (`content_not_accepted`, `unknown_field`). Every request is appended to `audit.jsonl` with the kernel-reported peer uid and never the content.

Hermes never drives Medium for a mutation. The `computer_use` / `pre_tool_call` guard becomes defense in depth: it should additionally **block every Medium-bound tool call** (any navigation or input to medium.com) because the only legitimate path is the socket.

### Who mints the PASS

The evaluator runs only inside the broker, from a checkout the broker user owns, with a record key Hermes cannot read. A modified evaluator on Hermes' side produces records the broker never accepts, because the broker re-derives everything itself. The broker's authorization is signed with a second key, so even holding the eval key would not let anyone mint a broker authorization (tested).

### What it stops

- Reading or using the HMAC keys, forging records, authorizations, ACTIVE markers and receipts (keys are in another user's 0700 store).
- Replaying a PASS for different bytes, a different evaluator, or after expiry.
- Swapping article bytes between authorize and publish (the broker publishes its snapshot, not the agent's tree).
- Reading Medium cookies and POSTing directly, **once the cookies are removed from `maxsmacmini`'s profiles and old sessions are invalidated** (see Migration). Without that step the old cookie copies still work.
- Using a modified evaluator or pre-seeded gate output as a source of PASS.
- Hermes-side dispatcher fail-open: the broker does not depend on any Hermes hook.

### What it does not stop

1. **Anything that passes the gate.** Hermes can still ask the broker to publish a gate-passing package. The ceiling `max_action` bounds that (start at `draft`).
2. **The reference is agent-supplied.** The evaluator judges the final against a "reference" and source notes taken from the package, which Hermes writes. Hermes can make the reference equal the final (`reference_identical`), after which the gate is structural only. The gate checks fidelity to a reference, not truth or review. Closing it means the broker must also hold the rating that names the reference (run the prepublish review inside the broker, or require a human-signed approval token Hermes cannot mint). Not built.
3. **Model-judge manipulation.** The judge and extractor are models; article text is attacker-controlled input to them. Out of scope here.
4. **Email-based Medium login.** If Hermes can read Max's inbox (`gws`, Gmail MCP), it can request a Medium magic link and log in itself, then publish from its own browser. The broker cannot see that. Close by denying Hermes access to Medium login mail, and by treating any Medium session not created by the broker as an incident. Unverified whether Hermes currently has that access.
5. **Root.** `maxsmacmini` is an admin. Anything that learns its password gets root and the broker. Keep the password out of everything Hermes can read; consider demoting the account later (not proposed here).
6. **A compromised broker user or checkout.** Whoever can write `/var/mediumpub` owns the boundary. Keep the checkout non-writable by group/other.
7. **Headless login fragility.** A broker with no GUI session must run Chrome headless; Medium or Cloudflare may challenge it. Untested. See open items.

Reliability: kernel uid separation is the strongest primitive macOS offers short of a VM. It does not rely on regexes, hooks, or Hermes behaving.

### Setup steps (all need Max's approval and sudo; none were run)

Check free ids first: `dscl . -list /Users UniqueID | awk '$2==481'` and `dscl . -list /Groups PrimaryGroupID | awk '$2==481||$2==482'`. Observed maxima on mini: users 501, system groups up to 703 (sharepoint); 481/482 looked free from the tail of the sorted lists but check the whole list. The `dscl` flow below is the documented service-account route; it was not executed here, so verify each step with `dscl . -read` before moving on.

```sh
# 1. dedicated group + service user (own primary group, NOT staff; home 0700; no login shell; hidden)
sudo dscl . -create /Groups/_mediumpub PrimaryGroupID 481
sudo dscl . -create /Groups/_mediumpubclients PrimaryGroupID 482
sudo dscl . -create /Users/_mediumpub UniqueID 481
sudo dscl . -create /Users/_mediumpub PrimaryGroupID 481
sudo dscl . -create /Users/_mediumpub UserShell /usr/bin/false
sudo dscl . -create /Users/_mediumpub RealName "Medium publish broker"
sudo dscl . -create /Users/_mediumpub NFSHomeDirectory /var/mediumpub
sudo dscl . -create /Users/_mediumpub IsHidden 1
sudo dscl . -create /Users/_mediumpub Password '*'
sudo dseditgroup -o edit -a maxsmacmini -t user _mediumpubclients     # may need a new login session or gateway restart to take effect

# 2. directories
sudo install -d -o _mediumpub -g _mediumpub -m 0700 /var/mediumpub /var/mediumpub/store /var/mediumpub/etc /var/mediumpub/profile
sudo install -d -o _mediumpub -g _mediumpubclients -m 0750 /var/mediumpub/run   # socket dir; the socket inherits the dir's group on macOS: confirm with ls -l

# 3. pinned checkout owned by the broker user (a copy, so the broker never reads maxsmacmini's home)
sudo git clone --no-hardlinks /Users/maxsmacmini/Desktop/Projects/social-poster /var/mediumpub/pinned/social-poster
sudo git -C /var/mediumpub/pinned/social-poster checkout <reviewed sha>
sudo chown -R _mediumpub:_mediumpub /var/mediumpub/pinned && sudo chmod -R go-w /var/mediumpub/pinned

# 4. python for the broker user (uv in /var/mediumpub/bin) and evaluator credentials (judge model access) in /var/mediumpub/etc/env, 0600
sudo -u _mediumpub -H sh -c 'curl -LsSf https://astral.sh/uv/install.sh | env UV_INSTALL_DIR=/var/mediumpub/bin sh'

# 5. config, owned by the broker user
sudo -u _mediumpub tee /var/mediumpub/etc/broker.json <<'JSON'
{"store_dir":"/var/mediumpub/store","workspace_root":"/Users/maxsmacmini/Desktop/Projects/social-poster/data/article-workspace",
 "pinned_checkout":"/var/mediumpub/pinned/social-poster","pinned_sha":"<40-hex>","socket_path":"/var/mediumpub/run/broker.sock",
 "allowed_uids":[501],"max_action":"draft","python_cmd":["/var/mediumpub/bin/uv","run","--python","3.12","python"],"pass_env":[]}
JSON
```

Problem to resolve before step 5 works: `workspace_root` is inside `maxsmacmini`'s home (mode 0750 `staff`), which `_mediumpub` cannot read (correct, that is the point). The broker needs the package without that access. Options: (a) Hermes pushes a package tarball through a world-writable drop dir `/var/mediumpub/inbox` (sticky, 1733) and `authorize` takes the dropped name instead of a slug; (b) a read-only ACL on the single `articles/` directory for `_mediumpub` (`chmod +a "_mediumpub allow list,search,readattr,readextattr,read"` on the dir chain, which also needs execute on the parents). (a) is cleaner and keeps the schema property that no bytes travel over the socket (the bytes land in a directory the broker then copies, and the hash is computed by the broker). The prototype reads `workspace_root` directly, assuming (b). Choose before building the real daemon.

```sh
# 6. LaunchDaemon (runs as _mediumpub without a login session)
sudo tee /Library/LaunchDaemons/ai.maxiclaw.medium-broker.plist <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
 <key>Label</key><string>ai.maxiclaw.medium-broker</string>
 <key>UserName</key><string>_mediumpub</string><key>GroupName</key><string>_mediumpub</string>
 <key>WorkingDirectory</key><string>/var/mediumpub/pinned/social-poster</string>
 <key>ProgramArguments</key><array><string>/var/mediumpub/bin/uv</string><string>run</string><string>--python</string><string>3.12</string>
  <string>python</string><string>-m</string><string>scripts.publish_broker.server</string><string>--config</string><string>/var/mediumpub/etc/broker.json</string></array>
 <key>RunAtLoad</key><true/><key>KeepAlive</key><true/>
 <key>StandardErrorPath</key><string>/var/mediumpub/store/broker.err</string>
</dict></plist>
PLIST
sudo chown root:wheel /Library/LaunchDaemons/ai.maxiclaw.medium-broker.plist && sudo chmod 644 /Library/LaunchDaemons/ai.maxiclaw.medium-broker.plist
sudo launchctl bootstrap system /Library/LaunchDaemons/ai.maxiclaw.medium-broker.plist
```

SSH to the service user should stay refused because it is in no SSH-allowed group. `dscl . -read /Groups/com.apple.access_ssh GroupMembership` on mini lists only `maxsagent` even though `maxsmacmini` can ssh (nested group), so do not rely on reading it: confirm after creation with `ssh _mediumpub@localhost` expecting a denial.

### Migration of the Medium login

1. Log the broker's browser profile in as `_mediumpub` (headed once, see open items, or a Playwright `storageState` produced during a supervised session and copied in by root).
2. **Delete Medium cookies from `~/.gstack/browser-profiles/medium-auth-clean-gstack` and `medium-auth-current`, and invalidate the old sessions in Medium (sign out everywhere).** Until then a same-user process holds a working copy. If the X lane shares those profiles, repoint it to a profile without Medium cookies.
3. Add to the guard: block all medium.com navigation or input from Hermes tools.

### Rollback

`sudo launchctl bootout system/ai.maxiclaw.medium-broker`, remove the plist, `sudo dseditgroup -o edit -d maxsmacmini -t user _mediumpubclients`, `sudo dscl . -delete /Users/_mediumpub`, delete both groups, `sudo rm -rf /var/mediumpub` (use `trash` where available). Hermes' own flow reverts to the existing guard, which is unchanged.

### Sudo summary

All of: `dscl` (user and groups), `dseditgroup`, `install -d` under `/var`, `git clone` and `chown` of the pinned checkout, writing `/Library/LaunchDaemons`, `launchctl bootstrap system`. Nothing in the prototype itself needs sudo; it runs in tests as the current user.

## Option B: same user, macOS sandbox-exec around Hermes' terminal and execute_code

- Stops: processes started from a sandboxed tree reading the key dir and the browser profile (`(deny file-read* (subpath ...))`), and making network connections to `medium.com` if the profile also denies `network-outbound` by host (sandbox-exec filters by IP/port, not by hostname, so it is coarse).
- Does not stop: anything outside the process tree. `ssh localhost` returns a fresh `maxsmacmini` login session (verified above); `launchctl`/LaunchAgents start unsandboxed processes; `open`, `osascript`, the already-running Chrome with remote debugging; Hermes itself and `computer_use` (cua-driver) run unsandboxed. Hermes can also edit the wrapper config (same owner).
- Reliability: `sandbox-exec` is deprecated, profiles are brittle across macOS releases and break tools that legitimately need `$HOME`. Not recommended as the boundary.
- Setup: wrap the Hermes terminal backend start command; no sudo. Rollback: remove the wrapper.

## Option C: TCC

TCC prompts guard specific user-data classes (Desktop, Documents, Downloads, Photos, Contacts, screen recording, accessibility) per application. It does not protect arbitrary directories such as `~/.config` or `~/.gstack`, and an app granted access can be driven by Hermes. It does not separate the Hermes user from its own files. Stops nothing in this threat model.

## Option D: file ACLs and flags (`chmod +a`, `chflags`)

The owner can always change the mode and ACL of their own files, so ACLs on `maxsmacmini`'s files do not bind `maxsmacmini`. `chflags schg` (system immutable) needs root to clear but only blocks writes, not reads of the key or cookies. Stops: accidental edits. Does not stop: reading keys or cookies, or an owner who runs `chmod`. Useful only as tamper evidence. ACLs do help in the other direction, to grant `_mediumpub` read access to the package directory (Option A, step 5b).

## Option E: Keychain items with an access control list

Store the HMAC key and Medium credentials as keychain items whose ACL trusts only a specific signed binary.

- Stops: other binaries reading the secret without a prompt.
- Does not stop: any process that can execute the trusted binary (an interpreter, a script runner) or that can answer the unlock prompt. `computer_use` can click an "Allow" dialog on a GUI session. Over `ssh` (no GUI) the keychain returns `errSecInteractionNotAllowed`, which is fail-closed but also breaks legitimate headless use. The login keychain is unlocked in the user's session, so the same user can add its own ACL entry given the keychain password, and cookies in the Chrome profile are not keychain items anyway (Chrome's "Safe Storage" key is, but a same-user process can read that item by asking Chrome's helper or using the stored key).
- Reliability: low to medium; behavior depends on whether a GUI session exists. Not tested here (would change keychain state). Not a substitute for a user boundary.

## Hermes dispatcher fail-open: findings from the source on mini

Source: `~/.hermes/hermes-agent`, HEAD `819cc3cb` (2026-10-04). Checked read-only; one in-memory probe (no file or config written) was piped to the venv python over ssh stdin.

What is closed at this HEAD (differs from the older note in `hermes-medium-release.md` gap 4 and residual 6):

- `hermes_cli/plugins_dispatch.py::invoke_hook` now treats `pre_tool_call` as a fail-closed policy hook (`_HOOK_TIMEOUT_FAIL_CLOSED_HOOKS = {'pre_tool_call'}`, printed by the probe). A callback that raises, or times out (`plugins.hook_callback_timeout`, default 30s), yields `{"action":"block"}` via `_policy_error_block_directive`. So a crash or hang **inside a hook callback** blocks the tool call.

What is still open (proven by the probe):

- `agent/tool_executor.py::_pre_tool_block`, the path the agent loop actually uses (it calls `handle_function_call(..., skip_pre_tool_call_hook=True)` so the hook fires only here), wraps the whole dispatch in `except Exception: return None, ref.args`. Its docstring says "Hook failures never block."
- `model_tools.py::_pre_dispatch_guards` does the same for the other entry: `except Exception as _hook_err: logger.debug(...)` and proceeds.
- Probe: with `hermes_cli.plugins._dispatch_pre_tool_call_hooks` replaced by a function that raises, `_pre_tool_block(...)` returned `(None, {'action': 'click'})` (no block message, proceed) and `_pre_dispatch_guards(...)` returned `None` for the block result. Both fail open on a dispatcher-level exception: an import error of `hermes_cli.plugins`, a failure in plugin discovery or in `hermes_cli.lifecycle.invoke_hook` itself, or anything raised outside a callback.
- I found **no config key or plugin hook** that changes this: the `except` is unconditional and wraps the hook machinery, so a plugin cannot turn it into a block. (Grep of `fail_closed` shows it only in per-callback dispatch, approvals, file and computer_use write guards, and config parsing.) A fix is a source patch: make `_pre_tool_block` and `_pre_dispatch_guards` return a block message on exception for tools in a configured policy set. That is a change to Hermes source, not applied.
- What I did not prove: that an agent can trigger such an exception on demand. Same-user Hermes can edit Hermes' own source, plugins and venv (same owner), so it can induce one deliberately. That is the same-user residual again, and the reason this boundary does not depend on the hook.

Also still true from the earlier doc: hook not registered (mini had none at the time of the earlier check; `hooks_auto_accept: false` in `~/.hermes/config.yaml` line 497), `HERMES_SAFE_MODE=1` skips hooks.

## Prototype: `scripts/publish_broker/`

| File | Role |
|---|---|
| `schema.py` | Request parsing, error codes, content/path/inline-auth rejection, 64 KiB cap |
| `keys.py` | Key load/create (0600, owner = broker uid, no symlink, length), HMAC sign/check |
| `config.py` | Broker config incl. pinned sha, uid allowlist, policy ceiling |
| `packages.py` | Slug resolution, symlink-free snapshot, gate output excluded from the copy |
| `runner.py` | `SubprocessRunner`: canonical release CLI from the pinned checkout, env allowlist, broker's eval key |
| `broker.py` | `authorize` and `publish` checks, audit log |
| `executor.py` | Dry-run editor, fixed paste, read back, compare, click order; `compare` stub (W13) |
| `server.py` / `client.py` | Unix socket server with LOCAL_PEERCRED uid check; client that cannot send content |
| `tests/` | 53 tests, including the refusal paths below |

Run: `~/.local/bin/uv run --python 3.12 --with pytest --with markdown-it-py==4.2.0 python -m pytest -q scripts/publish_broker`

Refusal paths covered: unsigned authorization; authorization signed with another key (and with the evaluator's own record key); edited signed field; snapshot bytes changed after authorize (hash mismatch); stale evaluator (pinned checkout moved, and real `release verify` binding mismatch via a changed evaluator id); dirty or unpinned checkout; expired authorization; policy ceiling; non-dry-run request; client sending content, markdown, html, bytes, a path, or an inline authorization; oversized request; path-like or newline-bearing package refs; peer uid not allowed; failed gate leaves no snapshot; symlinked package and symlink inside a package; forged `release/` dir in the agent's package not imported; workspace tampering after authorize does not change the paste plan; compare failure and unwired comparator stop the click.

What the prototype does not do: no browser, no real Medium call, no `inspect` op, no drop-dir intake, no rate limiting, no single-use marking (only dry-run is served, so nothing is consumed). The `SubprocessRunner` is tested against the real release CLI for `verify`; `authorize` through the subprocess needs real judge credentials and was not run.

## Open items for Max

1. Approve the sudo steps, ids, and the choice of intake for packages (drop dir recommended).
2. Evaluator credentials for `_mediumpub` (judge model access) and whether the subscription or gateway is used.
3. Live test that Chrome can run headless as a LaunchDaemon user and stay logged in to Medium; if it cannot, the fallback is a GUI session for a second user (Fast User Switching), which still keeps cookies out of Hermes' reach.
4. Revoke the old Medium sessions after the migration.
5. Decide whether `max_action` starts at `draft`.
6. Patch Hermes `_pre_tool_block` / `_pre_dispatch_guards` to fail closed (separate change, upstream or local).
