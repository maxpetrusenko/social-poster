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
"""
from __future__ import annotations

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


def state_path(env: dict[str, str]) -> Path:
    return Path(env.get("MEDIUM_GUARD_STATE") or Path.home() / ".hermes" / "cache" / "medium-guard-state.json")


def _load_state(env: dict[str, str]) -> dict[str, str]:
    try:
        data = json.loads(state_path(env).read_text())
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def _remember_url(env: dict[str, str], session: str, url: str) -> None:
    """Best-effort: last browser URL host per session. Failure never changes a decision for this call."""
    try:
        p = state_path(env)
        p.parent.mkdir(parents=True, exist_ok=True)
        state = _load_state(env)
        if len(state) > 200:
            state = dict(list(state.items())[-100:])
        state[session or "_"] = url
        fd, tmp = tempfile.mkstemp(dir=str(p.parent), prefix=".mg-")
        with os.fdopen(fd, "w") as fh:
            json.dump(state, fh)
        os.replace(tmp, p)
    except OSError:
        pass


def _on_medium(env: dict[str, str], session: str) -> bool:
    return _is_medium_url(_load_state(env).get(session or "_", ""))


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
            _remember_url(env, session, url)
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
        _remember_url(env, session, g.group(1))
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
    return Path(env.get("MEDIUM_GUARD_WORKSPACE") or REPO_ROOT / "data" / "article-workspace")


def repo_root(env: dict[str, str]) -> Path:
    return Path(env.get("MEDIUM_GUARD_REPO") or REPO_ROOT)


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
    pkg, why = active_package(env)
    if pkg is None:
        return False, why, None
    rc, out = verifier(pkg, env)
    if rc == 0:
        return True, "", pkg
    return False, f"release verify failed for {pkg.name} (exit {rc}): {out or 'no output'}", None


TYPE_FREE_CHARS = 40  # short typed strings (dates, times, topics) need no containment


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()


def content_check(payload: dict[str, Any], pkg: Path) -> str:
    """Extra byte-level checks once the release is valid. Returns a reason when the call must be blocked.

    * computer_use type: long text must be a substring of release/medium-final.md (whitespace-normalised).
    * terminal pbcopy / clipboard writes: the command must read from the package release/ file.
    """
    tool = str(payload.get("tool_name") or "")
    args = payload.get("tool_input") if isinstance(payload.get("tool_input"), dict) else {}
    rel = pkg / "release" / "medium-final.md"
    if tool == "computer_use" and str(args.get("action") or "").lower() == "type":
        text = _norm(str(args.get("text") or ""))
        if len(text) > TYPE_FREE_CHARS:
            try:
                body = _norm(rel.read_text(encoding="utf-8"))
            except OSError as exc:
                return f"cannot read {rel}: {exc}"
            if text not in body:
                return "typed text is not a substring of release/medium-final.md (only release bytes may be typed)"
        return ""
    if tool in {"terminal", "execute_code"}:
        cmd = "\n".join(_strings(args))
        if re.search(r"\b(pbcopy|set the clipboard|NSPasteboard|xclip|wl-copy)\b", cmd) and "release/medium-final" not in cmd:
            return "clipboard write must source release/medium-final.* of the active package"
    return ""


# ---- entry ----------------------------------------------------------------------------------------
def decide(payload: dict[str, Any], env: dict[str, str] | None = None,
           verifier: Callable[[Path, dict[str, str]], tuple[int, str]] | None = None) -> Decision:
    env = dict(os.environ) if env is None else env
    verifier = verifier or run_verify
    mutation, why = classify(payload, env)
    if not mutation:
        return Decision(True)
    ok, reason, pkg = authorize_mutation(env, verifier)
    if ok and pkg is not None:
        extra = content_check(payload, pkg)
        if not extra:
            return Decision(True, mutation=True)
        ok, reason = False, extra
    return Decision(False, f"Medium mutation blocked ({why}): {reason}. Run `python -m scripts.fingerprint_eval.release "
                            f"authorize --package <dir>` and paste only release/medium-final.md.", True)


def _block(reason: str) -> int:
    sys.stdout.write(json.dumps({"action": "block", "message": reason}))
    sys.stderr.write(reason + "\n")
    return BLOCK_EXIT


def main(stdin: Any = None, env: dict[str, str] | None = None,
         verifier: Callable[[Path, dict[str, str]], tuple[int, str]] | None = None) -> int:
    raw = (stdin or sys.stdin).read()
    try:
        payload = json.loads(raw)
        if not isinstance(payload, dict):
            raise ValueError("payload is not an object")
    except ValueError as exc:
        return _block(f"medium_publish_guard: unparseable hook payload ({exc}); failing closed")
    try:
        d = decide(payload, env, verifier)
    except Exception as exc:  # noqa: BLE001 - guard must never crash open
        crude = (str(payload.get("tool_name")) == "computer_use" or "medium.com" in raw.lower()
                 or str(payload.get("tool_name", "")).startswith("browser_"))
        if crude:
            return _block(f"medium_publish_guard crashed on a mutation-like call ({type(exc).__name__}: {exc}); failing closed")
        return 0
    return 0 if d.allow else _block(d.reason)


if __name__ == "__main__":
    sys.exit(main())
