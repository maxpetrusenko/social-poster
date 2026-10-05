#!/usr/bin/env python3
"""Hermes pre_tool_call guard: no Medium mutation without a valid fingerprint-gate release.

Wire (verified in hermes-agent agent/shell_hooks.py): stdin JSON
``{hook_event_name, tool_name, tool_input, session_id, cwd, profile, extra}``.
Exit 2 blocks the call (stderr = reason); a JSON ``{"action":"block","message":..}`` on stdout is
honoured too. Exit 0 with no output allows. With ``fail_closed: true`` in config, a crash, timeout or
non-JSON stdout of this script also blocks, so the config entry is the outer safety net.

Policy: a call is a Medium mutation when it would type/paste/click in the Medium editor, or navigate to
new-story / edit / submission pages. Mutations are allowed only if
``<workspace>/release/ACTIVE.json`` names a package whose
``uv run --python 3.12 python -m scripts.fingerprint_eval.release verify --package P`` exits 0.
Read-only Medium navigation (stats, stories list, reading) is allowed. Deterministic, no LLM.

Tool surfaces covered (see docs/hermes-medium-release.md for the evidence):
  * computer_use  (the visible GStack / Chrome-for-Testing path the Medium skills mandate). Click and
    type payloads carry only an element index or raw text, never the page or button label, so every
    input action aimed at a browser (or at the unspecified frontmost app) is treated as a mutation.
  * browser_* (Hermes built-in browser). Last navigated URL per session is tracked; input tools on a
    Medium page are mutations.
  * terminal / execute_code: Medium URLs combined with write verbs, browse-CLI input verbs on a Medium
    page, osascript / cliclick / cua-driver / peekaboo input.

Round 3: unknown browser tools are mutations (read-only allowlist only); before a verified FULL paste only editor
navigation, Enter on that typed URL, cmd+a and the full paste pass (exact bytes, no clicks); verify runs as
`release verify --json` under a flock, the release bytes are read once and must match the verified content_sha256;
the verifier path comes from the pinned config.json (env overrides only under MEDIUM_GUARD_TEST_MODE=1 + pytest);
subprocesses get an allowlisted env.

Hardening (see docs/hermes-medium-release.md, "Tamper resistance"): the guard fails closed (any error on a
mutation or possible mutation blocks, only clearly read-only calls pass on an error), runs from a pinned
copy under ~/.hermes/guards with a sha256 manifest it checks against itself, and keeps url memory and
paste receipts in ~/.hermes/guards/state signed with an HMAC key. Best effort against file-edit tampering
by the same OS user; NOT a defence against a determined same-user process (it can read the key).
"""
from __future__ import annotations

import fcntl
import hashlib
import hmac
import json
import os
import re
import stat
import subprocess
import sys
import tempfile
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Callable
from urllib.parse import urlparse

REPO_ROOT = Path(__file__).resolve().parents[2]
VERIFY_TIMEOUT_S = 75  # hook timeout in config must be larger (docs use 90)
BLOCK_EXIT = 2

# ---- classification tables ------------------------------------------------------------------------
CU_READ_ACTIONS = {"capture", "list_apps", "list_windows", "wait", "scroll", "focus_app"}
CU_INPUT_ACTIONS = {"click", "double_click", "right_click", "middle_click", "drag", "type", "key", "set_value"}
# Apps whose computer_use input is exempt from the guard. EMPTY by default: terminals and every other app are mutations.
CU_NON_BROWSER_ALLOWLIST: frozenset[str] = frozenset()
BROWSER_APP_RE = re.compile(r"chrome|chromium|gstack|browser|safari|firefox|arc|brave|edge|medium", re.I)

BROWSER_NAV_TOOLS = {"browser_navigate"}
# Explicit read-only allowlist. EVERY other browser_* tool (and any unrecognized browser-touching tool) is a
# mutation by default: unknown means fail closed, not fail open.
BROWSER_READ_TOOLS = {"browser_snapshot", "browser_vision", "browser_get_images", "browser_screenshot",
                      "browser_capture", "browser_get_text", "browser_list", "browser_list_tabs",
                      "browser_wait", "browser_scroll"}
BROWSER_ALL_RE = re.compile(r"^browser_")
# Exact names of tools that cannot drive a browser or the desktop: file read/search/write, memory, todo, skills,
# session search, API-based web research, delegation (children fire their own hooks). NOT here on purpose:
# vision_analyze, mcp__*, anything namespaced, any browser_*/computer_* name. Everything else is a mutation.
SAFE_NON_BROWSER_TOOLS = {"read_file", "search_files", "list_files", "list_directory", "glob", "grep", "write_file",
                          "patch", "edit_file", "memory", "todo", "todo_write", "skill_view", "skills_list",
                          "session_search", "web_search", "web_extract", "delegate_task", "clarify"}
# Tokens of a tool name that mean "this can drive a browser or the desktop".
BROWSER_TOUCH_TOKENS = {"browser", "chrome", "chromium", "gstack", "playwright", "puppeteer", "patchright", "cdp",
                        "selenium", "webdriver", "computer", "mouse", "keyboard", "keystroke", "click", "desktop",
                        "peekaboo", "cliclick", "osascript", "applescript", "cua"}

MEDIUM_HOST_RE = re.compile(r"(^|\.)medium\.com$", re.I)
MEDIUM_URL_RE = re.compile(r"https?://(?:[\w-]+\.)*medium\.com[^\s'\"<>)]*", re.I)
# write-ish Medium pages: editor, new story, edit, publish/submission, delta/graphql API
MEDIUM_WRITE_PATH_RE = re.compile(
    r"^/(new-story|p/[^/]+/(edit|submission)|_/(api|graphql)|@[^/]+/[^/]+-[0-9a-f]{8,}/edit|me/stories/(drafts|scheduled)/new)",
    re.I)

TERMINAL_KEYS = ("command", "cmd", "script")
CODE_KEYS = ("code", "script", "command")

BROWSE_BIN = r"(?:\$B|\$\{B\}|\bbrowse(?:\.sh)?|gstack-browse|browse-auth|\bagent-browser)"
BROWSE_INPUT_RE = re.compile(
    BROWSE_BIN + r"\s+(click|fill|type|press|paste|upload|js|eval|key|keyboard|select|check|uncheck|hover|dblclick)\b")
