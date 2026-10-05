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

Hardening (see docs/hermes-medium-release.md, "Tamper resistance"): the guard fails closed (any error on a
mutation or possible mutation blocks, only clearly read-only calls pass on an error), runs from a pinned
copy under ~/.hermes/guards with a sha256 manifest it checks against itself, and keeps url memory and
paste receipts in ~/.hermes/guards/state signed with an HMAC key. Best effort against file-edit tampering
by the same OS user; NOT a defence against a determined same-user process (it can read the key).
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any, Callable
from urllib.parse import urlparse

REPO_ROOT = Path(__file__).resolve().parents[2]
VERIFY_TIMEOUT_S = 75  # hook timeout in config must be larger (docs use 90)
BLOCK_EXIT = 2

# ---- classification tables ------------------------------------------------------------------------
CU_READ_ACTIONS = {"capture", "list_apps", "list_windows", "wait", "scroll", "focus_app"}
CU_INPUT_ACTIONS = {"click", "double_click", "right_click", "middle_click", "drag", "type", "key", "set_value"}
BROWSER_APP_RE = re.compile(r"chrome|chromium|gstack|browser|safari|firefox|arc|brave|edge|medium", re.I)

BROWSER_NAV_TOOLS = {"browser_navigate"}
BROWSER_INPUT_TOOLS = {"browser_click", "browser_type", "browser_press", "browser_console", "browser_exec",
                       "browser_cdp", "browser_dialog"}
BROWSER_ALL_RE = re.compile(r"^browser_")

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


def guard_dir(env: dict[str, str]) -> Path:
    return Path(env.get("MEDIUM_GUARD_DIR") or Path.home() / ".hermes" / "guards")


def state_dir(env: dict[str, str]) -> Path:
    return Path(env.get("MEDIUM_GUARD_STATE_DIR") or guard_dir(env) / "state")


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


def _remember_url(env: dict[str, str], session: str, url: str) -> None:
    """Record last browser URL per session in signed state. Raises StateError on ANY failure."""
    try:
        p = state_dir(env) / "url-memory.json"
        p.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
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
        if action in CU_INPUT_ACTIONS or action not in CU_READ_ACTIONS:  # unknown action: treat as input
            if not app or BROWSER_APP_RE.search(app):
                return True, f"computer_use {action or '?'} on {app or 'frontmost window'}"
            return False, ""
        return False, ""

    if BROWSER_ALL_RE.match(tool):
        if tool in BROWSER_NAV_TOOLS:
            url = str(args.get("url") or "")
            _remember_nav(env, session, url)
            if _is_medium_write_url(url):
                return True, f"browser_navigate to Medium write page {url}"
            return False, ""
        if tool in BROWSER_INPUT_TOOLS and _on_medium(env, session):
            return True, f"{tool} while the session is on Medium"
        if tool in BROWSER_INPUT_TOOLS:
            for s in _strings(args):
                if MEDIUM_URL_RE.search(s):
                    return True, f"{tool} mentions a Medium URL"
        return False, ""

    if tool in {"terminal", "execute_code", "process", "bash", "shell"}:
        texts = [str(args.get(k) or "") for k in (*TERMINAL_KEYS, *CODE_KEYS)] or _strings(args)
        text = "\n".join(t for t in texts if t) or "\n".join(_strings(args))
        return _classify_command(text, env, session)

    # unknown tool: mutation only if it explicitly carries a Medium write URL
    for s in _strings(args):
        for m in MEDIUM_URL_RE.finditer(s):
            if _is_medium_write_url(m.group(0)):
                return True, f"{tool} carries Medium write URL"
    return False, ""


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
    return Path(env.get("MEDIUM_GUARD_WORKSPACE") or env.get("FINGERPRINT_EVAL_WORKSPACE")
                or _config(env).get("workspace") or REPO_ROOT / "data" / "article-workspace")


def repo_root(env: dict[str, str]) -> Path:
    return Path(env.get("MEDIUM_GUARD_REPO") or _config(env).get("repo") or REPO_ROOT)


def find_uv(env: dict[str, str]) -> str:
    for cand in (env.get("MEDIUM_GUARD_UV"), str(Path.home() / ".local" / "bin" / "uv"), "/opt/homebrew/bin/uv",
                 "/usr/local/bin/uv"):
        if cand and Path(cand).exists():
            return cand
    return "uv"


