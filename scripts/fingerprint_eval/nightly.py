"""Nightly watchdog and corpus analysis. Read-only over packages; deterministic; no LLM.

    python -m scripts.fingerprint_eval.nightly --workspace data/article-workspace [--since-days 30]
        [--retry-infra-quarantine] [--out DIR] [--enforced-since YYYY-MM-DD] [--no-probes]

Exit 5 if any scheduled/published package lacks a valid signed PASS authorization for its release bytes (CRITICAL), else 0.
The only write inside a package tree is whatever `release authorize` does when --retry-infra-quarantine
re-runs an infrastructure quarantine. Editorial quarantines are never retried.
"""
from __future__ import annotations

import argparse
import json
import math
import re
import subprocess
import sys
from collections import Counter, defaultdict
from datetime import date, datetime, timezone
from itertools import combinations
from pathlib import Path

from . import watchdog as W
from .contracts import AUTHOR_CORPUS_DIR, NIGHTLY_DIR
from .metrics import FUNCTION_WORDS, RULE_OF_THREE, cosine_distance, centroid, distance_to, fingerprint
from .textutil import body_text, core_markdown, split_sentences, words

REPO = Path(__file__).resolve().parents[2]
NGRAM_N = 5
FW = frozenset(FUNCTION_WORDS)
VEC_KEYS = ("sent_len_hist", "para_len_hist", "punct_dist", "function_words")


# ---- infra retry ----------------------------------------------------------------------------------------
def _child_env() -> dict:
    """Allowlisted env for the authorize child: claude/codex/doppler auth knobs and FINGERPRINT_EVAL_* only, no other secrets."""
    from .contracts import FG_ENV_KEYS
    from .gateway import CLAUDE_ENV_KEYS, CODEX_ENV_KEYS, child_env
    from .run import DOPPLER_ENV_KEYS
    return child_env(tuple(dict.fromkeys(CLAUDE_ENV_KEYS + CODEX_ENV_KEYS + DOPPLER_ENV_KEYS + FG_ENV_KEYS)))


def run_authorize(pkg: Path) -> int:
    """Re-run the canonical release path. Stubbed in tests."""
    r = subprocess.run([sys.executable, "-m", "scripts.fingerprint_eval.release", "authorize", "--package", str(pkg)],
                       cwd=REPO, capture_output=True, text=True, env=_child_env())
    return r.returncode


def retry_infra_quarantines(workspace: Path) -> list[dict]:
    out = []
    for pkg in W.list_packages(workspace):
        q = W.quarantine_info(pkg)
        if not q:
            continue
        if not q["infra"]:
            out.append({"slug": pkg.name, "category": q["category"], "action": "skipped_editorial"})
            continue
        out.append({"slug": pkg.name, "category": q["category"], "action": "authorize", "exit": run_authorize(pkg)})
    return out


# ---- analysis -------------------------------------------------------------------------------------------
def slope(ys: list[float]) -> float | None:
    n = len(ys)
    if n < 3:
        return None
    mx, my = (n - 1) / 2, sum(ys) / n
    den = sum((i - mx) ** 2 for i in range(n))
    return sum((i - mx) * (y - my) for i, y in enumerate(ys)) / den


def _r(x, nd=5):
    return None if x is None else round(x, nd)


def _pkg_date(pkg: Path) -> str:
    for name in ("version.json", "workflow.json"):
        d = W.read_json(pkg / name)
        if isinstance(d, dict):
            for k in ("updatedAt", "createdAt"):
                if isinstance(d.get(k), str) and d[k]:
                    return d[k]
    return ""


def load_articles(workspace: Path, since: date | None) -> list[dict]:
    arts = []
    for pkg in W.list_packages(workspace):
        f = W.resolve_final(pkg)
        if f is None:
            continue
        stamp = _pkg_date(pkg)
        d = W._parse_date(stamp)
        if since and d and d < since:
            continue
        md = f.read_text(errors="ignore")
        arts.append({"slug": pkg.name, "date": stamp, "text": body_text(core_markdown(md)), "md": md})
    arts.sort(key=lambda a: (a["date"], a["slug"]))
    return arts


