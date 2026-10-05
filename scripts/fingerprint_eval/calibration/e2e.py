"""End to end held-out measurement through the FULL gate (gate.run_gate: deterministic structure and claim checks, extraction,
claim judge, added-claim check, semantic similarity), real models: `claude -p --model sonnet` (subscription, allowlisted env via
gateway.claude_env) for extraction and judging, the gateway for embeddings.

  doppler run -p api_keys -c dev -- env HTTPS_PROXY= HTTP_PROXY= python -m scripts.fingerprint_eval.calibration.e2e --set 2 --max-calls 200

--set 1: the seen set (calibration/heldout, segment-level fixtures lifted to whole-article finals). --set 2: the unseen set
(calibration/heldout2, labels committed before the first run). One gate run per case; the reference extraction is done once and
copied into every case workspace. Every `claude -p` attempt, failed or not, counts against --max-calls. Rows are appended to
results/e2e.jsonl as they finish, so an interrupted run resumes (`--resume` skips rows that are not ERROR).
"""
from __future__ import annotations

import argparse
import json
import shutil
import tempfile
import threading
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from .. import gate as G
from .. import gateway as GW
from .. import guards as GU
from .. import run as run_mod
from ..extract_cache import ensure_extraction
from ..rewrite import segment_article

MODEL = "claude:sonnet"
THRESHOLD = 0.90  # authz.THRESHOLD
_lock = threading.Lock()
_tl = threading.local()


def load(set_no: int) -> tuple[Path, str, list[tuple[str, str, str, str]]]:
    """(results dir, reference markdown, [(id, label, category, final markdown)])."""
    if set_no == 2:
        from .heldout2.cases import H, load_article, load_cases
        return H / "results", load_article(), [(c.id, c.label, c.category, c.final) for c in load_cases()]
    from .heldout.cases import H, load_cases
    art = (H / "article.md").read_text()
    rows, seen_identity = [], False
    for c in load_cases():
        if c.category == "identity":
            if seen_identity or c.passage != c.reference:  # one byte-identical final; the appended-image case is a structure check, not a claim check
                continue
            seen_identity = True
            rows.append(("i01", "PASS", "identity", art))
            continue
        final = art.replace(c.reference, c.passage)
        assert final != art and art.count(c.reference) == 1, c.id
        rows.append((c.id, c.label, c.category, final))
    return H / "results", art, rows


class Meter:
    def __init__(self, budget: int):
        self.left, self.by_case, self.embeds = budget, Counter(), 0
        self.real_cli = GW.claude_cli
        self.real_embed = GU.embed

    def cli(self, prompt: str, model: str = "sonnet", timeout: int = 300) -> str:
        with _lock:
            if self.left <= 0:
                raise GW.GatewayError("call budget exhausted", dependency="claude-cli")
            self.left -= 1
            self.by_case[getattr(_tl, "case", "(setup)")] += 1
        return self.real_cli(prompt, model, timeout)

    def embed(self, texts: list[str]):
        with _lock:
            self.embeds += 1
        return self.real_embed(texts)


def caught_by(g: dict) -> str:
    if g.get("result") == "ERROR":
        return "error"
    if g.get("result") == "PASS":
        return "none"
    reasons = " | ".join(g.get("reasons", []))
    parts = []
    if "deterministic claim check" in reasons:
        parts.append("claim-det")
    if "claims changed" in reasons:
        parts.append("judge")
    if "added unsupported" in reasons:
        parts.append("added")
    if "frozen blocks" in reasons or "not preserved" in reasons:
        parts.append("structure")
    if "semantic similarity" in reasons:
        parts.append("semantic")
    return "+".join(parts) or "other"


def run_case(cid: str, label: str, cat: str, final: str, ref: str, root: Path, meter: Meter) -> dict:
    _tl.case = cid
    d = root / cid
    shutil.rmtree(d, ignore_errors=True)  # an interrupted earlier attempt of this case leaves a half-written workspace
    (d / "article").mkdir(parents=True)
    (d / "out").mkdir()
    art, draft = d / "article" / "article.md", d / "reference.md"
    art.write_text(final)
    draft.write_text(ref)
    shutil.copyfile(root / "gate-extraction.json", d / "out" / "gate-extraction.json")
    empty = d / "empty"
    empty.mkdir()
    before = meter.by_case[cid]
    rc = G.run_gate(art, draft, empty, empty, d / "out", MODEL, THRESHOLD, MODEL)
    g = json.loads((d / "out" / "gate.json").read_text())
    return {"case": cid, "label": label, "category": cat, "rc": rc, "result": g.get("result"), "evaluated": g.get("evaluated"),
            "caught_by": caught_by(g), "failure_categories": g.get("failure_categories"), "error_category": g.get("error_category"),
            "reasons": [r[:300] for r in g.get("reasons", [])][:4], "claude_calls": meter.by_case[cid] - before}


