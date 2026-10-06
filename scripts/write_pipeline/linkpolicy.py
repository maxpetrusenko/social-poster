"""Link-preservation policy shared by every stage gate (editorial, voice, repair, fpverify) and the final integrity gate.

1. A link is its normalized URL. Changing only the anchor text, same URL, is not a lost link (the claims gate still judges the sentence).
2. A URL may disappear only if (a) the reference sentence(s) carrying it are declared in `removals`, (b) the claims gate confirms those
   claims are gone and not paraphrased elsewhere (`removed_claims_gone`, a model step run by the stage), (c) no remaining sentence asserts a
   research-ledger claim that cites that URL, (d) at least one source link remains.
3. Everything else is a hard fail: an undeclared loss, a changed URL, a URL removed while a remaining claim depends on it.
The final integrity gate calls the same check with the removals read from the signed removals ledger (`signed_removals`).
"""
from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

from scripts.fingerprint_eval import record as R
from scripts.fingerprint_eval.refs import find_refs, link_url
from scripts.fingerprint_eval.textutil import split_sentences

from . import mdlib as M

MATCH_MIN = 0.5  # share of a ledger claim's content tokens a remaining sentence must contain to count as still asserting it


def urls(md: str) -> list[str]:
    """Normalized http(s) URL of every link in `md`, in order (code excluded)."""
    out = []
    for item in find_refs(md)["links"]:
        u = link_url(item)
        if u.startswith(("http://", "https://", "www.")):
            out.append(u)
    return out


def _key(s: str) -> str:
    from .cuts import _key as k
    return k(s)


def declared_url_counts(ref: str, removals) -> tuple[Counter, list[str]]:
    """(URLs carried by the reference sentences the removals declare, the declared sentence keys). A declaration counts only when it matches a reference sentence exactly."""
    want = {_key(str(r.get("text", ""))) for r in (removals or []) if isinstance(r, dict) and _key(str(r.get("text", "")))}
    c: Counter = Counter()
    hit: list[str] = []
    for b in M.blocks(ref):
        if b.kind != "paragraph":
            continue
        for s in split_sentences(b.text):
            if _key(s) in want:
                hit.append(_key(s))
                c.update(urls(s))
    return c, hit


def _tokens(s: str) -> set[str]:
    from scripts.fingerprint_eval import added as AD
    return AD._content_tokens(s)


def dependents(url: str, cand: str, ev: dict) -> list[str]:
    """Ledger claims that cite `url` and are still asserted by a sentence of `cand`."""
    sents = [x for b in M.blocks(cand) if b.kind == "paragraph" for x in split_sentences(b.text)]
    stoks = [_tokens(x) for x in sents]
    out = []
    for c in (ev or {}).get("claims", []):
        if not isinstance(c, dict) or c.get("status") == "unresolved":
            continue
        if url not in {link_url(str(e.get("url"))) for e in (c.get("evidence") or []) if isinstance(e, dict) and e.get("url")}:
            continue
        for text in (c.get("supported_wording"), c.get("claim")):
            ct = _tokens(str(text or ""))
            if ct and any(len(ct & st) / len(ct) >= MATCH_MIN for st in stoks):
                out.append(str(c.get("id") or text)[:80])
                break
    return out


def check_links(ref: str, cand: str, removals, ev: dict | None) -> dict:
    """Deterministic half of the policy. {"ok", "reasons", "categories", "removed_urls", "removed_sentences"}. removed_* feed the claims-gone check."""
    lost = Counter(urls(ref)) - Counter(urls(cand))
    reasons: list[str] = []
    if not lost:
        return {"ok": True, "reasons": [], "categories": [], "removed_urls": [], "removed_sentences": []}
    decl, keys = declared_url_counts(ref, removals)
    undeclared = lost - decl
    if undeclared:
        reasons.append(f"link removed without a declared removal (or its URL changed): {sorted(undeclared)[:3]}; "
                       "declare the whole sentence that carries it in removals, or keep the same URL")
    removed = sorted(lost - undeclared)
    for u in removed:
        if ev is None:
            reasons.append(f"removing link {u} needs the research ledger to prove no remaining claim depends on it")
            continue
        dep = dependents(u, cand, ev)
        if dep:
            reasons.append(f"link {u} cannot be removed: a remaining claim cites it in the research ledger ({dep[:2]})")
    if removed and not urls(cand):
        reasons.append("no source link would remain in the article")
    return {"ok": not reasons, "reasons": reasons, "categories": ["MISSING_LINK"] if reasons else [], "removed_urls": removed,
            "removed_sentences": keys if removed else []}


def removed_claims_gone(runner, pipe_pkg: Path, cand: str, sentences: list[str], claims_gate, work: Path) -> dict:
    """(b): the claims gate, asked about the removed sentences alone against the candidate, must find them MISSING. PASS = still asserted
    somewhere (paraphrased elsewhere). state ok | still_asserted | inconclusive | error."""
    from scripts.fingerprint_eval.rewrite import MIN_SEGMENT_WORDS
    from scripts.fingerprint_eval.textutil import words
    from .core import atomic_write
    para = " ".join(s if s.endswith((".", "!", "?")) else s + "." for s in sentences)
    if len(words(para)) < MIN_SEGMENT_WORDS:
        para = "The following claims were cut from the article and must not be asserted in any wording. " + para
    ref_doc = "# Removed claims\n\n## Claims the article no longer makes\n\n" + para + "\n"
    atomic_write(work / "candidate" / "article.md", cand.encode())
    atomic_write(work / "reference" / "reference.md", ref_doc.encode())
    gate = claims_gate(runner, work / "candidate" / "article.md", work / "reference" / "reference.md", work / "gate", pipe_pkg)
    if gate["state"] == "ERROR":
        return {"state": "error", "reasons": gate["reasons"]}
    if gate["state"] == "PASS":
        return {"state": "still_asserted", "reasons": ["the claims gate finds a removed claim still asserted in the text (paraphrased elsewhere)"]}
    cats = set(gate.get("categories") or [])
    if not cats or cats - {"CONTENT_CLAIM_FAILURE", "ADDED_UNSUPPORTED_CLAIM"}:
        return {"state": "inconclusive", "reasons": ["the removed-claims check was inconclusive (gate failed for a non-claims reason: " + ", ".join(sorted(cats) or ["unknown"]) + ")"]}
    return {"state": "ok", "reasons": []}


def signed_removals(pkg: Path, state_ledger: list | None) -> tuple[list[dict], list[str]]:
    """Removals for the final integrity gate, read from the signed ledger file only. (removals, errors): a missing, unsigned, forged or
    state-mismatched ledger yields errors and no removals, so a forged list can never widen what may disappear."""
    from .cuts import LEDGER_REL
    want = {e.get("sentence") for e in (state_ledger or []) if isinstance(e, dict)}
    p = pkg / LEDGER_REL
    if not p.exists():
        return [], ([f"the signed removals ledger {LEDGER_REL} is missing but removals were declared"] if want else [])
    try:
        d = json.loads(p.read_text())
        R.check_signature(d, "removals ledger")
    except (OSError, ValueError, R.RecordError) as e:
        return [], [f"removals ledger rejected: {str(e)[:160]}"]
    ents = [e for e in d.get("entries", []) if isinstance(e, dict) and isinstance(e.get("sentence"), str)]
    if {e["sentence"] for e in ents} != want:
        return [], ["removals ledger does not match the signed pipeline state (forged or stale ledger)"]
    return [{"text": e["sentence"], "reason": e.get("reason", "")} for e in ents], []