def repeated_ngrams(arts: list[dict], min_docs: int = 3, top: int = 25) -> list[dict]:
    docs: dict[tuple, set] = defaultdict(set)
    tot: Counter = Counter()
    for a in arts:
        t = words(a["text"])
        for i in range(len(t) - NGRAM_N + 1):
            g = tuple(t[i:i + NGRAM_N])
            if sum(1 for w in g if w not in FW) < 2:
                continue
            docs[g].add(a["slug"])
            tot[g] += 1
    rows = [(g, len(s), tot[g]) for g, s in docs.items() if len(s) >= min_docs]
    rows.sort(key=lambda r: (-r[1], -r[2], r[0]))
    return [{"ngram": " ".join(g), "articles": n, "count": c} for g, n, c in rows[:top]]


def shared_openers(arts: list[dict], min_docs: int = 3, top: int = 15) -> list[dict]:
    docs: dict[str, set] = defaultdict(set)
    tot: Counter = Counter()
    for a in arts:
        for p in a["text"].split("\n\n"):
            for s in split_sentences(p):
                w = words(s)[:3]
                if len(w) == 3:
                    k = " ".join(w)
                    docs[k].add(a["slug"])
                    tot[k] += 1
    rows = [(k, len(s), tot[k]) for k, s in docs.items() if len(s) >= min_docs]
    rows.sort(key=lambda r: (-r[1], -r[2], r[0]))
    return [{"opener": k, "articles": n, "count": c} for k, n, c in rows[:top]]


def rule_of_three(arts: list[dict], fps: list[dict]) -> dict:
    per = []
    for a, fp in zip(arts, fps):
        n = max(fp["n_words"], 1)
        per.append({"slug": a["slug"], "rule_of_three_per_1k": _r(len(RULE_OF_THREE.findall(a["text"])) * 1000 / n),
                    "list_items_per_1k": _r(fp["list_items_per_1k"])})
    r3 = [p["rule_of_three_per_1k"] for p in per]
    return {"per_article": per, "trend_slope_per_article": _r(slope(r3)),
            "mean_per_1k": _r(sum(r3) / len(r3)) if r3 else None}


def _vec(fp: dict) -> list[float]:
    return [x for k in VEC_KEYS for x in fp[k]]


def convergence(arts: list[dict], fps: list[dict], window: int = 8, step: int = 4) -> dict:
    vecs = [_vec(f) for f in fps]
    n = len(vecs)
    if n < 3:
        return {"skipped": "fewer than 3 articles"}

    def mean_pair(ix):
        ds = [cosine_distance(vecs[i], vecs[j]) for i, j in combinations(ix, 2)]
        return sum(ds) / len(ds)

    series = []
    w = min(window, n)
    for s in range(0, n - w + 1, step):
        series.append({"from": arts[s]["slug"], "to": arts[s + w - 1]["slug"], "mean_pairwise_distance": _r(mean_pair(range(s, s + w)))})
    if series and series[-1]["to"] != arts[-1]["slug"]:
        s = n - w
        series.append({"from": arts[s]["slug"], "to": arts[-1]["slug"], "mean_pairwise_distance": _r(mean_pair(range(s, n)))})
    ys = [x["mean_pairwise_distance"] for x in series]
    # outliers: mean distance to all others, z-score
    md = [sum(cosine_distance(vecs[i], vecs[j]) for j in range(n) if j != i) / (n - 1) for i in range(n)]
    mu = sum(md) / n
    sd = math.sqrt(sum((x - mu) ** 2 for x in md) / n)
    outliers = [{"slug": arts[i]["slug"], "z": _r((md[i] - mu) / sd, 3)} for i in range(n) if sd > 0 and abs((md[i] - mu) / sd) >= 2]
    outliers.sort(key=lambda o: (-abs(o["z"]), o["slug"]))
    return {"overall_mean_pairwise_distance": _r(mean_pair(range(n))), "window": w, "series": series,
            "trend_slope_per_window": _r(slope(ys)), "converging": (slope(ys) or 0) < 0, "outliers": outliers}