def active_package(env: dict[str, str]) -> tuple[Path | None, str]:
    ws = workspace(env)
    active = ws / "release" / "ACTIVE.json"
    try:
        data = json.loads(active.read_text())
    except FileNotFoundError:
        return None, f"no active release: {active} does not exist (run `release authorize`, then activate)"
    except (OSError, ValueError) as exc:
        return None, f"unreadable {active}: {exc}"
    ref = data.get("package") or data.get("package_dir") or data.get("slug") if isinstance(data, dict) else None
    if not isinstance(ref, str) or not ref.strip():
        return None, f"{active} names no package"
    p = Path(ref).expanduser()
    for cand in ([p] if p.is_absolute() else [ws / p, ws / "articles" / p, repo_root(env) / p]):
        if cand.is_dir():
            return cand, ""
    return None, f"{active} names package {ref!r} which is not a directory"


def run_verify(package: Path, env: dict[str, str]) -> tuple[int, str]:
    cmd = [find_uv(env), "run", "--python", "3.12", "python", "-m", "scripts.fingerprint_eval.release",
           "verify", "--package", str(package)]
    try:
        proc = subprocess.run(cmd, cwd=str(repo_root(env)), capture_output=True, text=True, timeout=VERIFY_TIMEOUT_S)
    except subprocess.TimeoutExpired:
        return 124, f"release verify timed out after {VERIFY_TIMEOUT_S}s"
    except OSError as exc:
        return 127, f"release verify could not start: {exc}"
    return proc.returncode, (proc.stderr or proc.stdout or "").strip()[-400:]


def authorize_mutation(env: dict[str, str], verifier: Callable[[Path, dict[str, str]], tuple[int, str]]
                       ) -> tuple[bool, str, Path | None]:
    try:
        pkg, why = active_package(env)
        if pkg is None:
            return False, why, None
        rc, out = verifier(pkg, env)
    except Exception as exc:  # noqa: BLE001 - never allow from a handler
        return False, f"release authorization error ({type(exc).__name__}: {exc})", None
    if rc == 0:
        return True, "", pkg
    return False, f"release verify failed for {pkg.name} (exit {rc}): {out or 'no output'}", None


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
            if {t.lower() for t in re.split(r"[+\s]+", keys) if t} & ENTER_KEYS:
                return "enter"
            return "key"
        return "click"
    if tool == "browser_navigate":
        return "nav"
    if tool == "browser_press":
        key = str(args.get("key") or "")
        return "paste" if is_paste_keys(key) else ("enter" if key.lower() in ENTER_KEYS else "key")
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
def read_clipboard(env: dict[str, str]) -> tuple[str | None, str | None, str]:
    """(plain_text, html_text_or_None, error). Rich flavor is best effort; plain failure => error."""
    try:
        p = subprocess.run(["pbpaste"], capture_output=True, timeout=5)
    except (OSError, subprocess.TimeoutExpired) as exc:
        return None, None, f"pbpaste failed: {exc}"
    if p.returncode != 0:
        return None, None, f"pbpaste exited {p.returncode}"
    plain = p.stdout.decode("utf-8", errors="replace")
    html = None
    try:
        o = subprocess.run(["osascript", "-e", "the clipboard as «class HTML»"], capture_output=True,
                           timeout=5, text=True)
        m = re.search(r"«data HTML([0-9A-Fa-f]+)»", o.stdout or "")
        if o.returncode == 0 and m:
            raw = bytes.fromhex(m.group(1)).decode("utf-8", errors="replace")
            html = re.sub(r"<[^>]+>", " ", raw)
    except (OSError, subprocess.TimeoutExpired, ValueError):
        html = None
    return plain, html, ""


