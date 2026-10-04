"""Fetch, cache and version Medium's Distribution Guidelines (the policy source of truth).

Cache: data/medium-policy/<YYYY-MM-DD>-<sha12>.md + .json, plus CURRENT.json pointing at the live one.
Re-fetch at most once a day. A failed fetch falls back to the cache and records that; the network being
down never fails a review while any cache exists.
"""
from __future__ import annotations

import hashlib
import html
import json
import re
import shutil
import subprocess
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from html.parser import HTMLParser
from pathlib import Path

POLICY_URL = ("https://help.medium.com/hc/en-us/articles/360006362473-Medium-s-Distribution-Guidelines-"
              "How-curators-review-stories-for-Boost-General-and-Network-Distribution")
API_URL = "https://help.medium.com/api/v2/help_center/en-us/articles/360006362473.json"
REPO = Path(__file__).resolve().parents[2]
POLICY_DIR_REL = Path("data/medium-policy")
REFETCH_AFTER = timedelta(hours=24)
MIN_POLICY_CHARS = 3000
UA = "Mozilla/5.0 (compatible; medium-review/1.0)"


class PolicyError(Exception):
    pass


class _Text(HTMLParser):
    BLOCK = {"p", "div", "br", "ul", "ol", "tr"}

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.out: list[str] = []
        self.skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "nav", "header", "footer"):
            self.skip += 1
        elif re.fullmatch(r"h[1-6]", tag):
            self.out.append("\n\n" + "#" * int(tag[1]) + " ")
        elif tag == "li":
            self.out.append("\n- ")
        elif tag in self.BLOCK:
            self.out.append("\n\n" if tag in ("p", "div") else "\n")

    def handle_endtag(self, tag):
        if tag in ("script", "style", "nav", "header", "footer"):
            self.skip = max(0, self.skip - 1)

    def handle_data(self, data):
        if not self.skip:
            self.out.append(data)


def html_to_text(src: str) -> str:
    p = _Text()
    p.feed(src)
    text = html.unescape("".join(p.out)).replace("\xa0", " ")
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r"(?m)^-\n+\s*(?=\S)", "- ", text)  # list bullets split from their text
    start = text.find("Updated:")
    if 0 < start < 1500:  # drop the help-center page chrome above the article
        text = text[start:]
    text = re.sub(r"(?s)(?:\s*-)*\s*Return to top\s*$", "", text)
    return text.strip() + "\n"


def _http(url: str, timeout: int = 25) -> str:
    def mk():  # a Request is mutated by proxy handlers, so the retry needs a fresh one
        return urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html,application/json"})
    req = mk()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.read().decode("utf-8", errors="replace")
    except urllib.error.URLError:
        # a broken HTTP(S)_PROXY env (e.g. 407 from a local broker) must not mask a reachable public host
        import os
        import ssl
        sysca = "/etc/ssl/cert.pem"  # macOS python builds often lack a CA bundle
        ctx = ssl.create_default_context(cafile=sysca if os.path.exists(sysca) else None)
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), urllib.request.HTTPSHandler(context=ctx))
        with opener.open(mk(), timeout=timeout) as r:
            return r.read().decode("utf-8", errors="replace")


def _plausible(text: str) -> bool:
    low = text.lower()
    return len(text) >= MIN_POLICY_CHARS and "boost" in low and "distribution" in low


def _from_page() -> tuple[str, str | None]:
    return html_to_text(_http(POLICY_URL)), None


def _from_browse_sh() -> tuple[str, str | None]:
    exe = shutil.which("browse.sh")
    if not exe:
        raise PolicyError("browse.sh not installed")
    p = subprocess.run([exe, "get", POLICY_URL], capture_output=True, text=True, timeout=120)
    if p.returncode != 0:
        raise PolicyError(f"browse.sh rc={p.returncode}")
    out = p.stdout
    return (html_to_text(out) if "<p" in out else out.strip() + "\n"), None


def _from_api() -> tuple[str, str | None]:
    art = json.loads(_http(API_URL))["article"]
    return html_to_text(art["body"]), art.get("updated_at")


def _api_updated_at() -> str | None:
    try:
        return json.loads(_http(API_URL, 15))["article"].get("updated_at")
    except Exception:  # noqa: BLE001 - metadata only
        return None


METHODS = (("page", _from_page), ("browse.sh", _from_browse_sh), ("zendesk-api", _from_api))


def fetch_policy(methods=METHODS) -> dict:
    """Try each method in order; first plausible text wins. Raises PolicyError listing every failure."""
    errors: list[str] = []
    for name, fn in methods:
        try:
            text, updated = fn()
            if not _plausible(text):
                raise PolicyError("text not plausible (bot wall or empty)")
            return {"text": text, "method": name, "updated_at": updated or _api_updated_at()}
        except Exception as e:  # noqa: BLE001
            errors.append(f"{name}: {type(e).__name__}: {str(e)[:120]}")
    raise PolicyError("; ".join(errors))


def policy_version(sha256: str, updated_at: str | None) -> str:
    return f"{sha256[:12]}@{updated_at or 'unknown'}"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _load_current(pdir: Path) -> dict | None:
    try:
        meta = json.loads((pdir / "CURRENT.json").read_text())
        meta["text"] = (pdir / meta["file"]).read_text()
        if hashlib.sha256(meta["text"].encode()).hexdigest() != meta["sha256"]:
            return None
        return meta
    except (OSError, ValueError, KeyError):
        return None


def load_policy(root: Path = REPO, now: datetime | None = None, fetch=fetch_policy, force: bool = False) -> dict:
    """Return {text, sha256, sha12, updated_at, policy_version, fetched_at, method, fetch_status, ...}.

    fetch_status: fresh-fetch | cache-fresh (<24h) | cache-fallback (fetch failed; fetch_error recorded).
    """
    now = now or _now()
    pdir = root / POLICY_DIR_REL
    pdir.mkdir(parents=True, exist_ok=True)
    cached = _load_current(pdir)
    if cached and not force:
        try:
            age = now - datetime.fromisoformat(cached["fetched_at"])
        except (KeyError, ValueError):
            age = REFETCH_AFTER
        if age < REFETCH_AFTER:
            return {**cached, "fetch_status": "cache-fresh"}
    try:
        got = fetch()
    except PolicyError as e:
        if cached:
            return {**cached, "fetch_status": "cache-fallback", "fetch_error": str(e)[:500]}
        raise PolicyError(f"policy fetch failed and no cache exists: {e}") from None
    text = got["text"]
    sha = hashlib.sha256(text.encode()).hexdigest()
    meta = {"url": POLICY_URL, "fetched_at": now.isoformat(), "sha256": sha, "sha12": sha[:12],
            "updated_at": got.get("updated_at"), "method": got["method"],
            "policy_version": policy_version(sha, got.get("updated_at"))}
    stem = f"{now.date().isoformat()}-{sha[:12]}"
    (pdir / f"{stem}.md").write_text(text)
    (pdir / f"{stem}.json").write_text(json.dumps(meta, indent=2) + "\n")
    (pdir / "CURRENT.json").write_text(json.dumps({**meta, "file": f"{stem}.md"}, indent=2) + "\n")
    return {**meta, "file": f"{stem}.md", "text": text, "fetch_status": "fresh-fetch"}