BROWSE_GOTO_RE = re.compile(BROWSE_BIN + r"\s+(?:goto|navigate|open)\s+['\"]?(\S+?)['\"]?(?:\s|$)")
HTTP_WRITE_RE = re.compile(
    r"(-X\s*(POST|PUT|PATCH|DELETE)\b|--request\s+(POST|PUT|PATCH|DELETE)\b|\s(-d|--data\S*|--json|-F|--form)\b"
    r"|requests\.(post|put|patch|delete)|httpx\.(post|put|patch|delete)|fetch\(|XMLHttpRequest|\.post\()", re.I)
DESKTOP_DRIVER_RE = re.compile(
    r"\b(osascript|cliclick|cua-driver|peekaboo\s+(click|type|hotkey|paste|press)|System\s+Events|"
    r"playwright|puppeteer|patchright|chrome-remote-interface|--remote-debugging|9222|cdp)\b", re.I)


class Decision:
    __slots__ = ("allow", "reason", "mutation")

    def __init__(self, allow: bool, reason: str = "", mutation: bool = False) -> None:
        self.allow, self.reason, self.mutation = allow, reason, mutation


# ---- helpers --------------------------------------------------------------------------------------
def _is_medium_url(url: str) -> bool:
    try:
        host = urlparse(url if "//" in url else "https://" + url).hostname or ""
    except ValueError:
        return False
    return bool(MEDIUM_HOST_RE.search(host))


def _is_medium_write_url(url: str) -> bool:
    if not _is_medium_url(url):
        return False
    try:
        path = urlparse(url if "//" in url else "https://" + url).path or "/"
    except ValueError:
        return True
    return bool(MEDIUM_WRITE_PATH_RE.match(path))


def _strings(obj: Any) -> list[str]:
    out: list[str] = []
    if isinstance(obj, str):
        out.append(obj)
    elif isinstance(obj, dict):
        for v in obj.values():
            out += _strings(v)
    elif isinstance(obj, list):
        for v in obj:
            out += _strings(v)
    return out


class StateError(Exception):
    """Guard state, key, manifest or receipt store is unreadable, unwritable or tampered with."""


def test_mode(env: dict[str, str]) -> bool:
    """Env overrides (guard dir, state dir, workspace, verifier, repo) are honoured ONLY when
    MEDIUM_GUARD_TEST_MODE=1 AND the process is running under pytest. In production they are ignored, so a
    poisoned hook environment cannot repoint the verifier or the state."""
    return env.get("MEDIUM_GUARD_TEST_MODE") == "1" and ("pytest" in sys.modules or "PYTEST_CURRENT_TEST" in os.environ)


def _ovr(env: dict[str, str], *names: str) -> str:
    if test_mode(env):
        for n in names:
            if env.get(n):
                return env[n]
    return ""


def guard_dir(env: dict[str, str]) -> Path:
    o = _ovr(env, "MEDIUM_GUARD_DIR")
    if o:
        return Path(o)
    here = Path(__file__).resolve().parent
    return here if (here / "manifest.sha256").exists() else Path.home() / ".hermes" / "guards"


def state_dir(env: dict[str, str]) -> Path:
    return Path(_ovr(env, "MEDIUM_GUARD_STATE_DIR") or guard_dir(env) / "state")


def _canon(obj: Any) -> bytes:
    return json.dumps(obj, sort_keys=True, separators=(",", ":")).encode("utf-8")


def _key(env: dict[str, str]) -> bytes:
    path = guard_dir(env) / "key"
    try:
        raw = path.read_bytes().strip()
    except OSError as exc:
        raise StateError(f"cannot read HMAC key {path}: {exc}") from exc
    if len(raw) < 32:
        raise StateError(f"HMAC key {path} is too short")
    return raw


def _sign(env: dict[str, str], obj: Any) -> str:
    return hmac.new(_key(env), _canon(obj), hashlib.sha256).hexdigest()


def _verify_sig(env: dict[str, str], obj: Any, sig: Any) -> bool:
    return isinstance(sig, str) and hmac.compare_digest(_sign(env, obj), sig)


def _load_state(env: dict[str, str]) -> dict[str, str]:
    """Signed url memory. Missing file is an empty state; unreadable, unsigned or tampered raises StateError."""
    path = state_dir(env) / "url-memory.json"
    try:
        raw = path.read_text(encoding="utf-8")
    except FileNotFoundError:
        return {}
    except OSError as exc:
        raise StateError(f"cannot read {path}: {exc}") from exc
    try:
        doc = json.loads(raw)
        data, sig = doc["data"], doc["sig"]
        if not isinstance(data, dict):
            raise ValueError("data is not an object")
    except (ValueError, KeyError, TypeError) as exc:
        raise StateError(f"{path} is corrupt or unsigned: {exc}") from exc
    if not _verify_sig(env, data, sig):
        raise StateError(f"{path} signature mismatch (tampered)")
    return data


