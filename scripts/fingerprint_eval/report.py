"""report.md writer."""
from __future__ import annotations

import difflib

from .textutil import parse_blocks


def _f(x, n=3):
    return "n/a" if x is None else f"{x:.{n}f}"


def top_diffs(segments, k: int = 3) -> list[tuple[str, str]]:
    """Segments whose rewritten text diverges most from the original (lowest ratio)."""
    scored = []
    for s in segments:
        if s.frozen or not s.output:
            continue
        r = difflib.SequenceMatcher(None, s.text, s.output).ratio()
        scored.append((r, s))
    scored.sort(key=lambda x: x[0])
    out = []
    for r, s in scored[:k]:
        o = [b.text for b in parse_blocks(s.text)]
        n = [b.text for b in parse_blocks(s.output)]
        diff = "\n".join(difflib.unified_diff(o, n, "original", "rewrite", lineterm="", n=0))
        out.append((f"{s.section or '(intro)'} (similarity {r:.2f})", diff[:2500]))
    return out


def write_report(path, m: dict, diffs: dict, blockers: list[dict]) -> None:
    L = [f"# Fingerprint eval: {m['slug']}", "",
         "Eval-only experiment. No publish path touched; article package on the mini was only read.", "",
         f"- Writer: {m['writer']['model']} (family {m['writer']['family']})",
         f"- Author anchor: {m['reference']['author_docs']} pre-2023 posts, {m['reference']['author_words']} words",
         f"- Pipeline corpus: {m['reference']['pipeline_docs']} articles (target excluded)",
         f"- Original: {m['original']['n_words']} words, {m['original']['n_sentences']} sentences", ""]
    names = list(m["rewriters"])
    if names:
        L += ["## Results", "", "| metric | original | " + " | ".join(names) + " |", "|---|---|" + "---|" * len(names)]
        R = m["rewriters"]
        o = m["original"]

        def row(label, orig, fn, n=3):
            L.append(f"| {label} | {orig} | " + " | ".join(_f(fn(R[k]), n) if fn(R[k]) is not None else "n/a" for k in names) + " |")

        row("[author_anchor] author distance (composite, lower = closer)", _f(m["author_style_distance_before"]["composite"]), lambda r: r["author_style_distance_after"]["composite"])
        row("[author_anchor] author Burrows Delta", _f(m["author_style_distance_before"].get("burrows_delta")), lambda r: r["author_style_distance_after"].get("burrows_delta"))
        row("[author_anchor] author sentence-length JSD", _f(m["author_style_distance_before"]["sentence_length_jsd"]), lambda r: r["author_style_distance_after"]["sentence_length_jsd"])
        row("[author_anchor] author paragraph-length JSD", _f(m["author_style_distance_before"]["paragraph_length_jsd"]), lambda r: r["author_style_distance_after"]["paragraph_length_jsd"])
        row("[author_anchor] author punctuation JSD", _f(m["author_style_distance_before"]["punctuation_jsd"]), lambda r: r["author_style_distance_after"]["punctuation_jsd"])
        row("[author_anchor] author function-word cosine", _f(m["author_style_distance_before"]["function_word_cosine"]), lambda r: r["author_style_distance_after"]["function_word_cosine"])
        row("[stylistic_structural] pipeline outlier z (composite)", _f(m["pipeline_corpus_outlier_before"]["z"], 2), lambda r: r["pipeline_corpus_outlier"]["z"], 2)
        row("[stylistic_structural] pipeline outlier percentile", _f(m["pipeline_corpus_outlier_before"]["percentile"], 2), lambda r: r["pipeline_corpus_outlier"]["percentile"], 2)
        row("[stylistic_structural] repeated n-gram rate (3-5 mean)", _f(o["repeated_ngram_rate"]["mean"], 4), lambda r: r["repeated_ngram_rate"]["after"], 4)
        row("[stylistic_structural] sentence-length JSD, original vs rewrite", "-", lambda r: r["sentence_length_jsd"])
        row("[stylistic_structural] paragraph-length JSD, original vs rewrite", "-", lambda r: r["paragraph_length_jsd"])
        row("[semantic_retention] semantic similarity (whole)", "-", lambda r: r["semantic_similarity"]["whole"])
        row("[semantic_retention] semantic similarity (section min)", "-", lambda r: r["semantic_similarity"]["section_min"])
        row("claims entailed / total", "-", lambda r: None)
        L[-1] = "| [semantic_retention] claims preserved / changed / missing | - | " + " | ".join(
            f"{R[k]['claims_preserved']} / {R[k]['claims_changed']} / {R[k]['claims_missing']} (of {R[k]['claims_total']}, unjudged {R[k].get('claims_unjudged', 0)})" for k in names) + " |"
        L.append("| [semantic_retention] structure preserved (headings/images/code/links) | - | " + " | ".join(str(R[k]["structure_preserved"]["all_preserved"]) for k in names) + " |")
        L.append("| judge | - | " + " | ".join(R[k]["judge"] for k in names) + " |")
        L += ["", "Delta = after minus before; negative means closer to the author. Composite = mean of the four distances (sentence JSD, paragraph JSD, punctuation JSD, function-word cosine).", ""]
    if names:
        L += ["## Reading (conditional, per transform)", ""]
        b = m["author_style_distance_before"]["composite"]
        for k in names:
            r = m["rewriters"][k]
            a2 = r["author_style_distance_after"]["composite"]
            L.append(f"- Under {r['transform']} ({k}), the author-anchor composite distance moved {b:.3f} -> {a2:.3f} ({a2 - b:+.3f}); "
                     f"whole-document semantic similarity {r['semantic_similarity']['whole']:.3f}; claims {r['claims_preserved']}/{r['claims_total']} judged entailed by {r['judge']}.")
        ctl = [k for k in names if m["rewriters"][k].get("control")]
        for k in ctl:
            c2 = m["rewriters"][k]["author_style_distance_after"]["composite"] - b
            for n in names:
                if n not in ctl:
                    d = m["rewriters"][n]["author_style_distance_after"]["composite"] - b
                    L.append(f"- Relative to the control ({k}, {c2:+.3f}), {n} moved the author-anchor composite by {d - c2:+.3f} beyond what a same-family rewrite moved. One article, one run: indicative only.")
        L += ["- These are measured style signals on one article. They do not establish provenance, attribution, or detector outcomes; the objective is style preservation toward the author corpus plus meaning retention.", ""]
    L += ["## Structural templates found", "", "| [stylistic_structural] template | original | " + " | ".join(names) + " |", "|---|---|" + "---|" * len(names)]
    keys = sorted(set(m["structural_templates_original"]) | {t for r in m["rewriters"].values() for t in r["structural_templates"]})
    for t in keys:
        L.append(f"| {t} | {m['structural_templates_original'].get(t, {}).get('count', 0)} | " + " | ".join(str(m["rewriters"][k]["structural_templates"].get(t, {}).get("count", 0)) for k in names) + " |")
    for t, v in m["structural_templates_original"].items():
        L += ["", f"Original `{t}` examples:"] + [f"- {e}" for e in v["examples"]]
    L += ["", "## Flagged claims", ""]
    for k in names:
        fl = m["rewriters"][k]["flagged_claims"]
        L.append(f"### {k} ({len(fl)} flagged)")
        L += [f"- [{f['verdict']}] ({f['section']}) {f['claim']} -- {f['reason']}" for f in fl[:25]] or ["- none"]
        L.append("")
    L += ["## Lanes", ""]
    for name, lane in m["lanes"].items():
        L.append(f"- {name}: {lane}")
    L += ["", f"- watermark_tests [signal_family watermark, research tier, not run]: {m['watermark_tests']}", f"- provenance [signal_family provenance]: n/a for text", "- tiers: fast (this report) / research (stub, detectors + watermark, not run)", "", "## Blockers", ""]
    L += [f"- {b['what']}: `{b['error']}`. Fix: {b['fix']}" for b in blockers] or ["- none"]
    for k, ds in diffs.items():
        L += ["", f"## Most changed paragraphs: {k}", ""]
        for title, d in ds:
            L += [f"### {title}", "", "```diff", d, "```", ""]
    path.write_text("\n".join(L) + "\n")
