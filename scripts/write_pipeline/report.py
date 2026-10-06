"""PACKAGE.md: the review report Max reads, for READY and for NOT_READY runs. Formatting of artifacts already in the package plus
deterministic checks recomputed from the files; it invents nothing. Section order is fixed (SECTIONS)."""
from __future__ import annotations

import json
from collections import Counter

from scripts.fingerprint_eval.guards import structure_preservation

from . import furniture as FU
from . import mdlib as M
from . import relevance as RV
from .core import NAMES, Pipeline, PipelineError
from .validators import asserted_unresolved


def _direct_author_voice(pipe: Pipeline, text: str) -> dict | None:
    """Author-corpus distance of the draft (before) and the current text (after) straight from the metrics module, for runs where fpverify never ran."""
    try:
        from . import authorprofile as PF
        draft = pipe.read_art("draft") or ""
        if not draft.strip() or not text.strip():
            return None
        prof = PF.get_profile()
        b, f = PF.measure(draft, prof["centroid"], prof["fw"]), PF.measure(text, prof["centroid"], prof["fw"])
        keys = ("sentence_length_jsd", "paragraph_length_jsd", "punctuation_jsd", "function_word_cosine")
        return {"baseline_distance": b["distance"].get("composite"), "final_distance": f["distance"].get("composite"),
                "components": {k: [b["distance"].get(k), f["distance"].get(k)] for k in keys}}
    except Exception:  # noqa: BLE001  report formatting must never fail the package
        return None

SECTIONS = ["TITLE", "SUBTITLE", "ARTICLE", "SOURCES", "IMAGES", "FURNITURE", "EDITORIAL SCORECARD", "AUTHOR-VOICE RESULT", "FINGERPRINT BASELINE", "FINGERPRINT FINAL",
            "FINGERPRINT CHANGES", "REMAINING FINGERPRINT SIGNALS", "CLAIM CHECK", "LINK CHECK", "SOURCE CHECK", "STRUCTURE CHECK", "SEMANTIC PRESERVATION",
            "MEDIUM REVIEW", "EXACT FINAL HASH", "READY/NOT_READY"]
HEADINGS = {"IMAGES": "IMAGES (provenance, captions, ALT)", "AUTHOR-VOICE RESULT": "AUTHOR-VOICE RESULT (metric)"}


def _signal_lines(sig: list[dict]) -> list[str]:
    return [f"- {r['signal']}: {r['value']}" + (f" (outside the author band {r['band']['p10']} to {r['band']['p90']}, severity {r['severity']})" if r["significant"] else " (within the author band)")
            for r in sig]


def key_terms(pipe: Pipeline, text: str) -> set[str]:
    title, sub, _ = M.title_subtitle(text)
    return RV.key_terms(title or pipe.read_json("title").get("pick"), sub or pipe.read_json("title").get("subtitle"), text, pipe.read_json("research").get("claims") or [])


def author_opportunities(pipe: Pipeline, review: dict | None, text: str) -> list[str]:
    """Author-input suggestions, each kept only if topically relevant to the article's key entities."""
    key = key_terms(pipe, text)
    raw: list[str] = [f"{o.get('prompt')} (why: {o.get('why')})" for o in pipe.read_json("angle").get("author_opportunities", []) or [] if isinstance(o, dict)]
    air = (review or {}).get("author_input_required") or {}
    if air.get("required") and air.get("reason"):
        raw.append(f"Medium review asks for author input: {air.get('reason')}")
    raw += [f"material already supplied that could be used: {m}" for m in (air.get("candidate_trusted_material") or []) if air.get("required")]
    kept, dropped = RV.filter_suggestions(raw, key)
    out = [f"- {x}" for x in kept]
    try:
        opp = FU.author_opportunity(FU.from_title(pipe.read_json("title"))) if pipe.read_json("title") else None
    except Exception:  # noqa: BLE001
        opp = None
    if opp:
        out.append(f"- {opp}")
    for c in pipe.read_json("research").get("claims", []) or []:
        if c.get("status") == "unresolved":
            out.append(f"- Unresolved claim left out of the article, needs evidence or the author's own account: {c.get('claim')}")
    for f in pipe.read_json("critic").get("findings", []) or []:
        if f.get("severity") == "minor" and f.get("verified"):
            out.append(f"- Critic minor note, not auto-applied: {f.get('reason')} (passage: {str(f.get('passage'))[:100]!r})")
    if dropped:
        out.append(f"- {dropped} generic or off-topic author-input suggestion(s) omitted (too little overlap with the article's key terms)")
    return out or ["- None recorded."]


