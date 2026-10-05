"""Local `claude -p` wrapper that keeps the stdout/stderr tail in the error (gateway.claude_cli drops stdout).

Subscription auth only: the child env comes from gateway.claude_env(). Rate-limit and session-limit messages map to
MODEL_UNAVAILABLE.
"""
from __future__ import annotations

import re
import subprocess

from scripts.fingerprint_eval.contracts import Category
from scripts.fingerprint_eval.gateway import GatewayError, claude_env

TAIL = 300
LIMIT_RE = re.compile(r"rate.?limit|usage limit|session limit|limit reached|hit your limit|too many requests|\b429\b|overloaded|quota", re.I)


def _tail(s: str | None, n: int = TAIL) -> str:
    s = (s or "").strip()
    return s[-n:]


def run_claude(prompt: str, model: str = "sonnet", timeout: int = 600) -> str:
    try:
        p = subprocess.run(["claude", "-p", "--model", model], input=prompt, capture_output=True, text=True,
                           timeout=timeout, env=claude_env())
    except subprocess.TimeoutExpired as e:
        raise GatewayError(f"claude -p timed out after {timeout}s; stdout tail: {_tail(_s(e.stdout))!r}; stderr tail: {_tail(_s(e.stderr))!r}",
                           Category.MODEL_TIMEOUT, "claude-cli") from None
    except OSError as e:
        raise GatewayError(f"claude -p could not run: {type(e).__name__}: {str(e)[:200]}", Category.DEPENDENCY_FAILURE, "claude-cli") from None
    out = p.stdout.strip()
    if LIMIT_RE.search(_tail(p.stdout, 600)) and (p.returncode != 0 or len(out) < 400):
        raise GatewayError(f"claude -p rate/session limit rc={p.returncode}; stdout tail: {_tail(p.stdout)!r}; stderr tail: {_tail(p.stderr)!r}",
                           Category.MODEL_UNAVAILABLE, "claude-cli")
    if p.returncode != 0:
        raise GatewayError(f"claude -p failed rc={p.returncode}; stdout tail: {_tail(p.stdout)!r}; stderr tail: {_tail(p.stderr)!r}",
                           Category.MODEL_UNAVAILABLE, "claude-cli")
    if not out:
        raise GatewayError(f"claude -p returned empty stdout; stderr tail: {_tail(p.stderr)!r}", Category.MODEL_UNAVAILABLE, "claude-cli")
    return out


def _s(x) -> str:
    return x.decode(errors="ignore") if isinstance(x, bytes) else (x or "")