def check_clipboard(clip: tuple[str | None, str | None, str], release_text: str) -> tuple[str, str]:
    """Return (kind, reason). kind is 'full', 'fragment' or '' (block, reason set)."""
    plain, html, err = clip
    if plain is None:
        return "", f"cannot read the clipboard ({err}); failing closed"
    if not plain.strip():
        return "", "clipboard is empty"
    if html is not None and _loose(html) and _loose(html) not in _loose(plain) and _loose(plain) not in _loose(html):
        return "", "clipboard rich (HTML) flavor differs from its plain-text flavor"
    if plain.rstrip() == release_text.rstrip():
        return "full", ""
    n = _norm(plain)
    if len(n) >= FRAGMENT_MIN_CHARS and n in _norm(release_text):
        return "fragment", ""
    return "", ("clipboard is neither the exact release text nor a >=40 char substring of it "
                f"(clipboard sha256 {_sha(plain)[:12]})")


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
        with open(path, "a", encoding="utf-8") as fh:
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
def content_policy(payload: dict[str, Any], pkg: Path, env: dict[str, str],
                   clipboard: Callable[[dict[str, str]], tuple[str | None, str | None, str]]) -> str:
    """Return a block reason or ''. Runs only after `release verify` passed. Any error is a block reason."""
    try:
        return _content_policy(payload, pkg, env, clipboard)
    except Exception as exc:  # noqa: BLE001 - never allow from a handler
        return f"guard error during content policy ({type(exc).__name__}: {exc}); failing closed"


def _content_policy(payload: dict[str, Any], pkg: Path, env: dict[str, str],
                    clipboard: Callable[[dict[str, str]], tuple[str | None, str | None, str]]) -> str:
    args = payload.get("tool_input") if isinstance(payload.get("tool_input"), dict) else {}
    session = str(payload.get("session_id") or "")
    rel = pkg / "release" / "medium-final.md"
    try:
        release_bytes = rel.read_bytes()
        release_text = release_bytes.decode("utf-8")
    except (OSError, UnicodeDecodeError) as exc:
        return f"cannot read {rel}: {exc}"
    release_sha = _sha(release_bytes)
    kind = kind_of(payload)

    if kind == "deny":
        return "right-click is blocked: a context-menu Paste cannot be checked against the release bytes"
    if kind == "paste":
        clip = clipboard(env)
        found, why = check_clipboard(clip, release_text)
        if not found:
            return f"paste blocked: {why}"
        write_receipt(env, pkg, session, clip[0] or "", release_sha, found)
        return ""
    if kind == "type":
        text = _norm(str(args.get("text") or ""))
        if len(text) >= FRAGMENT_MIN_CHARS and text not in _norm(release_text):
            return "typed text is not a substring of release/medium-final.md (only release bytes may be typed)"
        _remember_typed(env, session, str(args.get("text") or ""))
        return ""
    if kind == "clipboard":
        cmd = "\n".join(_strings(args))
        return "" if "release/medium-final" in cmd else "clipboard write must source release/medium-final.* of the active package"
    if kind in {"nav", "key"}:
        return ""
    if kind == "enter":
        if has_full_receipt(env, pkg, session, release_sha) or URL_ONLY_RE.match(_last_typed(env, session)):
            return ""
        return "Enter/Space before a verified paste in this session (only allowed to submit a typed URL)"
    # click, set_value, drag, browser_click/console/exec/cdp, browse CLI input ...
    if has_full_receipt(env, pkg, session, release_sha):
        return ""
    return ("no verified paste receipt for the active release in this session: paste release/medium-final.md "
            "(clipboard must equal it) before any click")


# ---- fail-closed classification of "could this call mutate?" --------------------------------------
BROWSER_READ_TOOLS = {"browser_snapshot", "browser_vision", "browser_get_images", "browser_screenshot",
                      "browser_scroll"}
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
        if tool.startswith("browser_"):
            if tool in BROWSER_READ_TOOLS:
                return False
            if tool == "browser_navigate":
                return not isinstance(args, dict) or _could_be_medium(str(args.get("url") or ""))
            return True
        text = "\n".join(_strings(args)).lower() if args is not None else ""
        if tool in SHELL_TOOLS:
            return (not isinstance(args, dict)) or "medium" in text or bool(SHELL_HINT_RE.search(text))
        return "medium" in text or "medium" in json.dumps(payload, default=str).lower()
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
    ok, reason, pkg = authorize_mutation(env, verifier)
    if ok and pkg is not None:
        extra = content_policy(payload, pkg, env, clipboard)
        if not extra:
            return Decision(True, mutation=True)
        ok, reason = False, extra
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