def _antifp_sections(pipe: Pipeline, S: dict, text: str, af: dict) -> None:
    """Without fpverify, the fingerprint sections come from what exists: the antifp loop baseline and the text of this package, measured now."""
    from . import antifp as AF
    from . import fpcaps as FC
    try:
        loop = json.loads((pipe.pkg / AF.DIR_REL / "loop.json").read_text())
    except (OSError, ValueError):
        loop = {}
    base = loop.get("baseline") or af.get("baseline")
    if not text.strip():
        return
    sig = AF.signals(text)
    viol = FC.violations(sig, FC.caps())
    if base:
        S["FINGERPRINT BASELINE"] = [f"- antifp baseline (the voice-stage text): composite {base.get('composite')}, " + ", ".join(f"{k} {round(v, 3)}" for k, v in (base.get("values") or {}).items())]
    S["FINGERPRINT FINAL"] = [f"- the text of this package, measured now: composite {sig['composite']}, " + ", ".join(f"{k} {round(v, 3)}" for k, v in sig["values"].items()),
                              f"- heavy at template hits >= {AF.HEAVY_TEMPLATE_HITS} or composite >= {AF.HEAVY_COMPOSITE}"]
    atts = loop.get("attempts") or af.get("attempts") or []
    S["FINGERPRINT CHANGES"] = [f"- antifp attempts {len(atts)}, kept {sum(1 for a in atts if a.get('kept'))}"] + [
        f"  - attempt {a['n']} target {a['target']}: {'kept' if a['kept'] else 'rejected'}" + ("" if a["kept"] else f" ({'; '.join(a.get('reasons') or [])[:160]})") for a in atts]
    rem = AF.ranking(sig)
    S["REMAINING FINGERPRINT SIGNALS"] = [f"- {r['signal']} {r['value']} (contribution {r['contribution']})" for r in rem] or ["- none"]
    for r in rem:
        for w in r.get("where", []):
            S["REMAINING FINGERPRINT SIGNALS"] += [f"  - template {w['template']}: {e!r}" for e in w["examples"]]
    S["REMAINING FINGERPRINT SIGNALS"] += [f"- over the generation cap: {v['signal']} {v['value']} > {v['cap']}" for v in viol]
    for st in ("draft", "editorial", "voice"):
        d = (pipe.rec(st) or {}).get("fingerprint_debt")
        if d:
            S["REMAINING FINGERPRINT SIGNALS"].append(f"- fingerprint debt accepted at {st}: " + ", ".join(f"{v['signal']} {v['value']} > {v['cap']}" for v in d.get("violations", [])))


