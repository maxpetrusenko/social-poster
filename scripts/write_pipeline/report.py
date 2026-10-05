"""PACKAGE.md: the review report Max reads. Pure formatting of artifacts already in the package; invents nothing."""
from __future__ import annotations

import json

from . import mdlib as M
from .core import NAMES, Pipeline, sha_file


def _kv(d: dict, keys: tuple[str, ...]) -> list[str]:
    return [f"- {k}: {d.get(k)}" for k in keys if d.get(k) not in (None, "")]


def author_opportunities(pipe: Pipeline, review: dict | None) -> list[str]:
    out = []
    for o in pipe.read_json("angle").get("author_opportunities", []) or []:
        out.append(f"- {o.get('prompt')} (why: {o.get('why')})")
    air = (review or {}).get("author_input_required") or {}
    if air.get("required"):
        out.append(f"- Medium review asks for author input: {air.get('reason')}")
        for m in air.get("candidate_trusted_material") or []:
            out.append(f"  - material already supplied that could be used: {m}")
    for c in pipe.read_json("research").get("claims", []) or []:
        if c.get("status") == "unresolved":
            out.append(f"- Unresolved claim left out of the article, needs evidence or the author's own account: {c.get('claim')}")
    for f in pipe.read_json("critic").get("findings", []) or []:
        if f.get("severity") == "minor" and f.get("verified"):
            out.append(f"- Critic minor note, not auto-applied: {f.get('reason')} (passage: {str(f.get('passage'))[:100]!r})")
    return out or ["- None recorded. Real gaps would appear here; none were found, and nothing was invented to fill them."]


def build_package_md(pipe: Pipeline, review: dict, route: dict, final_sha: str) -> str:
    text = (pipe.pkg / "FINAL.md").read_text()
    t = pipe.read_json("title")
    imgs = pipe.read_json("images")
    src = pipe.read_json("source")
    ev = pipe.read_json("research")
    af = pipe.read_json("antifp", "report")
    integ = pipe.read_json("integrity")
    crit = pipe.read_json("critic")
    title, sub, _ = M.title_subtitle(text)
    L: list[str] = [f"# Review package: {title}", "", "Stopped for review. Nothing was published, scheduled or changed on Medium.", ""]
    L += ["## Final article", "", "- file: FINAL.md (rendered copy: FINAL.html)", f"- content sha256: {final_sha}", f"- words: {len(M.strip_code(text).split())}",
          "- state: ready for review (stage 18 STOP)", ""]
    L += ["## Title", "", f"- {title}", f"- rationale: {t.get('rationale')}", f"- candidates considered: {len(t.get('candidates', []))}"]
    L += [f"  - {c}" for c in t.get("candidates", [])] + [""]
    L += ["## Subtitle", "", f"- {sub} ({len(sub or '')} characters, limit 140)", ""]
    L += ["## Images", ""]
    if not imgs.get("images"):
        L += [f"- none: {imgs.get('waived_reason')}"]
    for im in imgs.get("images", []):
        L += [f"- {im['id']} at {im['path']} ({im.get('width')}x{im.get('height')}, sha256 {im.get('sha256', '')[:12]})"]
        L += [f"  - purpose: {im['purpose']}", f"  - placement: {im['placement']}", f"  - method: {im['method']}", f"  - provenance: {im['provenance']}",
              f"  - license: {im['license']}", f"  - caption: {im['caption']}", f"  - alt: {im['alt']}"]
    L += ["", "## Sources", ""]
    for s in src.get("sources", []):
        L += [f"- {s.get('id')} ({s.get('kind')}, {s.get('status')}): {s.get('url') or s.get('file') or s.get('blocker')}"]
    for c in ev.get("claims", []):
        urls = ", ".join(str(e.get("url") or e.get("source_id")) for e in c.get("evidence", []) or [])
        L += [f"- claim {c.get('id')} [{c.get('status')}]: {c.get('supported_wording') or c.get('claim')} ({urls})"]
    L += ["", "## Editorial scorecard", ""]
    sc = (review or {}).get("scorecard") or {}
    L += [f"- Medium review (bound to the final bytes): boost candidate {sc.get('boost_candidate')}, distribution risk {sc.get('general_distribution_risk')}, weakest dimension {sc.get('weakest_dimension')}",
          f"- independent critic: verdict {crit.get('verdict')} after {pipe.state.get('critic', {}).get('rounds')} round(s), {crit.get('majors')} major finding(s) open",
          f"- {(review or {}).get('disclaimer', '')}", ""]
    L += ["## Integrity", ""] + _kv(integ, ("final_sha256", "reference_sha256", "gate", "verified_content_sha256", "integrity_record_id"))
    L += ["- reference = the text after the author-voice pass, before any anti-fingerprint edit, with the same title, subtitle and images", ""]
    L += ["## Anti-fingerprint report", ""]
    L += [f"- policy: {af.get('policy')}", f"- composite before {af.get('baseline', {}).get('composite')}, after {af.get('after', {}).get('composite')}",
          f"- edits kept {af.get('kept')}, rejected {af.get('rejected')}"]
    for a in af.get("attempts", []):
        L += [f"  - attempt {a['n']} target {a['target']}: {'kept' if a['kept'] else 'rejected'}" + ("" if a["kept"] else f" ({'; '.join(a['reasons'])[:140]})")]
    L += [f"- remaining strongest signals: {[r['signal'] for r in af.get('remaining_signals', [])]}", ""]
    L += ["## Medium route", "", f"- recommendation: {route.get('route_code')} {route.get('route')} ({route.get('detail')}). Recommendation only, nothing was executed."]
    L += [f"  - {r}" for r in route.get("reasons", [])]
    for c in route.get("publication_candidates", []) or []:
        L += [f"  - candidate publication: {c.get('name')} {c.get('submission_url', '')}"]
    L += ["", "## Author opportunities", ""] + author_opportunities(pipe, review) + [""]
    L += ["## Provenance", "", f"- framework: {(pipe.state.get('framework') or {}).get('path')} sha256 {(pipe.state.get('framework') or {}).get('sha256')}"]
    L += [f"- {n}: {(pipe.rec(n) or {}).get('bundle_sha256')}" for n in NAMES if pipe.rec(n)]
    L += [f"- overrides: {json.dumps(pipe.state.get('overrides', []))}"]
    return "\n".join(L) + "\n"