@contextmanager
def state_lock(env: dict[str, str], timeout_s: float = 20.0):
    """Exclusive flock on <state>/.lock around every read-modify-write of guard state (concurrent sessions would
    otherwise lose each other's url memory). Raises StateError when the lock cannot be taken."""
    path = state_dir(env) / ".lock"
    try:
        path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        fh = open(path, "a")
    except OSError as exc:
        raise StateError(f"cannot open state lock {path}: {exc}") from exc
    try:
        deadline = time.monotonic() + timeout_s
        while True:
            try:
                fcntl.flock(fh.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except OSError as exc:
                if time.monotonic() >= deadline:
                    raise StateError(f"cannot lock {path}: {exc}") from exc
                time.sleep(0.02)
        yield
    finally:
        fh.close()


def _remember_url(env: dict[str, str], session: str, url: str) -> None:
    """Record last browser URL per session in signed state (flock-guarded read-modify-write).
    Raises StateError on ANY failure."""
    try:
        p = state_dir(env) / "url-memory.json"
        p.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        with state_lock(env):
            state = _load_state(env)
            if len(state) > 200:
                state = dict(list(state.items())[-100:])
            state[session or "_"] = url
            fd, tmp = tempfile.mkstemp(dir=str(p.parent), prefix=".mg-")
            with os.fdopen(fd, "w") as fh:
                json.dump({"data": state, "sig": _sign(env, state)}, fh)
            os.replace(tmp, p)
    except StateError:
        raise
    except Exception as exc:  # noqa: BLE001 - every write failure is a guard error
        raise StateError(f"cannot write guard state: {exc}") from exc


def _remember_nav(env: dict[str, str], session: str, url: str) -> None:
    """Remember a navigation. A write failure only matters if the target could be Medium (or is unparseable);
    for a clearly non-Medium URL a stale memory can only over-block later, never under-block."""
    try:
        _remember_url(env, session, url)
    except StateError:
        if _could_be_medium(url):
            raise


def _could_be_medium(url: str) -> bool:
    try:
        host = urlparse(url if "//" in url else "https://" + url).hostname
    except ValueError:
        return True
    return (not host) or bool(MEDIUM_HOST_RE.search(host))


def _on_medium(env: dict[str, str], session: str) -> bool:
    return _is_medium_url(_load_state(env).get(session or "_", ""))


# ---- integrity (guard file, config, key) ----------------------------------------------------------
def _manifest(env: dict[str, str]) -> dict[str, str]:
    path = guard_dir(env) / "manifest.sha256"
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError as exc:
        raise StateError(f"cannot read manifest {path}: {exc}") from exc
    out: dict[str, str] = {}
    for ln in lines:
        parts = ln.split()
        if len(parts) == 2 and re.fullmatch(r"[0-9a-f]{64}", parts[0]):
            out[parts[1].lstrip("*")] = parts[0]
    return out


def self_check(env: dict[str, str]) -> tuple[bool, str]:
    """Verify this file (and config.json, if any) against the manifest, and the key file's permissions."""
    try:
        man = _manifest(env)
        me = Path(__file__).resolve()
        want = man.get("medium_publish_guard.py")
        if not want:
            return False, "manifest has no entry for medium_publish_guard.py"
        if _sha(me.read_bytes()) != want:
            return False, "guard file hash does not match the manifest (modified after install)"
        cfg = guard_dir(env) / "config.json"
        if cfg.exists() or "config.json" in man:
            if "config.json" not in man or not cfg.exists() or _sha(cfg.read_bytes()) != man["config.json"]:
                return False, "config.json does not match the manifest"
        keyp = guard_dir(env) / "key"
        if keyp.stat().st_mode & 0o077:
            return False, f"{keyp} is group/world accessible"
        _key(env)
        return True, ""
    except StateError as exc:
        return False, str(exc)
    except Exception as exc:  # noqa: BLE001
        return False, f"integrity check error ({type(exc).__name__}: {exc})"


def _config(env: dict[str, str]) -> dict[str, Any]:
    try:
        data = json.loads((guard_dir(env) / "config.json").read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


# ---- classify -------------------------------------------------------------------------------------
def classify(payload: dict[str, Any], env: dict[str, str]) -> tuple[bool, str]:
    """Return (is_mutation, why). Pure except for the per-session last-URL memo."""
    tool = str(payload.get("tool_name") or "")
    args = payload.get("tool_input")
    args = args if isinstance(args, dict) else {}
    session = str(payload.get("session_id") or "")

    if tool == "computer_use":
        action = str(args.get("action") or "").strip().lower()
        if action in CU_READ_ACTIONS:
            return False, ""
        app = str(args.get("app") or "")
        if app.strip() and any(app.strip().lower() == a.lower() for a in CU_NON_BROWSER_ALLOWLIST):
            return False, ""
        # Every input action is a mutation whatever the target app: terminals (Terminal, iTerm2, Warp, Ghostty, kitty,
        # Alacritty, WezTerm) can drive the browser via `open` or osascript. Unknown actions count as input.
        return True, f"computer_use {action or '?'} on {app or 'frontmost window'}"

    if tool in BROWSER_READ_TOOLS:  # exact full-name match only: no prefix/suffix/namespace tricks
        return False, ""
    if tool in BROWSER_NAV_TOOLS:
        url = str(args.get("url") or "")
        _remember_nav(env, session, url)
        if _is_medium_write_url(url):
            return True, f"browser_navigate to Medium write page {url}"
        return False, ""
    if BROWSER_ALL_RE.match(tool):
        return True, f"{tool}: browser tool not on the read-only allowlist (default is mutation)"

    if tool in {"terminal", "execute_code", "process", "bash", "shell"}:
        texts = [str(args.get(k) or "") for k in (*TERMINAL_KEYS, *CODE_KEYS)] or _strings(args)
        text = "\n".join(t for t in texts if t) or "\n".join(_strings(args))
        return _classify_command(text, env, session)

    if tool in SAFE_NON_BROWSER_TOOLS:
        return False, ""
    # Round 4: every other tool name (namespaced variants, opaque tools such as vision_analyze, anything new) is a
    # mutation. decide() then blocks it unless ACTIVE is valid and a verified full-paste receipt exists.
    return True, f"{tool}: tool is not on the exact-name safe list (default is mutation)"


def _touches_browser(tool: str) -> bool:
    return bool(set(re.split(r"[^a-z0-9]+", tool.lower())) & BROWSER_TOUCH_TOKENS)


def _classify_command(text: str, env: dict[str, str], session: str) -> tuple[bool, str]:
    if not text.strip():
        return False, ""
    medium_urls = MEDIUM_URL_RE.findall(text)
    for g in BROWSE_GOTO_RE.finditer(text):
        _remember_nav(env, session, g.group(1))
        if _is_medium_write_url(g.group(1)):
            return True, f"browse goto Medium write page {g.group(1)}"
    on_medium = bool(medium_urls) or _on_medium(env, session)
    if on_medium and BROWSE_INPUT_RE.search(text):
        return True, "browse CLI input on a Medium page"
    if medium_urls:
        if any(_is_medium_write_url(u) for u in medium_urls):
            return True, "command targets a Medium write URL"
        if HTTP_WRITE_RE.search(text):
            return True, "write-style HTTP call to medium.com"
        if DESKTOP_DRIVER_RE.search(text):
            return True, "desktop/CDP driver aimed at medium.com"
    elif re.search(r"\b(pbcopy|set the clipboard|NSPasteboard)\b", text):
        return True, "clipboard write (paste source must be release bytes)"
    elif re.search(r"\b(osascript|cliclick|cua-driver)\b", text) and re.search(
            r"keystroke|key code|click|paste|\btype\b|cmd\+v|command down", text, re.I):
        return True, "OS-level input injection (target page unknowable)"
    return False, ""


# ---- release verify -------------------------------------------------------------------------------
def workspace(env: dict[str, str]) -> Path:
    return Path(_ovr(env, "MEDIUM_GUARD_WORKSPACE", "FINGERPRINT_EVAL_WORKSPACE")
                or _config(env).get("workspace") or REPO_ROOT / "data" / "article-workspace")


def repo_root(env: dict[str, str]) -> Path:
    return Path(_ovr(env, "MEDIUM_GUARD_REPO") or _config(env).get("repo") or REPO_ROOT)


def _owned_by_me(path: Path, *, need_dir: bool = False) -> str:
    """'' if `path` is absolute, exists, owned by the current user and not group/world writable, else why not."""
    if not path.is_absolute():
        return f"{path} is not an absolute path"
    try:
        st = os.stat(path)
    except OSError as exc:
        return f"cannot stat {path}: {exc}"
    if need_dir != stat.S_ISDIR(st.st_mode):
        return f"{path} is not a {'directory' if need_dir else 'file'}"
    if st.st_uid != os.getuid():
        return f"{path} is not owned by the current user"
    if st.st_mode & 0o022:
        return f"{path} is group/world writable"
    return ""


def pinned_verifier(env: dict[str, str]) -> tuple[str, Path]:
    """(uv path, repo path) from the pinned, manifest-checked config.json written by install_guard.sh. The uv file
    must hash to config's uv_sha256. Env overrides apply only in test mode. Raises StateError on any problem."""
    cfg = _config(env)
    uv = _ovr(env, "MEDIUM_GUARD_UV")
    if uv:
        why = _owned_by_me(Path(uv))
        if why:
            raise StateError(f"verifier rejected: {why}")
    else:
        uv = cfg.get("uv")
        want = cfg.get("uv_sha256")
        if not isinstance(uv, str) or not isinstance(want, str) or not re.fullmatch(r"[0-9a-f]{64}", want):
            if test_mode(env):
                uv = find_uv_for_tests()
                want = None
            else:
                raise StateError("config.json pins no verifier (uv, uv_sha256); rerun install_guard.sh")
        why = _owned_by_me(Path(uv))
        if why:
            raise StateError(f"verifier rejected: {why}")
        if want is not None and _sha(Path(uv).read_bytes()) != want:
            raise StateError(f"verifier {uv} does not match the pinned sha256 (changed after install)")
    repo = repo_root(env)
    why = _owned_by_me(repo, need_dir=True)
    if why:
        raise StateError(f"repo rejected: {why}")
    return uv, repo


def find_uv_for_tests() -> str:
    for cand in (str(Path.home() / ".local" / "bin" / "uv"), "/opt/homebrew/bin/uv", "/usr/local/bin/uv"):
        if Path(cand).exists():
            return cand
    raise StateError("no uv found (test mode)")


SUBPROCESS_ENV_KEYS = ("PATH", "HOME", "USER", "LANG", "TMPDIR", "UV_CACHE_DIR", "UV_PYTHON_INSTALL_DIR")


def sub_env(env: dict[str, str] | None = None, extra: dict[str, str] | None = None) -> dict[str, str]:
    """Allowlisted environment for uv / pbpaste / osascript. No API keys, tokens or anything else leaks in."""
    src = os.environ if env is None else {**os.environ, **env}
    out = {k: src[k] for k in SUBPROCESS_ENV_KEYS if k in src}
    out.setdefault("PATH", "/usr/bin:/bin:/usr/sbin:/sbin")
    out.update(extra or {})
    return out


DEFAULT_RECORD_KEY = Path.home() / ".config" / "fingerprint-eval" / "record.key"
ACTIVE_SIG_FIELD = "hmac_sha256"


def record_key_path(env: dict[str, str]) -> Path:
    """The fingerprint-eval record key (same file record.py signs with). Pinned in config.json ("record_key");
    test-mode env override MEDIUM_GUARD_RECORD_KEY only."""
    o = _ovr(env, "MEDIUM_GUARD_RECORD_KEY")
    if o:
        return Path(o)
    cfg = _config(env).get("record_key")
    return Path(cfg) if isinstance(cfg, str) and cfg else DEFAULT_RECORD_KEY


def _record_key(env: dict[str, str]) -> bytes:
    path = record_key_path(env)
    try:
        if not path.is_absolute():
            raise StateError(f"record key path {path} is not absolute")
        st = path.stat()
        if st.st_mode & 0o077:
            raise StateError(f"record key {path} is group/world accessible")
        raw = path.read_bytes().strip()
    except OSError as exc:
        raise StateError(f"cannot read record key {path}: {exc}") from exc
    if len(raw) < 32:
        raise StateError(f"record key {path} is too short")
    return raw


def verify_active_sig(env: dict[str, str], doc: dict[str, Any]) -> str:
    """'' if ACTIVE.json carries a valid record.py-style HMAC (canonical json minus the sig field), else why not."""
    sig = doc.get(ACTIVE_SIG_FIELD)
    if not isinstance(sig, str) or not sig:
        return f"ACTIVE.json is unsigned (no {ACTIVE_SIG_FIELD}); re-run `release authorize`"
    body = {k: v for k, v in doc.items() if k != ACTIVE_SIG_FIELD}
    canon = json.dumps(body, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode()
    want = hmac.new(_record_key(env), canon, hashlib.sha256).hexdigest()
    return "" if hmac.compare_digest(want, sig) else "ACTIVE.json signature invalid (modified or not written by release authorize)"


def _package_slug(pkg: Path) -> str:
    try:
        vj = json.loads((pkg / "version.json").read_text(encoding="utf-8"))
        if isinstance(vj, dict) and vj.get("slug"):
            return str(vj["slug"])
    except (OSError, ValueError):
        pass
    return pkg.name


def active_package(env: dict[str, str]) -> tuple[tuple[Path, str, str] | None, str]:
    """Trusted ACTIVE selector. Returns ((package, slug, content_sha256), '') or (None, why).
    ACTIVE.json must be HMAC-signed with the record key; its package must be an absolute path that resolves
    (no '..', no symlink escape) strictly inside the pinned workspace. Slug and content hash are compared with the
    package and the verifier by decide()."""
    ws = workspace(env)
    active = ws / "release" / "ACTIVE.json"
    try:
        data = json.loads(active.read_text())
    except FileNotFoundError:
        return None, f"no active release: {active} does not exist (run `release authorize`)"
    except (OSError, ValueError) as exc:
        return None, f"unreadable {active}: {exc}"
    if not isinstance(data, dict):
        return None, f"{active} is not a JSON object"
    why = verify_active_sig(env, data)
    if why:
        return None, why
    ref, slug, sha = data.get("package"), data.get("slug"), data.get("content_sha256")
    if not isinstance(ref, str) or not ref.strip():
        return None, f"{active} names no package"
    if not isinstance(slug, str) or not slug or not isinstance(sha, str) or not re.fullmatch(r"[0-9a-f]{64}", sha):
        return None, f"{active} lacks a slug or content_sha256"
    p = Path(ref)
    if not p.is_absolute() or ".." in p.parts:
        return None, f"{active} package {ref!r} must be an absolute path without '..'"
    wsr, real = Path(os.path.realpath(ws)), Path(os.path.realpath(p))
    if real == wsr or wsr not in real.parents:
        return None, f"{active} package {ref!r} resolves outside the workspace {wsr}"
    if not real.is_dir():
        return None, f"{active} names package {ref!r} which is not a directory"
    return (real, slug, sha), ""


def run_verify(package: Path, env: dict[str, str]) -> tuple[int, str]:
    """Run `release verify --package P --json` with the pinned uv/repo and an allowlisted env.
    Returns (exit code, stdout JSON on success | error text on failure)."""
    try:
        uv, repo = pinned_verifier(env)
    except StateError as exc:
        return 127, str(exc)
    cmd = [uv, "run", "--python", "3.12", "python", "-m", "scripts.fingerprint_eval.release",
           "verify", "--package", str(package), "--json"]
    try:
        proc = subprocess.run(cmd, cwd=str(repo), capture_output=True, text=True, timeout=VERIFY_TIMEOUT_S,
                              env=sub_env(env, {"FINGERPRINT_EVAL_WORKSPACE": str(workspace(env))}),
                              stdin=subprocess.DEVNULL)
    except subprocess.TimeoutExpired:
        return 124, f"release verify timed out after {VERIFY_TIMEOUT_S}s"
    except OSError as exc:
        return 127, f"release verify could not start: {exc}"
    if proc.returncode == 0:
        return 0, proc.stdout
    return proc.returncode, (proc.stderr or proc.stdout or "").strip()[-400:]


class Verified:
    """Result of one successful `verify --json`: the hash of the exact bytes the verifier vouched for."""
    __slots__ = ("pkg", "sha")

    def __init__(self, pkg: Path, sha: str) -> None:
        self.pkg, self.sha = pkg, sha


def parse_verify_json(out: str) -> tuple[str, str]:
    """(content_sha256, why). why is '' on success. release_article_sha256, if present, must agree."""
    try:
        doc = json.loads(out)
    except (ValueError, TypeError):
        return "", "verify --json did not print a JSON object (is the G1 verifier installed?)"
    if not isinstance(doc, dict) or doc.get("valid") is not True:
        return "", "verify --json did not report valid: true"
    sha = doc.get("content_sha256")
    if not isinstance(sha, str) or not re.fullmatch(r"[0-9a-f]{64}", sha):
        return "", "verify --json carries no usable content_sha256"
    rel = doc.get("release_article_sha256")
    if rel is not None and rel != sha:
        return "", "verify --json: release_article_sha256 differs from content_sha256"
    return sha, ""


@contextmanager
def release_lock(pkg: Path, timeout_s: float = 20.0):
    """flock on <package>/release/.guard.lock, held across verify AND the content comparison."""
    path = pkg / "release" / ".guard.lock"
    try:
        fh = open(path, "a")
    except OSError as exc:
        raise StateError(f"cannot open {path}: {exc}") from exc
    try:
        deadline = time.monotonic() + timeout_s
        while True:
            try:
                fcntl.flock(fh.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except OSError as exc:
                if time.monotonic() >= deadline:
                    raise StateError(f"cannot lock {path}: {exc}") from exc
                time.sleep(0.05)
        yield
    finally:
        fh.close()  # closing releases the flock


def authorize_mutation(pkg: Path, env: dict[str, str], verifier: Callable[[Path, dict[str, str]], tuple[int, str]]
                       ) -> tuple[bool, str, "Verified | None"]:
    """Verify the package once. Caller must hold release_lock(pkg) (see decide)."""
    try:
        rc, out = verifier(pkg, env)
    except Exception as exc:  # noqa: BLE001 - never allow from a handler
        return False, f"release authorization error ({type(exc).__name__}: {exc})", None
    if rc != 0:
        return False, f"release verify failed for {pkg.name} (exit {rc}): {out or 'no output'}", None
    sha, bad = parse_verify_json(out)
    if bad:
        return False, f"release verify output rejected for {pkg.name}: {bad}", None
    return True, "", Verified(pkg, sha)


FRAGMENT_MIN_CHARS = 40  # typed/pasted fragments at least this long must be substrings of the release text
URL_ONLY_RE = re.compile(r"^\s*(https?://\S+|[\w.-]+\.[a-z]{2,}/\S*)\s*$", re.I)
PASTE_MODS = {"cmd", "command", "ctrl", "control", "meta", "super", "win", "windows"}
ENTER_KEYS = {"return", "enter", "space", "kp_enter", "numpad_enter"}


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()


def _loose(s: str) -> str:
    return re.sub(r"\W+", "", s).lower()


def _sha(b: bytes | str) -> str:
    return hashlib.sha256(b if isinstance(b, bytes) else b.encode("utf-8")).hexdigest()


def is_paste_keys(keys: str) -> bool:
    """cmd+v, ctrl+v, cmd+shift+v, ctrl+shift+v, shift+insert, super+v ..."""
    parts = {t.strip().lower() for t in re.split(r"[+\s-]+", keys or "") if t.strip()}
    if not parts:
        return False
    return ("v" in parts and bool(parts & PASTE_MODS)) or ("insert" in parts and "shift" in parts)


def is_select_all(keys: str) -> bool:
    parts = {t.strip().lower() for t in re.split(r"[+\s-]+", keys or "") if t.strip()}
    return "a" in parts and len(parts) == 2 and bool(parts & {"cmd", "command", "ctrl", "control", "meta", "super"})


def kind_of(payload: dict[str, Any]) -> str:
    """Sub-kind of a call already classified as a mutation: paste|type|enter|key|nav|click|clipboard|deny."""
    tool = str(payload.get("tool_name") or "")
    args = payload.get("tool_input") if isinstance(payload.get("tool_input"), dict) else {}
    if tool == "computer_use":
        action = str(args.get("action") or "").lower()
        if action == "type":
            return "type"
        if action == "right_click":
            return "deny"  # context-menu Paste cannot be inspected
        if action == "key":
            keys = str(args.get("keys") or "")
            if is_paste_keys(keys):
                return "paste"
            if is_select_all(keys):
                return "selectall"
            if {t.lower() for t in re.split(r"[+\s]+", keys) if t} & ENTER_KEYS:
                return "enter"
            return "key"
        return "click"
    if tool == "browser_navigate":
        return "nav"
    if tool == "browser_press":
        key = str(args.get("key") or "")
        if is_paste_keys(key):
            return "paste"
        return "selectall" if is_select_all(key) else ("enter" if key.lower() in ENTER_KEYS else "key")
    if tool == "browser_type":
        return "type"
    text = "\n".join(_strings(args))
    if tool in {"terminal", "execute_code", "process", "bash", "shell"}:
        if re.search(r"\b(pbcopy|set the clipboard|NSPasteboard|xclip|wl-copy)\b", text):
            return "clipboard"
        m = re.search(BROWSE_BIN + r"\s+(?:press|key)\s+['\"]?(\S+)", text)
        if m and is_paste_keys(m.group(1)):
            return "paste"
        if re.search(BROWSE_BIN + r"\s+paste\b", text):
            return "paste"
        if BROWSE_GOTO_RE.search(text) and not BROWSE_INPUT_RE.search(text):
            return "nav"
    return "click"


# ---- clipboard ------------------------------------------------------------------------------------
def read_clipboard(env: dict[str, str]) -> tuple[bytes | None, str | None, str]:
    """(plain_bytes, html_text_or_None, error). Plain bytes are raw pbpaste output: no decoding, no stripping.
    pbpaste does not add a trailing newline (verified: printf abc | pbcopy; pbpaste | xxd -> 616263), so no
    newline normalisation is applied anywhere. Rich flavor is best effort; plain failure => error."""
    senv = sub_env(env)
    try:
        p = subprocess.run(["pbpaste"], capture_output=True, timeout=5, env=senv, stdin=subprocess.DEVNULL)
    except (OSError, subprocess.TimeoutExpired) as exc:
        return None, None, f"pbpaste failed: {exc}"
    if p.returncode != 0:
        return None, None, f"pbpaste exited {p.returncode}"
    plain = p.stdout
    html = None
    try:
        o = subprocess.run(["osascript", "-e", "the clipboard as «class HTML»"], capture_output=True,
                           timeout=5, text=True, env=senv, stdin=subprocess.DEVNULL)
        m = re.search(r"«data HTML([0-9A-Fa-f]+)»", o.stdout or "")
        if o.returncode == 0 and m:
            raw = bytes.fromhex(m.group(1)).decode("utf-8", errors="replace")
            html = re.sub(r"<[^>]+>", " ", raw)
    except (OSError, subprocess.TimeoutExpired, ValueError):
        html = None
    return plain, html, ""


def check_clipboard(clip: tuple[Any, str | None, str], release_bytes: bytes) -> tuple[str, str]:
    """Return (kind, reason). kind is 'full' (EXACT bytes), 'fragment' or '' (block, reason set)."""
    plain, html, err = clip
    if plain is None:
        return "", f"cannot read the clipboard ({err}); failing closed"
    pb = plain if isinstance(plain, bytes) else str(plain).encode("utf-8")
    text = pb.decode("utf-8", errors="replace")
    if not text.strip():
        return "", "clipboard is empty"
    if html is not None and _loose(html) and _loose(html) not in _loose(text) and _loose(text) not in _loose(html):
        return "", "clipboard rich (HTML) flavor differs from its plain-text flavor"
    if pb == release_bytes:
        return "full", ""
    release_text = release_bytes.decode("utf-8", errors="replace")
    n = _norm(text)
    if len(n) >= FRAGMENT_MIN_CHARS and n in _norm(release_text):
        return "fragment", ""
    return "", ("clipboard is neither the exact release bytes nor a >=40 char substring of the release text "
                f"(clipboard sha256 {_sha(pb)[:12]}, release sha256 {_sha(release_bytes)[:12]})")


# ---- receipts -------------------------------------------------------------------------------------
def receipts_path(env: dict[str, str]) -> Path:
    return state_dir(env) / "receipts.jsonl"


def write_receipt(env: dict[str, str], pkg: Path, session: str, clip_text: str, release_sha: str, kind: str) -> None:
    """Append an HMAC-signed receipt to guard state (not the article package). Raises StateError on failure."""
    import datetime
    rec = {"ts": datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z"),
           "session_id": session, "package": str(pkg.resolve()), "clipboard_sha256": _sha(clip_text),
           "release_sha256": release_sha, "kind": kind}
    try:
        line = json.dumps({"rec": rec, "sig": _sign(env, rec)}, sort_keys=True)
        path = receipts_path(env)
        path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        with state_lock(env), open(path, "a", encoding="utf-8") as fh:
            fh.write(line + "\n")
            fh.flush()
            os.fsync(fh.fileno())
    except StateError:
        raise
    except Exception as exc:  # noqa: BLE001
        raise StateError(f"cannot write receipt: {exc}") from exc


def has_full_receipt(env: dict[str, str], pkg: Path, session: str, release_sha: str) -> bool:
    """True only for a correctly signed full-paste receipt for this session, package and release hash.
    Unsigned, unparseable or tampered lines are ignored. Key problems raise StateError."""
    try:
        lines = receipts_path(env).read_text(encoding="utf-8").splitlines()
    except FileNotFoundError:
        return False
    except OSError as exc:
        raise StateError(f"cannot read receipts: {exc}") from exc
    pkg_s = str(pkg.resolve())
    for ln in lines:
        try:
            doc = json.loads(ln)
            r, sig = doc["rec"], doc["sig"]
        except (ValueError, KeyError, TypeError):
            continue
        if not isinstance(r, dict) or not _verify_sig(env, r, sig):
            continue
        if (r.get("session_id") == session and r.get("release_sha256") == release_sha
                and r.get("package") == pkg_s and r.get("kind") == "full"):
            return True
    return False


def _remember_typed(env: dict[str, str], session: str, text: str) -> None:
    _remember_url(env, (session or "_") + "#typed", text[:300])


def _last_typed(env: dict[str, str], session: str) -> str:
    return _load_state(env).get((session or "_") + "#typed", "")


# ---- policy once the release is valid -------------------------------------------------------------
NEW_STORY_URL = "https://medium.com/new-story"
DRAFT_URL_RE = re.compile(r"https://medium\.com/p/[0-9a-f]{6,}/edit")


def editor_urls(pkg: Path) -> set[str]:
    """Exact editor URLs a pre-receipt navigation may target: new-story, plus the package's recorded draft edit
    URL(s) from workflow.json (a string value shaped https://medium.com/p/<hex>/edit under a key mentioning
    draft or edit). Unreadable workflow.json just means only new-story."""
    urls = {NEW_STORY_URL}
    try:
        doc = json.loads((pkg / "workflow.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return urls

    def walk(o: Any, key: str = "") -> None:
        if isinstance(o, dict):
            for k, v in o.items():
                walk(v, str(k))
        elif isinstance(o, list):
            for v in o:
                walk(v, key)
        elif isinstance(o, str) and re.search(r"draft|edit", key, re.I) and DRAFT_URL_RE.fullmatch(o):
            urls.add(o)
    walk(doc)
    return urls


def _nav_urls(payload: dict[str, Any]) -> list[str]:
    args = payload.get("tool_input") if isinstance(payload.get("tool_input"), dict) else {}
    if str(payload.get("tool_name") or "") == "browser_navigate":
        return [str(args.get("url") or "")]
    text = "\n".join(_strings(args))
    return [m.group(1) for m in BROWSE_GOTO_RE.finditer(text)]


def pre_receipt_policy(payload: dict[str, Any], kind: str, pkg: Path, env: dict[str, str]) -> str:
    """Before a verified FULL paste of the active release hash exists in this session, allow only:
    (a) navigation to an exact Medium editor URL, plus Enter submitting that typed URL; cmd+a (keyboard-only
        focus/select, no clicks); the clipboard load of release bytes;
    (b) the bootstrap full paste (handled by the caller). Everything else is blocked, clicks included."""
    session = str(payload.get("session_id") or "")
    tool = str(payload.get("tool_name") or "")
    args = payload.get("tool_input") if isinstance(payload.get("tool_input"), dict) else {}
    allowed = editor_urls(pkg)
    if kind == "nav":
        urls = _nav_urls(payload)
        if urls and all(u in allowed for u in urls):
            return ""
        return f"navigation before a verified full paste may only target an exact editor URL ({sorted(allowed)})"
    if kind == "selectall":
        return ""
    if kind == "clipboard":  # loading the clipboard is not a browser mutation; the paste itself is byte-checked
        cmd = "\n".join(_strings(args))
        return "" if "release/medium-final" in cmd else "clipboard write must source release/medium-final.* of the active package"
    if kind == "type" and tool == "computer_use" and str(args.get("text") or "") in allowed:
        _remember_typed(env, session, str(args.get("text")))
        return ""
    if kind == "enter" and tool in {"computer_use", "browser_press"} and _last_typed(env, session) in allowed:
        _remember_typed(env, session, "")  # one Enter per typed URL
        return ""
    return (f"no verified full-paste receipt for the active release in this session: before it only editor "
            f"navigation, Enter on a typed editor URL, cmd+a and the full paste are allowed (got {kind or '?'}); "
            "no clicks, typing, other keys or fragment pastes")


def content_policy(payload: dict[str, Any], pkg: Path, env: dict[str, str],
                   clipboard: Callable[[dict[str, str]], tuple[Any, str | None, str]],
                   release_bytes: bytes | None = None, verified_sha: str | None = None) -> str:
    """Return a block reason or ''. Runs only after `release verify` passed, with the release bytes read once
    (by decide, under the lock) and matching verified_sha. Any error is a block reason."""
    try:
        return _content_policy(payload, pkg, env, clipboard, release_bytes, verified_sha)
    except Exception as exc:  # noqa: BLE001 - never allow from a handler
        return f"guard error during content policy ({type(exc).__name__}: {exc}); failing closed"


def _content_policy(payload: dict[str, Any], pkg: Path, env: dict[str, str],
                    clipboard: Callable[[dict[str, str]], tuple[Any, str | None, str]],
                    release_bytes: bytes | None, verified_sha: str | None) -> str:
    args = payload.get("tool_input") if isinstance(payload.get("tool_input"), dict) else {}
    session = str(payload.get("session_id") or "")
    if release_bytes is None:  # direct callers (tests); decide() always passes the once-read bytes
        release_bytes = (pkg / "release" / "medium-final.md").read_bytes()
    release_sha = _sha(release_bytes)
    if verified_sha is not None and release_sha != verified_sha:
        return "release bytes do not match the hash release verify vouched for (changed after verify)"
    release_text = release_bytes.decode("utf-8")
    kind = kind_of(payload)

    if kind == "deny":
        return "right-click is blocked: a context-menu Paste cannot be checked against the release bytes"
    receipt = has_full_receipt(env, pkg, session, release_sha)
    if kind == "paste":
        clip = clipboard(env)
        found, why = check_clipboard(clip, release_bytes)
        if not found:
            return f"paste blocked: {why}"
        if found != "full" and not receipt:
            return ("paste blocked: only the exact full release may be pasted before a verified full-paste "
                    "receipt exists in this session (fragment paste)")
        write_receipt(env, pkg, session, clip[0] if clip[0] is not None else b"", release_sha, found)
        return ""
    if not receipt:
        return pre_receipt_policy(payload, kind, pkg, env)
    if kind == "type":
        text = _norm(str(args.get("text") or ""))
        if len(text) >= FRAGMENT_MIN_CHARS and text not in _norm(release_text):
            return "typed text is not a substring of release/medium-final.md (only release bytes may be typed)"
        _remember_typed(env, session, str(args.get("text") or ""))
        return ""
    if kind == "clipboard":
        cmd = "\n".join(_strings(args))
        return "" if "release/medium-final" in cmd else "clipboard write must source release/medium-final.* of the active package"
    # nav, key, selectall, enter, click, set_value, drag, browser_*, browse CLI input ... : receipt exists
    return ""


# ---- fail-closed classification of "could this call mutate?" --------------------------------------
SHELL_TOOLS = {"terminal", "execute_code", "process", "bash", "shell"}
SHELL_HINT_RE = re.compile(
    BROWSE_BIN + r"|chrome|chromium|gstack|osascript|cliclick|cua-driver|peekaboo|playwright|puppeteer|patchright"
    r"|pbcopy|--remote-debugging|9222", re.I)


def could_mutate(payload: Any) -> bool:
    """Conservative, independent of classify(): True unless the call is clearly read-only. Used ONLY when the
    normal path errored, so a wrong True costs a blocked call and a wrong False would be a fail-open."""
    try:
        if not isinstance(payload, dict):
            return True
        tool = payload.get("tool_name")
        if not isinstance(tool, str) or not tool.strip():
            return True
        args = payload.get("tool_input")
        if tool == "computer_use":
            if not isinstance(args, dict):
                return True
            return str(args.get("action") or "").strip().lower() not in CU_READ_ACTIONS
        if tool in BROWSER_READ_TOOLS:
            return False
        if tool.startswith("browser_"):
            if tool == "browser_navigate":
                return not isinstance(args, dict) or _could_be_medium(str(args.get("url") or ""))
            return True
        text = "\n".join(_strings(args)).lower() if args is not None else ""
        if tool in SHELL_TOOLS:
            return (not isinstance(args, dict)) or "medium" in text or bool(SHELL_HINT_RE.search(text))
        if tool in BROWSER_READ_TOOLS:
            return False
        if tool in SAFE_NON_BROWSER_TOOLS:
            return "medium" in text or "medium" in json.dumps(payload, default=str).lower()
        return True  # any other tool name could drive a browser
    except Exception:  # noqa: BLE001
        return True


def fail_closed(payload: Any, exc: BaseException, where: str) -> "Decision":
    """The only handler body for guard errors: block unless the call is clearly read-only."""
    if could_mutate(payload):
        return Decision(False, f"medium_publish_guard error in {where} ({type(exc).__name__}: {exc}) on a call that "
                               "could mutate Medium; failing closed", True)
    return Decision(True)


# ---- entry ----------------------------------------------------------------------------------------
def decide(payload: dict[str, Any], env: dict[str, str] | None = None,
           verifier: Callable[[Path, dict[str, str]], tuple[int, str]] | None = None,
           clipboard: Callable[[dict[str, str]], tuple[str | None, str | None, str]] | None = None) -> Decision:
    try:
        env = dict(os.environ) if env is None else env
        verifier = verifier or run_verify
        clipboard = clipboard or read_clipboard
        mutation, why = classify(payload, env)
    except Exception as exc:  # noqa: BLE001
        return fail_closed(payload, exc, "classify")
    if not mutation:
        return Decision(True)
    ok_int, why_int = self_check(env)
    if not ok_int:
        return Decision(False, f"Medium mutation blocked ({why}): guard integrity check failed: {why_int}. "
                               "Reinstall with scripts/hermes/install_guard.sh and review who changed it.", True)
    try:
        sel, why_pkg = active_package(env)
        if sel is None:
            return _blocked(why, why_pkg)
        pkg, act_slug, act_sha = sel
        with release_lock(pkg):
            ok, reason, ver = authorize_mutation(pkg, env, verifier)
            if ok and ver is not None and act_slug != _package_slug(pkg):
                ok, reason = False, f"ACTIVE slug {act_slug!r} differs from the package slug {_package_slug(pkg)!r}"
            elif ok and ver is not None and act_sha != ver.sha:
                ok, reason = False, "ACTIVE content_sha256 differs from the hash release verify vouched for"
            if ok and ver is not None:
                # read the release ONCE, after verify, inside the lock; never re-read it afterwards
                rel_bytes = (pkg / "release" / "medium-final.md").read_bytes()
                extra = content_policy(payload, pkg, env, clipboard, rel_bytes, ver.sha)
                if not extra:
                    return Decision(True, mutation=True)
                reason = extra
    except Exception as exc:  # noqa: BLE001 - never allow from a handler
        reason = f"release authorization error ({type(exc).__name__}: {exc})"
    return _blocked(why, reason)


def _blocked(why: str, reason: str) -> Decision:
    return Decision(False, f"Medium mutation blocked ({why}): {reason}. Run `python -m scripts.fingerprint_eval.release "
                           f"authorize --package <dir>` and paste only release/medium-final.md.", True)


def log_decision(env: dict[str, str], payload: dict[str, Any], allow: bool, reason: str, note: str = "") -> None:
    """Append-only JSONL decision log (observability; never affects the decision, returns nothing)."""
    try:
        import datetime
        home = Path(env.get("HERMES_HOME") or Path.home() / ".hermes")
        path = Path(env.get("MEDIUM_GUARD_LOG") or home / "logs" / "medium-guard-decisions.jsonl")
        path.parent.mkdir(parents=True, exist_ok=True)
        args = payload.get("tool_input") if isinstance(payload.get("tool_input"), dict) else {}
        rec = {"ts": datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z"),
               "session_id": payload.get("session_id"), "tool": payload.get("tool_name"), "allow": allow,
               "reason": reason[:300], "note": note, "args_preview": json.dumps(args)[:160]}
        with open(path, "a", encoding="utf-8") as fh:
            fh.write(json.dumps(rec) + "\n")
    except Exception:  # noqa: BLE001
        pass


def _block(reason: str) -> int:
    try:
        sys.stdout.write(json.dumps({"action": "block", "message": reason}))
        sys.stderr.write(reason + "\n")
    except Exception:  # noqa: BLE001 - the exit code is the decision
        pass
    return BLOCK_EXIT


def main(stdin: Any = None, env: dict[str, str] | None = None,
         verifier: Callable[[Path, dict[str, str]], tuple[int, str]] | None = None,
         clipboard: Callable[[dict[str, str]], tuple[str | None, str | None, str]] | None = None) -> int:
    try:
        raw = (stdin or sys.stdin).read()
        payload = json.loads(raw)
        if not isinstance(payload, dict):
            raise ValueError("payload is not an object")
        if not isinstance(payload.get("tool_name"), str) or not payload["tool_name"].strip():
            raise ValueError("payload has no tool_name")
    except Exception as exc:  # noqa: BLE001 - unreadable/unknown payload: cannot prove it read-only
        return _block(f"medium_publish_guard: unparseable hook payload ({type(exc).__name__}: {exc}); failing closed")
    try:
        d = decide(payload, env, verifier, clipboard)
    except Exception as exc:  # noqa: BLE001
        d = fail_closed(payload, exc, "decide")
    try:
        eff = os.environ if env is None else env
        if (d.mutation or not d.allow) and (env is None or "MEDIUM_GUARD_LOG" in eff or "HERMES_HOME" in eff):
            log_decision(eff, payload, d.allow, d.reason, "mutation")
    except Exception:  # noqa: BLE001
        pass
    return 0 if d.allow else _block(d.reason)


if __name__ == "__main__":
    try:
        code = main()
    except BaseException as exc:  # noqa: BLE001 - last resort: never fall through to allow
        code = _block(f"medium_publish_guard: unexpected {type(exc).__name__}: {exc}; failing closed")
    sys.exit(code)