def confusion(rows: list[dict]) -> dict:
    ok = [r for r in rows if r["result"] in ("PASS", "FAIL")]
    tp = sum(r["label"] == "FAIL" and r["result"] == "FAIL" for r in ok)
    fn = sum(r["label"] == "FAIL" and r["result"] == "PASS" for r in ok)
    fp = sum(r["label"] == "PASS" and r["result"] == "FAIL" for r in ok)
    tn = sum(r["label"] == "PASS" and r["result"] == "PASS" for r in ok)
    return {"TP": tp, "FP": fp, "TN": tn, "FN": fn, "precision": round(tp / (tp + fp), 3) if tp + fp else None, "recall": round(tp / (tp + fn), 3) if tp + fn else None}


def summarize(rows: list[dict]) -> dict:
    per: dict[str, dict] = {}
    for cat in dict.fromkeys(r["category"] for r in rows):
        sub = [r for r in rows if r["category"] == cat]
        per[cat] = {"label": sub[0]["label"], **confusion(sub), "caught_by": dict(Counter(r["caught_by"] for r in sub)),
                    "misses": [r["case"] for r in sub if r["result"] in ("PASS", "FAIL") and (r["result"] == "FAIL") != (r["label"] == "FAIL")]}
    return {"overall": confusion(rows), "per_category": per, "errors": [{k: r[k] for k in ("case", "error_category", "reasons")} for r in rows if r["result"] == "ERROR"],
            "claude_calls": sum(r["claude_calls"] for r in rows)}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--set", type=int, choices=(1, 2), required=True)
    ap.add_argument("--max-calls", type=int, default=200)
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--resume", action="store_true")
    ap.add_argument("--work", type=Path, help="persistent workspace (keeps the reference extraction across resumed invocations)")
    ap.add_argument("--report-only", action="store_true")
    a = ap.parse_args()
    res, ref, cases = load(a.set)
    res.mkdir(exist_ok=True)
    out_path = res / "e2e.jsonl"
    done: dict[str, dict] = {}
    if out_path.exists() and (a.resume or a.report_only):
        done = {r["case"]: r for r in map(json.loads, out_path.read_text().splitlines()) if r["result"] != "ERROR"}
    elif out_path.exists():
        raise SystemExit(f"{out_path} exists; pass --resume (keeps non-ERROR rows) or move it away. Re-running a set is not a fresh measurement.")
    if not a.report_only:
        run_mod.load_gateway_key()
        meter = Meter(a.max_calls)
        GW.claude_cli, GU.embed = meter.cli, meter.embed
        root = a.work or Path(tempfile.mkdtemp(prefix=f"fg-e2e-set{a.set}-"))
        root.mkdir(parents=True, exist_ok=True)
        _tl.case = "(extraction)"
        ensure_extraction(segment_article(ref), ref, MODEL, root / "gate-extraction.json", refresh=False)
        extraction_calls = meter.by_case["(extraction)"]
        todo = [c for c in cases if c[0] not in done]
        mode = "a" if out_path.exists() else "w"
        with ThreadPoolExecutor(a.workers) as ex, out_path.open(mode) as fh:
            for row in ex.map(lambda c: run_case(*c, ref, root, meter), todo):
                done[row["case"]] = row
                fh.write(json.dumps(row) + "\n")
                fh.flush()
                print(row["case"], row["category"], row["label"], row["result"], row["caught_by"], row["claude_calls"], flush=True)
        print(f"extraction calls {extraction_calls}, embed requests {meter.embeds}, budget left {meter.left}")
    rows = [done[c[0]] for c in cases if c[0] in done]
    s = summarize(rows)
    (res / "e2e_metrics.json").write_text(json.dumps(s, indent=1))
    print(json.dumps(s["overall"]))
    for cat, v in s["per_category"].items():
        print(f"{v['label']:4} {cat:14} TP/FP/TN/FN={v['TP']}/{v['FP']}/{v['TN']}/{v['FN']} caught_by={v['caught_by']} misses={v['misses']}")
    print("errors:", s["errors"], "claude calls (cases only):", s["claude_calls"])


if __name__ == "__main__":
    main()