def checks(pipe: Pipeline, text: str) -> dict:
    """Deterministic claim, link, source, structure and semantic checks of `text` against the recorded reference. Never raises."""
    from . import runs as RN
    from .submit import deps_ctx
    out: dict = {"claim": [], "link": [], "source": [], "structure": [], "semantic": []}
    try:
        c = deps_ctx(pipe)
    except (PipelineError, OSError, ValueError) as e:
        out["source"].append(f"- FAIL: source files could not be re-read: {str(e)[:160]}")
        return out
    try:
        ref = RN.reference_frame(pipe, text)
    except (PipelineError, OSError, ValueError):
        ref = ""
    claims = [x for x in (c["ev"].get("claims") or []) if isinstance(x, dict)]
    by = Counter(x.get("status") for x in claims)
    out["claim"].append(f"- research claims: {dict(by)}; unresolved claims asserted in the final text: {len(asserted_unresolved(text, c['ev']))}")
    if ref:
        nr, nf = M.significant_numbers(ref), M.significant_numbers(text)
        lost, new = sorted((nr - nf)), sorted(k for k in (nf - nr) if k not in c["blob_numbers"])
        out["claim"].append(f"- numbers in the reference {sum(nr.values())}, in the final {sum(nf.values())}; lost or changed {lost[:5] or 'none'}; invented (not in sources or evidence) {new[:5] or 'none'}")
        lf = sorted((Counter(M.link_urls(ref)) - Counter(M.link_urls(text))))
        nl = sorted(u for u in set(M.link_urls(text)) if u not in set(M.link_urls(ref)) and u not in c["known_urls"])
        out["link"].append(f"- links in the reference {len(M.link_urls(ref))}, in the final {len(M.link_urls(text))}; lost {lf[:3] or 'none'}; not backed by a source {nl[:3] or 'none'}")
        st = structure_preservation(ref, text)
        out["structure"] += [f"- {k}: {'preserved' if st[k]['preserved'] else 'CHANGED'} ({st[k]['original']} in the reference, {st[k]['rewrite']} in the final)" for k in ("headings", "codes", "images")]
        if not st["links"]["preserved"]:
            out["link"].append(f"- FAIL: links missing {st['links']['missing'][:3]}")
    else:
        out["claim"].append("- reference frame not available yet (images stage not DONE): number and link comparison not run")
        out["link"].append(f"- links in the text {len(M.link_urls(text))}; reference comparison not run")
    out["link"].append("- every URL: " + (", ".join(sorted(set(M.link_urls(text)))) or "none"))
    lint = M.lint_v6(text)
    out["structure"].append(f"- V6 structural lint: {'clean' if not lint else lint}")
    caps = [s for s in c["src"].get("sources", []) if s.get("status") == "captured"]
    out["source"].append(f"- captured sources {len(caps)} (every file re-hashed from disk now), blocked sources {sum(1 for s in c['src'].get('sources', []) if s.get('status') == 'blocked')}")
    out["source"].append(f"- known source and evidence URLs {len(c['known_urls'])}; author-supplied material {'yes' if c['author_material'] else 'no'} (first-person experience is allowed only with it)")
    for n in ("integrity", "antifp", "editorial", "voice"):
        r = pipe.rec(n)
        if r:
            out["semantic"].append(f"- {n}: {r.get('status')}")
    for a in (pipe.read_json("antifp", "report").get("attempts") or []):
        if a.get("claims_gate"):
            out["semantic"].append(f"- antifp attempt {a['n']} ({a['target']}): claims gate {a['claims_gate']}")
    for a in (pipe.read_json("fpverify", "report").get("changes", {}).get("attempts") or []):
        out["semantic"].append(f"- fingerprint repair round {a['round']} ({a['signal']}): {'kept' if a['kept'] else 'rejected'}, claims gate {a.get('claims_gate', 'not reached')}")
    cuts = pipe.state.get("removals_ledger") or []
    out["semantic"].append(f"- declared removals (signed ledger): {len(cuts)}" + "".join(f"\n  - [{e.get('stage')}] {str(e.get('sentence'))[:100]!r} ({e.get('reason')})" for e in cuts[:6]))
    integ = pipe.read_json("integrity")
    out["semantic"].append(f"- final gate: {integ.get('gate', 'not reached')}; integrity record {integ.get('integrity_record_id', 'n/a')}")
    return out


