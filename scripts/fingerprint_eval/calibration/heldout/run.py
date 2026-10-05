"""Held-out evaluation of the adopted claim-judge policy (judge.judge_claims: prompt B + identity pre-filter + 2-of-3).

  python -m scripts.fingerprint_eval.calibration.heldout.run [--runs 3] [--max-calls 350] [--report-only]

No tuning: judge.py and the prompt are imported unchanged. Judge = `claude -p --model sonnet` via gateway.claude_env
(subscription, no API keys). Raw replies are cached per (run, case, prompt, occurrence) in results/cache.jsonl, so a
rerun is free and an interrupted run resumes. Every real attempt (including failed ones) counts against --max-calls.
Run index is the OUTER loop, so a budget shortfall can only truncate the last run.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import threading
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from ...gateway import GatewayError, Model, resolve_model
from ...judge import judge_claims
from ...rewrite import Segment
from ...textutil import Block
from .cases import Case, load_cases

RES = Path(__file__).parent / "results"
CACHE = RES / "cache.jsonl"
MODEL = "claude:sonnet"
_lock = threading.Lock()


class BudgetExceeded(GatewayError):
    pass


class CachingJudge:
    backend = "claude-cli"

    def __init__(self, case: Case, run: int, cache: dict, budget: list[int], model: Model):
        self.case, self.run, self.cache, self.budget, self.model = case, run, cache, budget, model
        self.name, self.seen, self.real, self.replayed = model.name, Counter(), 0, 0

    def complete(self, prompt: str, **kw) -> str:
        occ = self.seen[prompt]
        self.seen[prompt] += 1
        k = hashlib.sha256(f"{MODEL}\0{self.run}\0{occ}\0{prompt}".encode()).hexdigest()
        with _lock:
            hit = self.cache.get(k)
        if hit is not None:
            self.replayed += 1
            return hit
        with _lock:
            if self.budget[0] <= 0:
                raise BudgetExceeded("call budget exhausted", dependency="claude-cli")
            self.budget[0] -= 1
        self.real += 1
        raw = self.model.complete(prompt)
        with _lock:
            self.cache[k] = raw
            with CACHE.open("a") as fh:
                fh.write(json.dumps({"key": k, "case": self.case.id, "run": self.run, "raw": raw}) + "\n")
        return raw


def load_cache() -> dict[str, str]:
    out = {}
    if CACHE.exists():
        for line in CACHE.read_text().splitlines():
            if line.strip():
                r = json.loads(line)
                out[r["key"]] = r["raw"]
    return out


def run_case(c: Case, run: int, cache, budget, model) -> dict:
    j = CachingJudge(c, run, cache, budget, model)
    seg = Segment(c.seg, "", 0, [Block("paragraph", c.reference)], propositions=[{"claim": x} for x in c.claims], output=c.passage)
    base = {"case": c.id, "run": run, "label": c.label, "category": c.category}
    try:
        r = judge_claims([seg], j, strict=True)
    except Exception as e:  # EvaluationError / BudgetExceeded: reported as an error row, never as a verdict
        return {**base, "error": f"{type(e).__name__}: {str(e)[:160]}", "real_calls": j.real}
    votes = [f["votes"] for f in r["flagged"]] + [o["votes"] for o in r["overturned"]]
    return {**base, "policy_fail": r["claims_changed"] + r["claims_missing"] > 0, "first_pass_fail": bool(r["flagged"] or r["overturned"]),
            "judge_calls": r["judge_calls"], "prefiltered": r["prefiltered_segments"], "real_calls": j.real, "replayed": j.replayed,
            "flagged": [{"claim": f["claim"][:90], "verdict": f["verdict"], "dimension": f.get("dimension", ""), "evidence": f.get("evidence", "")[:120], "votes": f["votes"]} for f in r["flagged"]],
            "overturned": [{"claim": o["claim"][:90], "votes": o["votes"]} for o in r["overturned"]]}


def conf(rows: list[dict], key: str) -> dict:
    tp = sum(r["label"] == "FAIL" and r[key] for r in rows)
    fn = sum(r["label"] == "FAIL" and not r[key] for r in rows)
    fp = sum(r["label"] == "PASS" and r[key] for r in rows)
    tn = sum(r["label"] == "PASS" and not r[key] for r in rows)
    return {"TP": tp, "FP": fp, "TN": tn, "FN": fn, "precision": round(tp / (tp + fp), 3) if tp + fp else None, "recall": round(tp / (tp + fn), 3) if tp + fn else None}


def summarize(rows: list[dict], runs: int) -> dict:
    ok = [r for r in rows if "error" not in r]
    errors = [r for r in rows if "error" in r]
    by_case: dict[str, list[dict]] = defaultdict(list)
    for r in ok:
        by_case[r["case"]].append(r)
    complete = {k: v for k, v in by_case.items() if len(v) == runs}
    # per-category confusion over all case-runs (policy verdict), plus first-pass-only
    cats = {}
    for cat in sorted({r["category"] for r in ok}):
        sub = [r for r in ok if r["category"] == cat]
        cats[cat] = {"label": sub[0]["label"], "n_case_runs": len(sub), "policy": conf(sub, "policy_fail"), "first_pass": conf(sub, "first_pass_fail")}
    # majority-of-3 per case
    maj = []
    for cid, rs in complete.items():
        maj.append({"case": cid, "label": rs[0]["label"], "category": rs[0]["category"], "policy_fail": sum(r["policy_fail"] for r in rs) * 2 > len(rs)})
    stable = [len({r["policy_fail"] for r in rs}) == 1 for rs in complete.values()]
    stable_fp = [len({r["first_pass_fail"] for r in rs}) == 1 for rs in complete.values()]
    nonjudged = [r for r in ok if r["category"] == "identity"]
    overturned_cases = [r for r in ok if r["first_pass_fail"] and not r["policy_fail"]]
    flagged_claims = [f for r in ok for f in r["flagged"]]
    return {
        "runs": runs, "case_runs": len(rows), "errors": [{k: r[k] for k in ("case", "run", "error")} for r in errors],
        "overall_policy": conf(ok, "policy_fail"), "overall_first_pass": conf(ok, "first_pass_fail"),
        "overall_majority_of_3": conf(maj, "policy_fail") if maj else None,
        "per_category": cats,
        "stability": {"cases_with_all_runs": len(complete), "policy_unanimous": sum(stable), "policy_flip_rate": round(1 - sum(stable) / len(stable), 3) if stable else None,
                      "first_pass_unanimous": sum(stable_fp), "first_pass_flip_rate": round(1 - sum(stable_fp) / len(stable_fp), 3) if stable_fp else None,
                      "unstable_cases": sorted(k for k, s in zip(complete, stable) if not s)},
        "confirmation": {"case_runs_first_pass_flagged": sum(r["first_pass_fail"] for r in ok),
                         "case_runs_overturned_to_pass": len(overturned_cases),
                         "overturned_label_PASS_correct": sum(r["label"] == "PASS" for r in overturned_cases),
                         "overturned_label_FAIL_wrong": sum(r["label"] == "FAIL" for r in overturned_cases),
                         "overturned_claims_total": sum(len(r["overturned"]) for r in ok),
                         "overturned_claims_in_PASS_cases": sum(len(r["overturned"]) for r in ok if r["label"] == "PASS"),
                         "overturned_claims_in_FAIL_cases": sum(len(r["overturned"]) for r in ok if r["label"] == "FAIL"),
                         "confirmed_claims": len(flagged_claims), "confirmed_non_unanimous": sum(len(set(f["votes"])) > 1 for f in flagged_claims)},
        "calls": {"judge_calls_total": sum(r["judge_calls"] for r in ok), "judge_calls_per_case_run": round(sum(r["judge_calls"] for r in ok) / len(ok), 2) if ok else None,
                  "judge_calls_per_PASS_nonidentity": round(sum(r["judge_calls"] for r in ok if r["label"] == "PASS" and r["category"] != "identity") / max(1, sum(r["label"] == "PASS" and r["category"] != "identity" for r in ok)), 2),
                  "judge_calls_per_FAIL": round(sum(r["judge_calls"] for r in ok if r["label"] == "FAIL") / max(1, sum(r["label"] == "FAIL" for r in ok)), 2),
                  "identity_case_runs": len(nonjudged), "identity_prefiltered": sum(r["prefiltered"] for r in nonjudged), "identity_judge_calls": sum(r["judge_calls"] for r in nonjudged),
                  "real_calls_this_invocation": sum(r["real_calls"] for r in rows)},
        "misses": sorted({f"{r['case']}:{r['category']}:{'FN' if r['label'] == 'FAIL' else 'FP'}" for r in ok if r["policy_fail"] != (r["label"] == "FAIL")}),
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--runs", type=int, default=3)
    ap.add_argument("--max-calls", type=int, default=350)
    ap.add_argument("--report-only", action="store_true")
    ap.add_argument("--workers", type=int, default=4)
    a = ap.parse_args()
    RES.mkdir(exist_ok=True)
    cases = load_cases()
    cache, model = load_cache(), resolve_model(MODEL)
    budget = [0 if a.report_only else a.max_calls]
    rows: list[dict] = []
    with ThreadPoolExecutor(min(a.workers, 4)) as ex:
        for run in range(a.runs):
            rows += list(ex.map(lambda c: run_case(c, run, cache, budget, model), cases))
    out = {"summary": summarize(rows, a.runs), "rows": rows, "budget_left": budget[0]}
    (RES / "metrics.json").write_text(json.dumps(out, indent=1))
    s = out["summary"]
    print(json.dumps({k: s[k] for k in ("overall_policy", "overall_first_pass", "overall_majority_of_3", "stability", "confirmation", "calls", "misses", "errors")}, indent=1))
    for cat, v in s["per_category"].items():
        print(f"{v['label']:4} {cat:14} n={v['n_case_runs']:3} policy={v['policy']['TP']}/{v['policy']['FP']}/{v['policy']['TN']}/{v['policy']['FN']} first-pass={v['first_pass']['TP']}/{v['first_pass']['FP']}/{v['first_pass']['TN']}/{v['first_pass']['FN']}")


if __name__ == "__main__":
    main()