def load_author_texts(directory: Path) -> list[str]:
    from .textutil import html_to_text
    texts = []
    for f in sorted(directory.glob("*.txt")):
        texts.append(f.read_text(errors="ignore"))
    for f in sorted(directory.glob("*.html")):
        texts.append(html_to_text(f.read_text(errors="ignore")))
    return [t for t in texts if len(words(t)) >= 150]


def author_drift(fps: list[dict], arts: list[dict], corpus_dir: Path) -> dict:
    if not corpus_dir.is_dir():
        return {"skipped": f"author corpus not found at {corpus_dir}"}
    texts = load_author_texts(corpus_dir)
    if not texts:
        return {"skipped": f"author corpus at {corpus_dir} has no usable documents"}
    ref = centroid([fingerprint(t) for t in texts])
    rows = []
    for a, fp in zip(arts, fps):
        d = distance_to(ref, fp)
        rows.append({"slug": a["slug"], "sentence_length_jsd": _r(d["sentence_length_jsd"]),
                     "paragraph_length_jsd": _r(d["paragraph_length_jsd"]), "composite": _r(d["composite"])})
    comp = [r["composite"] for r in rows]
    return {"corpus_docs": len(texts), "per_article": rows, "mean_composite": _r(sum(comp) / len(comp)) if comp else None,
            "trend_slope_per_article": _r(slope(comp))}


def analyze(workspace: Path, since: date | None, corpus_dir: Path) -> dict:
    arts = load_articles(workspace, since)
    if not arts:
        return {"articles": 0, "skipped": "no articles in window"}
    fps = [fingerprint(a["md"]) for a in arts]
    return {
        "articles": len(arts),
        "window_slugs": [a["slug"] for a in arts],
        "repeated_ngrams": repeated_ngrams(arts),
        "shared_openers": shared_openers(arts),
        "rule_of_three": rule_of_three(arts, fps),
        "author_drift": author_drift(fps, arts, corpus_dir),
        "convergence": convergence(arts, fps),
    }


# ---- report ---------------------------------------------------------------------------------------------
def render_md(day: str, wd: dict, an: dict, retries: list[dict]) -> str:
    c = wd["counts"]
    L = [f"# Fingerprint nightly {day}", ""]
    if wd["critical"]:
        L += [f"## CRITICAL: {len(wd['critical'])} scheduled/published without a matching PASS authorization", ""]
        L += [f"- {x['slug']}: {x['integrity_reason']} ({', '.join(x['medium_evidence'])})" for x in wd["critical"]] + [""]
    else:
        L += ["## Integrity: no CRITICAL findings", ""]
    if wd["legacy_ungated"]:
        L += [f"## LEGACY_UNGATED ({len(wd['legacy_ungated'])}, scheduled before {wd['enforced_since']})", ""]
        L += [f"- {x['slug']} ({x['medium_date']})" for x in wd["legacy_ungated"]] + [""]
    L += ["## Watchdog", "",
          f"- generated {c['generated']}, evaluated {c['evaluated']}, authorized {c['authorized']}, scheduled/published {c['scheduled_or_published']}",
          f"- PASS artifacts {c['pass_artifacts']}, unresolved ERRORs {c['unresolved_errors']}, quarantined {c['quarantined']} {c['quarantined_by_category']}"]
    for dep, st in wd["circuits"].items():
        L.append(f"- circuit {dep}: {st['state']} ({st['consecutive_failures']} failures)")
    for dep, st in wd["dependencies"].items():
        if dep != "skipped":
            L.append(f"- probe {dep}: {'ok' if st['ok'] else 'DOWN'}")
    if wd["dependencies"].get("skipped"):
        L.append("- probes skipped")
    if retries:
        L += ["", "## Infra retries", ""] + [f"- {r['slug']} [{r['category']}]: {r['action']}" + (f" exit {r['exit']}" if "exit" in r else "") for r in retries]
    L += ["", "## Corpus analysis", ""]
    if an.get("skipped"):
        L.append(f"- skipped: {an['skipped']}")
    else:
        L.append(f"- articles analyzed: {an['articles']}")
        L += [f"- repeated 5-gram: \"{x['ngram']}\" in {x['articles']} articles" for x in an["repeated_ngrams"][:5]]
        L += [f"- shared opener: \"{x['opener']}\" in {x['articles']} articles" for x in an["shared_openers"][:5]]
        r3 = an["rule_of_three"]
        L.append(f"- rule of three: mean {r3['mean_per_1k']}/1k words, trend slope {r3['trend_slope_per_article']}")
        ad = an["author_drift"]
        L.append(f"- author drift: skipped ({ad['skipped']})" if "skipped" in ad else f"- author drift: mean composite {ad['mean_composite']}, slope {ad['trend_slope_per_article']}")
        cv = an["convergence"]
        if "skipped" in cv:
            L.append(f"- convergence: skipped ({cv['skipped']})")
        else:
            L.append(f"- convergence: mean pairwise distance {cv['overall_mean_pairwise_distance']}, slope {cv['trend_slope_per_window']}, converging={cv['converging']}")
            L += [f"- outlier: {o['slug']} z={o['z']}" for o in cv["outliers"][:5]]
    return "\n".join(L) + "\n"


