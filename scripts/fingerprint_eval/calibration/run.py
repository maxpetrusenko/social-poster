"""Calibration runner.

  python -m scripts.fingerprint_eval.calibration.run                      # current x3, A x1, B x1 (default plan)
  python -m scripts.fingerprint_eval.calibration.run --plan current:3 A:3  # explicit prompt:runs
  python -m scripts.fingerprint_eval.calibration.run --report-only         # metrics from cache, no judge calls

Judge = claude:sonnet via `claude -p` subscription (gateway.claude_env strips API keys). Results are cached by
sha256(model | exact prompt | run index) in results/cache.jsonl, so reruns cost nothing. <=4 concurrent calls.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import threading
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from ..gateway import GatewayError, resolve_model
from .cases import PREFILTER_CASES, Case, load_cases
from .prefilter import identical
from .prompts import PROMPTS

RES = Path(__file__).parent / "results"
CACHE = RES / "cache.jsonl"
MODEL = "claude:sonnet"
_lock = threading.Lock()


def _key(prompt_text: str, run: int) -> str:
    return hashlib.sha256(f"{MODEL}\0{run}\0{prompt_text}".encode()).hexdigest()


def load_cache() -> dict[str, dict]:
    out = {}
    if CACHE.exists():
        for line in CACHE.read_text().splitlines():
            if line.strip():
                r = json.loads(line)
                out[r["key"]] = r
    return out


def format_prompt(pname: str, case: Case) -> str:
    tmpl = PROMPTS[pname][0]
    return tmpl.format(claims="\n".join(f"{i + 1}. {c}" for i, c in enumerate(case.claims)), passage=case.passage)


def judge_once(pname: str, case: Case, run: int) -> dict:
    """One judge call (one retry on bad output, like judge.judge_claims). Returns a cache record."""
    model = resolve_model(MODEL)
    prompt, parse = format_prompt(pname, case), PROMPTS[pname][1]
    last = ""
    for _ in range(2):
        try:
            v = parse(model.complete(prompt), len(case.claims))
            return {"key": _key(prompt, run), "prompt": pname, "case": case.id, "run": run, "verdicts": {str(i): x["verdict"] for i, x in v.items()}, "reasons": {str(i): x.get("reason", "") for i, x in v.items()}}
        except (GatewayError, ValueError) as e:
            last = str(e)[:200]
    return {"key": _key(prompt, run), "prompt": pname, "case": case.id, "run": run, "error": last}


def execute(plan: dict[str, int], cases: list[Case], base: dict[int, Case], workers: int = 4) -> int:
    RES.mkdir(exist_ok=True)
    cache = load_cache()
    todo = []
    for pname, runs in plan.items():
        for r in range(runs):
            for c in [*cases, *base.values()]:
                rec = cache.get(_key(format_prompt(pname, c), r))
                if rec is None or "error" in rec:
                    todo.append((pname, c, r))
    print(f"{len(todo)} judge calls to run")

    def work(t):
        rec = judge_once(*t)
        with _lock:
            with CACHE.open("a") as fh:
                fh.write(json.dumps(rec) + "\n")
        return rec

    with ThreadPoolExecutor(workers) as ex:
        done = sum(1 for _ in ex.map(work, todo))
    return done


def _flags(rec: dict) -> set[int]:
    return {int(i) for i, v in rec["verdicts"].items() if v != "entailed"}


def _f1(tp, fp, fn):
    p = tp / (tp + fp) if tp + fp else 0.0
    r = tp / (tp + fn) if tp + fn else 0.0
    return p, r


def metrics(pname: str, runs: int, cases: list[Case], base: dict[int, Case]) -> dict:
    cache = load_cache()

    def get(c, r):
        rec = cache.get(_key(format_prompt(pname, c), r))
        return rec if rec and "verdicts" in rec else None

    base_flags = {s: set().union(*[_flags(x) for r in range(runs) if (x := get(b, r))] or [set()]) for s, b in base.items()}
    base_rate = {s: len(base_flags[s]) for s in base}
    per_run: dict[str, list] = defaultdict(list)  # case -> [raw_flags_per_run], [delta_flags_per_run]
    for c in cases:
        for r in range(runs):
            rec = get(c, r)
            if rec:
                f = _flags(rec)
                per_run[c.id].append((f, f - base_flags[c.seg]))
    out = {"prompt": pname, "runs": runs, "baseline_flagged_claims_per_segment": base_rate,
           "baseline_total_claims": sum(len(b.claims) for b in base.values()), "baseline_flagged_total": sum(base_rate.values())}
    for mode, idx in (("raw", 0), ("delta", 1)):
        for thr in (1, 2):
            for agg in ("single", "majority", "any"):
                tp = fp = tn = fn = 0
                misses = []
                for c in cases:
                    rs = per_run.get(c.id, [])
                    if not rs:
                        continue
                    votes = [len(x[idx]) >= thr for x in rs]
                    pred = (votes[0] if agg == "single" else sum(votes) * 2 > len(votes) if agg == "majority" else any(votes))
                    if c.label == "FAIL":
                        tp, fn = (tp + 1, fn) if pred else (tp, fn + 1)
                    else:
                        fp, tn = (fp + 1, tn) if pred else (fp, tn + 1)
                    if pred != (c.label == "FAIL"):
                        misses.append(f"{c.id}:{c.category}")
                p, r_ = _f1(tp, fp, fn)
                out[f"{mode}/thr{thr}/{agg}"] = {"TP": tp, "FP": fp, "TN": tn, "FN": fn, "precision": round(p, 3), "recall": round(r_, 3), "misses": misses}
    # stability: case-level verdict (delta>=1) unanimity across runs; claim-level verdict unanimity
    flips = [len({len(x[1]) >= 1 for x in rs}) > 1 for rs in per_run.values() if len(rs) > 1]
    cl_total = cl_flip = 0
    for c in [*cases, *base.values()]:
        recs = [x for r in range(runs) if (x := get(c, r))]
        if len(recs) > 1:
            for i in recs[0]["verdicts"]:
                cl_total += 1
                cl_flip += len({x["verdicts"][i] != "entailed" for x in recs}) > 1
    out["flip_rate_case"] = round(sum(flips) / len(flips), 3) if flips else None
    out["flip_rate_claim"] = round(cl_flip / cl_total, 4) if cl_total else None
    cat = defaultdict(lambda: [0, 0])
    for c in cases:
        rs = per_run.get(c.id, [])
        if rs:
            votes = [len(x[1]) >= 1 for x in rs]
            pred = sum(votes) * 2 > len(votes)
            cat[f"{c.label}/{c.category}"][0] += pred == (c.label == "FAIL")
            cat[f"{c.label}/{c.category}"][1] += 1
    out["per_category_correct"] = {k: f"{v[0]}/{v[1]}" for k, v in sorted(cat.items())}
    out["errors"] = sum(1 for c in [*cases, *base.values()] for r in range(runs) if get(c, r) is None)
    return out


def prefilter_report(cases: list[Case]) -> dict:
    skipped = [c.id for c in cases if identical(c.passage, c.reference)]
    return {"judged_cases": len(cases), "skipped_by_identical_prefilter": skipped,
            "unjudged_prefilter_cases": [c[0] for c in PREFILTER_CASES],
            "fail_cases_wrongly_skipped": [c.id for c in cases if c.label == "FAIL" and identical(c.passage, c.reference)]}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--plan", nargs="*", default=["current:3", "A:1", "B:1"])
    ap.add_argument("--report-only", action="store_true")
    ap.add_argument("--workers", type=int, default=4)
    a = ap.parse_args()
    plan = {p.split(":")[0]: int(p.split(":")[1]) for p in a.plan}
    cases, base = load_cases()
    if not a.report_only:
        execute(plan, cases, base, min(a.workers, 4))
    allm = {p: metrics(p, n, cases, base) for p, n in plan.items()}
    allm["prefilter"] = prefilter_report(cases)
    (RES / "metrics.json").write_text(json.dumps(allm, indent=1))
    for p, m in allm.items():
        if p == "prefilter":
            print("prefilter", json.dumps(m))
            continue
        print(f"\n== prompt {p} runs={m['runs']} errors={m['errors']} baseline flagged {m['baseline_flagged_total']}/{m['baseline_total_claims']} claims on unchanged text")
        for k in ("raw/thr1/single", "delta/thr1/single", "delta/thr1/majority", "delta/thr1/any", "delta/thr2/majority"):
            x = m[k]
            print(f"  {k:22s} TP{x['TP']} FP{x['FP']} TN{x['TN']} FN{x['FN']} P={x['precision']} R={x['recall']} misses={x['misses']}")
        print(f"  flip case={m['flip_rate_case']} claim={m['flip_rate_claim']}")
        print("  per-category correct:", m["per_category_correct"])


if __name__ == "__main__":
    main()