def build_package_md(pipe: Pipeline, review: dict | None, route: dict | None, final_sha: str | None, *, verdict: str = "READY", reasons: list[str] | None = None,
                     text: str | None = None) -> str:
    text = text if text is not None else (pipe.pkg / "FINAL.md").read_text()
    t, imgs, src, ev = pipe.read_json("title"), pipe.read_json("images"), pipe.read_json("source"), pipe.read_json("research")
    af, crit, fpv = pipe.read_json("antifp", "report"), pipe.read_json("critic"), pipe.read_json("fpverify", "report")
    title, sub, _ = M.title_subtitle(text)
    title, sub = title or t.get("pick") or pipe.state["slug"], sub or t.get("subtitle")
    ck = checks(pipe, text)
    S: dict[str, list[str]] = {k: [] for k in SECTIONS}
    S["TITLE"] = [f"- {title}", f"- rationale: {t.get('rationale', 'n/a')}", f"- candidates considered: {len(t.get('candidates', []))}"] + [f"  - {c}" for c in t.get("candidates", [])]
    S["SUBTITLE"] = [f"- {sub} ({len(sub or '')} characters, limit 140)"]
    heads = [b.text.lstrip("# ").strip() for b in M.blocks(text) if b.kind == "heading" and not b.text.startswith("# ")]
    S["ARTICLE"] = ["- file: FINAL.md (rendered copy: FINAL.html)" + ("" if verdict == "READY" else "; both carry a NOT READY banner"), f"- words: {len(M.strip_code(text).split())}",
                    f"- paragraphs: {sum(1 for b in M.blocks(text) if b.kind == 'paragraph')}; sections: {heads or 'none'}"]
    S["SOURCES"] = [f"- {s.get('id')} ({s.get('kind')}, {s.get('status')}): {s.get('url') or s.get('file') or s.get('blocker')}" for s in src.get("sources", [])]
    for c in ev.get("claims", []):
        urls = ", ".join(str(e.get("url") or e.get("source_id")) for e in c.get("evidence", []) or [])
        S["SOURCES"].append(f"- claim {c.get('id')} [{c.get('status')}]: {c.get('supported_wording') or c.get('claim')} ({urls})")
    if not imgs.get("images"):
        S["IMAGES"] = [f"- none: {imgs.get('waived_reason') or 'images stage not reached'}"]
    for im in imgs.get("images", []):
        if im.get("placement") == "hero":
            S["IMAGES"].append(f"- HERO: method {im.get('method')}, provenance: {im.get('provenance')}, caption: {im.get('caption')}, ALT: {im.get('alt')}"
                               + (f", source {im.get('source_url')} at {im.get('timestamp')}" if im.get("method") == "frame" else ""))
        S["IMAGES"] += [f"- {im['id']} at {im['path']} ({im.get('width')}x{im.get('height')}, sha256 {im.get('sha256', '')[:12]})", f"  - purpose: {im['purpose']}",
                        f"  - placement: {im['placement']}", f"  - method: {im['method']}", f"  - provenance: {im['provenance']}", f"  - license: {im['license']}",
                        f"  - caption: {im['caption']}", f"  - ALT: {im['alt']}"]
    S["FURNITURE"] = FU.report_lines(pipe, text)
    sc = (review or {}).get("scorecard") or {}
    rounds = (pipe.state.get("critic") or {}).get("rounds")
    S["EDITORIAL SCORECARD"] = [f"- Medium review (bound to the final bytes): boost candidate {sc.get('boost_candidate')}, distribution risk {sc.get('general_distribution_risk')}, weakest dimension {sc.get('weakest_dimension')}"
                                if review else "- Medium review: not reached",
                                f"- independent critic: verdict {crit.get('verdict', 'not reached')} after {rounds} round(s) of {3} per run, {crit.get('majors', 'n/a')} major finding(s) open",
                                f"- {(review or {}).get('disclaimer', '')}"]
    for f in crit.get("findings", []) or []:
        if f.get("severity") == "major" and f.get("verified") and verdict != "READY":
            S["EDITORIAL SCORECARD"].append(f"  - OPEN major {f.get('id')}: {f.get('reason')} (passage: {str(f.get('passage'))[:140]!r}; fix: {f.get('fix')})")
    av = fpv.get("author_voice") or _direct_author_voice(pipe, text)
    S["AUTHOR-VOICE RESULT"] = ([f"- distance to the author corpus centroid (composite, lower is closer): baseline {av.get('baseline_distance')}, final {av.get('final_distance')}"]
                                + [f"  - {k}: baseline {v[0]}, final {v[1]}" for k, v in (av.get("components") or {}).items()]
                                if av else ["- author-corpus distance unavailable: the baseline draft or the author corpus could not be read"])
    if av and not fpv.get("author_voice"):
        S["AUTHOR-VOICE RESULT"].insert(0, "- fingerprint verification did not run; distance computed directly with the metrics module (before = draft, after = current text)")
    S["AUTHOR-VOICE RESULT"].append(f"- voice-stage composite (antifp): before {af.get('baseline', {}).get('composite')}, after {af.get('after', {}).get('composite')}")
    if fpv:
        S["FINGERPRINT BASELINE"] = [f"- the first draft ({fpv['baseline']['sha256'][:12]}, {fpv['baseline']['n_words']} words); author corpus {fpv['author_corpus']['docs']} documents", *_signal_lines(fpv["baseline"]["signals"])]
        S["FINGERPRINT FINAL"] = [f"- the final candidate ({fpv['final']['sha256'][:12]}, {fpv['final']['n_words']} words)", *_signal_lines(fpv["final"]["signals"]), f"- total severity {fpv['baseline']['total_severity']} -> {fpv['final']['total_severity']}"]
        ch = fpv["changes"]
        S["FINGERPRINT CHANGES"] = [f"- {d['signal']}: {d['baseline']} -> {d['final']} (severity {d['baseline_severity']} -> {d['final_severity']})" for d in ch["signals"]]
        S["FINGERPRINT CHANGES"].append(f"- targeted repair rounds used {ch['rounds_used']} of {ch['rounds_max']}, kept {ch['kept']}")
        for a in ch["attempts"]:
            S["FINGERPRINT CHANGES"].append(f"  - round {a['round']} target {a['signal']}: {'kept' if a['kept'] else 'rejected'}" + ("" if a["kept"] else f" ({'; '.join(a['reasons'])[:160]})"))
        for a in af.get("attempts", []):
            S["FINGERPRINT CHANGES"].append(f"  - antifp attempt {a['n']} target {a['target']}: {'kept' if a['kept'] else 'rejected'}")
        S["REMAINING FINGERPRINT SIGNALS"] = ([f"- strongest in the baseline: {[r['signal'] for r in fpv['strongest_baseline']] or 'none'}",
                                               f"- strongest remaining in the final: {[r['signal'] for r in fpv['strongest_remaining']] or 'none'}"]
                                              + [f"  - {r['signal']} {r['value']} (band {r['band']['p10']} to {r['band']['p90']}, severity {r['severity']})" for r in fpv["strongest_remaining"]])
    else:
        for k in ("FINGERPRINT BASELINE", "FINGERPRINT FINAL", "FINGERPRINT CHANGES", "REMAINING FINGERPRINT SIGNALS"):
            S[k] = ["- not reached: fingerprint verification (stage fpverify) did not run"]
        _antifp_sections(pipe, S, text, af)
    S["CLAIM CHECK"], S["LINK CHECK"], S["SOURCE CHECK"], S["STRUCTURE CHECK"], S["SEMANTIC PRESERVATION"] = ck["claim"], ck["link"], ck["source"], ck["structure"], ck["semantic"]
    S["MEDIUM REVIEW"] = ([f"- status {review.get('status')}; hard policy risks {review.get('hard_policy_risks')}; warnings {review.get('warnings')}"] if review else ["- not reached"])
    if route:
        S["MEDIUM REVIEW"] += [f"- route recommendation: {route.get('route_code')} {route.get('route')} ({route.get('detail')}). Recommendation only, nothing was executed."]
        S["MEDIUM REVIEW"] += [f"  - {r}" for r in route.get("reasons", [])]
        S["MEDIUM REVIEW"] += [f"  - candidate publication: {c.get('name')} {c.get('submission_url', '')}" for c in route.get("publication_candidates", []) or []]
    S["MEDIUM REVIEW"] += ["- author input suggestions (topically relevant only):", *["  " + x for x in author_opportunities(pipe, review, text)]]
    fw = pipe.state.get("framework") or {}
    S["EXACT FINAL HASH"] = [f"- FINAL.md sha256: {final_sha or sha_text(text)}", f"- framework: {fw.get('path')} sha256 {fw.get('sha256')}", *[f"- stage {n}: {(pipe.rec(n) or {}).get('bundle_sha256')}" for n in NAMES if pipe.rec(n)],
                             f"- overrides: {json.dumps(pipe.state.get('overrides', []))}"]
    if verdict == "READY":
        S["READY/NOT_READY"] = ["- READY: stopped for review. Nothing was published, scheduled or changed on Medium."]
    else:
        S["READY/NOT_READY"] = ["- NOT_READY. Do not publish. FINAL.md and FINAL.html carry a NOT READY banner.", *[f"- reason: {r}" for r in (reasons or [])]]
        for f in crit.get("findings", []) or []:
            if f.get("severity") == "major" and f.get("verified"):
                S["READY/NOT_READY"].append(f"- open critic finding {f.get('id')}: {f.get('reason')} (passage: {str(f.get('passage'))[:140]!r})")
    head = [f"# Review package: {title}", "", ("Stopped for review. Nothing was published, scheduled or changed on Medium." if verdict == "READY"
                                              else "NOT READY. This run ended without a verified article. Nothing was published, scheduled or changed on Medium."), ""]
    body = []
    for k in SECTIONS:
        body += [f"## {HEADINGS.get(k, k)}", "", *(S[k] or ["- none"]), ""]
    return "\n".join(head + body) + "\n"


def sha_text(t: str) -> str:
    import hashlib
    return hashlib.sha256(t.encode()).hexdigest()