def summary_line(day: str, wd: dict, an: dict) -> str:
    c = wd["counts"]
    head = (f"CRITICAL: {len(wd['critical'])} scheduled/published article(s) lack a matching PASS authorization ({', '.join(x['slug'] for x in wd['critical'][:3])}). "
            if wd["critical"] else "No integrity violations. ")
    cv = an.get("convergence", {}) if isinstance(an, dict) else {}
    tail = f" Pipeline converging={cv['converging']}." if "converging" in cv else ""
    return (f"Fingerprint nightly {day}: {head}{c['generated']} generated, {c['evaluated']} evaluated, {c['authorized']} authorized, "
            f"{c['scheduled_or_published']} scheduled/published ({len(wd['legacy_ungated'])} legacy ungated), {c['quarantined']} quarantined "
            f"{c['quarantined_by_category']}, {c['unresolved_errors']} unresolved ERRORs.{tail}")


def main(argv: list[str] | None = None, today: date | None = None) -> int:
    ap = argparse.ArgumentParser(prog="nightly")
    ap.add_argument("--workspace", required=True, type=Path)
    ap.add_argument("--since-days", type=int, default=30)
    ap.add_argument("--retry-infra-quarantine", action="store_true")
    ap.add_argument("--out", type=Path)
    ap.add_argument("--enforced-since", help="YYYY-MM-DD; schedules before this are LEGACY_UNGATED (default today)")
    ap.add_argument("--no-probes", action="store_true")
    ap.add_argument("--author-corpus", type=Path, default=REPO / AUTHOR_CORPUS_DIR)
    a = ap.parse_args(argv)
    today = today or datetime.now(timezone.utc).date()
    enforced = date.fromisoformat(a.enforced_since) if a.enforced_since else today
    ws = a.workspace
    out = a.out or ws / NIGHTLY_DIR
    retries = retry_infra_quarantines(ws) if a.retry_infra_quarantine else []
    wd = W.run_watchdog(ws, enforced, probes=not a.no_probes)
    since = date.fromordinal(today.toordinal() - a.since_days) if a.since_days else None
    an = analyze(ws, since, a.author_corpus)
    day = today.isoformat()
    out.mkdir(parents=True, exist_ok=True)
    (out / f"{day}.json").write_text(json.dumps({"date": day, "watchdog": wd, "analysis": an, "infra_retries": retries}, indent=2, sort_keys=True))
    (out / f"{day}.md").write_text(render_md(day, wd, an, retries))
    print(summary_line(day, wd, an))
    return W.EXIT_CRITICAL if wd["critical"] else 0


if __name__ == "__main__":
    sys.exit(main())
