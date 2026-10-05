"""Evaluate the production policy (judge.judge_claims: prompt B + identity pre-filter + 2-of-3 confirmation) on the
calibration fixtures.

  python -m scripts.fingerprint_eval.calibration.policy_eval [--heavy] [--max-calls 150] [--report-only]

Judge = claude:sonnet via `claude -p` subscription. Raw replies are cached in results/policy_cache.jsonl keyed by
sha256(model | occurrence of this exact prompt within the case | prompt), so reruns are free. First-pass replies for
the 41 light-edit fixtures are seeded from the earlier prompt-B run 0 (same prompt text, same model; the verdict/reason
fields are reused, evidence/dimension were not stored then). Real calls stop at --max-calls.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import threading
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from ..gateway import GatewayError, Model, resolve_model
from ..judge import JUDGE_PROMPT, judge_claims
from ..rewrite import Segment
from ..textutil import Block
from .cases import Case, load_cases
from .heavy import load_heavy_cases
from .run import _key as old_key, load_cache as load_old_cache

RES = Path(__file__).parent / "results"
CACHE = RES / "policy_cache.jsonl"
MODEL = "claude:sonnet"
_lock = threading.Lock()


class BudgetExceeded(GatewayError):
    pass


class CachingJudge:
    """Model-shaped wrapper: replays cached raw replies, counts real calls, enforces the call budget."""

    backend = "claude-cli"

    def __init__(self, case: Case, cache: dict, old: dict, budget: list[int], model: Model):
        self.case, self.cache, self.old, self.budget, self.model = case, cache, old, budget, model
        self.name, self.seen, self.real, self.replayed = model.name, Counter(), 0, 0
        self.full_prompt = JUDGE_PROMPT.format(claims="\n".join(f"{i + 1}. {c}" for i, c in enumerate(case.claims)), passage=case.passage)

    def _k(self, prompt: str, occ: int) -> str:
        return hashlib.sha256(f"{MODEL}\0{occ}\0{prompt}".encode()).hexdigest()

    def complete(self, prompt: str, **kw) -> str:
        occ = self.seen[prompt]
        self.seen[prompt] += 1
        k = self._k(prompt, occ)
        with _lock:
            hit = self.cache.get(k)
        if hit is not None:
            self.replayed += 1
            return hit
        if prompt == self.full_prompt and occ == 0:  # seed from the earlier prompt-B run 0
            rec = self.old.get(old_key(prompt, 0))
            if rec and "verdicts" in rec:
                self.replayed += 1
                return json.dumps([{"i": int(i), "verdict": v, "reason": rec["reasons"].get(i, "")} for i, v in rec["verdicts"].items()])
        with _lock:
            if self.budget[0] <= 0:
                raise BudgetExceeded("call budget exhausted", dependency="claude-cli")
            self.budget[0] -= 1
        raw = self.model.complete(prompt)
        self.real += 1
        with _lock:
            self.cache[k] = raw
            with CACHE.open("a") as fh:
                fh.write(json.dumps({"key": k, "case": self.case.id, "raw": raw}) + "\n")
        return raw


def _segment(c: Case) -> Segment:
    return Segment(c.seg, "", 0, [Block("paragraph", c.reference)], propositions=[{"claim": x} for x in c.claims], output=c.passage)


def load_cache() -> dict[str, str]:
    out = {}
    if CACHE.exists():
        for line in CACHE.read_text().splitlines():
            if line.strip():
                r = json.loads(line)
                out[r["key"]] = r["raw"]
    return out


def run_case(c: Case, cache, old, budget, model) -> dict:
    j = CachingJudge(c, cache, old, budget, model)
    try:
        r = judge_claims([_segment(c)], j, strict=True)
    except Exception as e:  # EvaluationError or BudgetExceeded: reported, never counted as a verdict
        return {"case": c.id, "label": c.label, "category": c.category, "error": f"{type(e).__name__}: {str(e)[:160]}", "real_calls": j.real}
    first_flag = bool(r["flagged"] or r["overturned"])  # every flagged/overturned claim was flagged on the first pass
    votes = [f["votes"] for f in r["flagged"]] + [o["votes"] for o in r["overturned"]]
    return {"case": c.id, "label": c.label, "category": c.category, "policy_fail": r["claims_changed"] + r["claims_missing"] > 0,
            "first_pass_fail": first_flag, "judge_calls": r["judge_calls"], "real_calls": j.real, "replayed": j.replayed,
            "flagged": [{"claim": f["claim"][:80], "verdict": f["verdict"], "dimension": f.get("dimension", ""), "votes": f["votes"]} for f in r["flagged"]],
            "overturned": len(r["overturned"]), "non_unanimous": sum(len(set(v)) > 1 for v in votes if len(v) > 1), "confirmed_claims": sum(len(v) > 1 for v in votes)}


def confusion(rows: list[dict], key: str) -> dict:
    tp = sum(r["label"] == "FAIL" and r[key] for r in rows)
    fn = sum(r["label"] == "FAIL" and not r[key] for r in rows)
    fp = sum(r["label"] == "PASS" and r[key] for r in rows)
    tn = sum(r["label"] == "PASS" and not r[key] for r in rows)
    return {"TP": tp, "FP": fp, "TN": tn, "FN": fn, "precision": round(tp / (tp + fp), 3) if tp + fp else None, "recall": round(tp / (tp + fn), 3) if tp + fn else None}


def summarize(rows: list[dict]) -> dict:
    ok = [r for r in rows if "error" not in r]
    conf_claims = sum(r["confirmed_claims"] for r in ok)
    return {"cases": len(rows), "errors": [r for r in rows if "error" in r],
            "first_pass_only": confusion(ok, "first_pass_fail"), "policy_2of3": confusion(ok, "policy_fail"),
            "judge_calls_per_case_policy": round(sum(r["judge_calls"] for r in ok) / len(ok), 2) if ok else None,
            "judge_calls_total_policy": sum(r["judge_calls"] for r in ok), "real_calls_this_run": sum(r["real_calls"] for r in rows),
            "claims_confirmed": conf_claims, "confirmation_non_unanimous": sum(r["non_unanimous"] for r in ok),
            "flags_overturned_by_vote": sum(r["overturned"] for r in ok),
            "misses_policy": [f"{r['case']}:{r['category']}" for r in ok if r["policy_fail"] != (r["label"] == "FAIL")]}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--heavy", action="store_true", help="include the 10 heavier-edit fixtures")
    ap.add_argument("--max-calls", type=int, default=150)
    ap.add_argument("--report-only", action="store_true", help="replay cache only, no real calls")
    ap.add_argument("--workers", type=int, default=4)
    a = ap.parse_args()
    RES.mkdir(exist_ok=True)
    light, _ = load_cases()
    heavy = load_heavy_cases() if a.heavy else []
    cache, old, budget, model = load_cache(), load_old_cache(), [0 if a.report_only else a.max_calls], resolve_model(MODEL)
    with ThreadPoolExecutor(min(a.workers, 4)) as ex:
        rows = list(ex.map(lambda c: run_case(c, cache, old, budget, model), [*light, *heavy]))
    out = {"light": summarize([r for r in rows if r["case"] in {c.id for c in light}]),
           "heavy": summarize([r for r in rows if r["case"] in {c.id for c in heavy}]) if heavy else None,
           "all": summarize(rows), "rows": rows, "budget_left": budget[0]}
    (RES / "policy_metrics.json").write_text(json.dumps(out, indent=1))
    for k in ("light", "heavy", "all"):
        if out[k]:
            s = out[k]
            print(f"== {k}: cases={s['cases']} errors={len(s['errors'])} calls/case={s['judge_calls_per_case_policy']} real_calls={s['real_calls_this_run']}")
            print("  first-pass only:", s["first_pass_only"])
            print("  policy 2-of-3  :", s["policy_2of3"], "misses", s["misses_policy"])
            print(f"  confirmed claims={s['claims_confirmed']} non-unanimous={s['confirmation_non_unanimous']} overturned={s['flags_overturned_by_vote']}")


if __name__ == "__main__":
    main()
