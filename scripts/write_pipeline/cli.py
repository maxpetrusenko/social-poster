"""python -m scripts.write_pipeline <command> --package P

init, status, next, begin, submit, run, antifp (baseline|rank|try|finish), repair (try|done), finalize, revalidate, rebase, block.
Exit: 0 ok, 1 artifact rejected (fix and resubmit), 2 usage or waiting on an upstream stage, 3 NOT_READY, 4 BLOCKED (retry later),
5 QUARANTINED, 6 FINAL.md was edited after PASS (run revalidate). The CLI has no publish command and never mutates Medium.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

from scripts.medium_review.llm import run_claude

from . import antifp as AF
from . import editguard as G
from . import final as FN
from . import runs as RN
from . import submit as SB
from .core import (BLOCKED, DEPS, DONE, FAILED, KIND, NAMES, NOT_READY, NUM, PENDING, STALE, Pipeline, PipelineError, sha_bytes)

EXIT = {"OK": 0, "INVALID": 1, "USAGE": 2, "WAITING": 2, "NOT_READY": 3, "BLOCKED": 4, "BLOCKED_INPUT": 4, "QUARANTINED": 5}
DEFAULT_FRAMEWORK = Path.home() / "Desktop/Projects/medium-automation/FRAMEWORK.md"

SPEC = {
    "source": "JSON {sources:[{id, kind url|text|transcript|draft|note|author, status captured|blocked, file (captured, under the package), url/captured_at/method (kind url), blocker (blocked)}]}",
    "research": "JSON {research_delta, claims:[{id, claim, status supported|attributed|inference|unresolved, supported_wording, evidence:[{url|source_id, passage, date}]}]}",
    "angle": "JSON {question, reader, angle, verdict adds|summary_only, contributions:[{id, text, kind, evidence_ids}], author_opportunities:[{id, prompt, why}]}",
    "outline": "JSON {sections:[{heading, purpose, evidence_ids}]} (2+ sections, unique headings)",
    "draft": "Markdown starting with '# Title'. Links only from the evidence set; numbers only from sources or evidence; no tables, em dashes or invented experience.",
    "validate": "Markdown plus --report JSON {checked:[...], removals:[{text, reason}]}. Unresolved claims must not appear.",
    "editorial": "Markdown plus --report {unslop:{applied:true, prose_checker:ran|unavailable}, removals:[{text, reason}]}. No link or number may be lost or invented.",
    "voice": "Markdown plus --report {unslop:{...}, removals:[...]}. Meaning must survive (claims gate).",
    "title": "JSON {candidates:[10+ strings], pick, rationale, subtitle (140 chars max)}",
    "images": "JSON {images:[{id, path, purpose, placement hero|after:<heading>|after-paragraph:<n>, method, provenance, license, caption, alt, source_url}], waived_reason}. No presenter or video frames.",
}


def _out(obj) -> None:
    print(json.dumps(obj, indent=1, sort_keys=True, default=str))


def _code(res: dict) -> int:
    if res.get("ok"):
        return 0
    return EXIT.get(res.get("code", "INVALID"), 1)


def load_framework(pipe: Pipeline) -> tuple[str | None, str]:
    fw = pipe.state.get("framework") or {}
    p = Path(fw.get("path", ""))
    try:
        t = p.read_text()
    except OSError:
        return None, f"BLOCKED_FRAMEWORK: cannot read {p}"
    sha = sha_bytes(t.encode())
    if sha != fw.get("sha256"):  # the contract changed: every stage is bound to the old hash, so everything is stale
        pipe.state["framework"] = {**fw, "sha256": sha}
        pipe.log("framework_changed", sha256=sha)
        pipe.save()
    return t, ""


def cmd_init(a) -> int:
    p = Path(a.package).resolve()
    fwp = Path(a.framework or os.environ.get("WRITE_PIPELINE_FRAMEWORK") or DEFAULT_FRAMEWORK)
    try:
        t = fwp.read_text()
    except OSError:
        _out({"ok": False, "code": "BLOCKED", "state": "BLOCKED_FRAMEWORK", "reasons": [f"cannot read the canonical framework at {fwp}"]})
        return 4
    p.mkdir(parents=True, exist_ok=True)
    pipe = Pipeline(p)
    if pipe.initialized:
        _out({"ok": True, "note": "already initialized", "package": str(p)})
        return 0
    pipe.state["slug"] = a.slug or p.name
    pipe.state["framework"] = {"path": str(fwp), "sha256": sha_bytes(t.encode())}
    pipe.save()
    pipe.log("init", framework=str(fwp))
    _out({"ok": True, "package": str(p), "framework_sha256": pipe.state["framework"]["sha256"], "next": "begin source"})
    return 0


def _short(pipe: Pipeline, n: str) -> str:
    r = pipe.rec(n) or {}
    if r.get("reasons"):
        return r["reasons"][0][:110]
    if r.get("stale_reason"):
        return f"stale: {r['stale_reason']}"
    return f"bundle {r['bundle_sha256'][:10]}" if r.get("bundle_sha256") else ""


def cmd_status(pipe: Pipeline, a) -> int:
    rows = [{"n": NUM[n], "stage": n, "kind": KIND[n], "state": pipe.status(n), "note": _short(pipe, n)} for n in NAMES]
    fin = pipe.state.get("final")
    d = {"package": str(pipe.pkg), "overall": pipe.overall(), "published": False, "awaiting_review": bool(pipe.state.get("awaiting_review")),
         "final": fin, "user_modified": pipe.state.get("user_modified"), "critic_rounds": (pipe.state.get("critic") or {}).get("rounds", 0),
         "terminal": pipe.terminal(), "stages": rows}
    if a.json:
        _out(d)
    else:
        print(f"{pipe.overall()}  published=False  final={(fin or {}).get('sha256', '-')[:12]}")
        for r in rows:
            print(f"{r['n']:>2} {r['stage']:<10} {r['kind']:<5} {r['state']:<10} {r['note']}")
        if d["terminal"]:
            print(f"STOP: {d['terminal']['state']} at {d['terminal']['stage']}: {d['terminal']['reason']}")
    return {"USER_MODIFIED": 6, "NOT_READY": 3, "QUARANTINED": 5, "BLOCKED": 4}.get(pipe.overall(), 0)


def cmd_begin(pipe: Pipeline, a) -> int:
    s = a.stage
    st = pipe.status(s)
    if st == DONE:
        _out({"stage": s, "action": "skip", "reason": "cached: inputs and output hashes unchanged", "bundle_sha256": pipe.rec(s)["bundle_sha256"]})
        return 0
    ok, why = pipe.can_run(s)
    if not ok:
        _out({"stage": s, "action": "wait", "reason": why})
        return 2
    ins = {d: (pipe.rec(d) or {}).get("artifact") for d in DEPS[s]}
    hint = f"submit {s} --file F" if KIND[s] == "agent" and s != "repair" else {"antifp": "antifp baseline / try / finish", "repair": "repair try --file F | repair done"}.get(s, f"run {s}")
    _out({"stage": s, "action": "run", "previous_state": st, "reasons": (pipe.rec(s) or {}).get("reasons", []), "inputs": ins, "artifact_spec": SPEC.get(s), "then": hint})
    return 0


def cmd_next(pipe: Pipeline, a) -> int:
    for n in NAMES:
        if pipe.status(n) in (PENDING, STALE, FAILED, BLOCKED) and pipe.can_run(n)[0]:
            _out({"next": n, "state": pipe.status(n), "kind": KIND[n]})
            return 0
    _out({"next": None, "overall": pipe.overall()})
    return 0


def cmd_antifp(pipe: Pipeline, a, runner) -> int:
    if pipe.status("voice") != DONE:
        _out({"ok": False, "code": "WAITING", "reasons": ["the voice stage is not DONE"]})
        return 2
    t = pipe.terminal()
    if t and NUM[t["stage"]] < NUM["antifp"]:
        _out({"ok": False, "code": t["state"], "reasons": [t["reason"]]})
        return 3
    sub = a.sub
    if sub == "baseline":
        _out(AF.baseline(pipe))
        return 0
    if sub == "rank":
        r = AF.baseline(pipe)
        _out({"strongest": r["strongest"], "current_composite": r["current_composite"]})
        return 0
    if sub == "try":
        if not a.file or not a.signal:
            _out({"ok": False, "reasons": ["--file and --signal are required"]})
            return 2
        c = SB.deps_ctx(pipe)
        res = AF.try_edit(pipe, Path(a.file).read_text(), a.signal, runner, c)
        if res.get("blocked"):
            pipe.set("antifp", BLOCKED, reasons=res["reasons"], extra={"category": "MODEL_UNAVAILABLE"})
            pipe.save()
            _out({**res, "code": "BLOCKED"})
            return 4
        _out(res)
        return 0 if res.get("ok") else 1
    res = AF.finish(pipe)
    if not res["ok"]:
        _out(res)
        return 2
    rep = (json.dumps(res["report"], indent=1, sort_keys=True) + "\n").encode()
    if res["heavy"]:
        msg = [f"fingerprint-heavy after the targeted loop: template hits {res['report']['after']['values']['template_hits']:.0f}, composite {res['report']['after']['composite']}; "
               "the draft is generic. Rework it upstream with real author material (see AUTHOR OPPORTUNITIES)"]
        art = pipe.store("antifp", "md", res["text"].encode())
        pipe.set("antifp", NOT_READY, artifact=art, reasons=msg, extra={"report": pipe.store("antifp", "report.json", rep)})
        pipe.save()
        _out({"ok": False, "code": "NOT_READY", "reasons": msg, "report": res["report"]})
        return 3
    out = SB._finish(pipe, "antifp", res["text"].encode(), "md", report=rep)
    _out({**out, "report": res["report"]})
    return 0


def cmd_run(pipe: Pipeline, a, runner, critic) -> int:
    s = a.stage
    if s == "review":
        r = RN.run_review(pipe, runner)
    elif s == "critic":
        fw, err = load_framework(pipe)
        r = RN.run_critic(pipe, critic, fw or "") if fw is not None else {"ok": False, "code": "BLOCKED", "reasons": [err]}
    elif s == "integrity":
        r = FN.run_integrity(pipe, runner)
    elif s == "hash":
        r = FN.run_hash(pipe)
    elif s == "package":
        r = FN.run_package(pipe, runner)
    elif s == "stop":
        r = FN.run_stop(pipe)
    else:
        r = {"ok": False, "code": "USAGE", "reasons": [f"'{s}' is not a run stage (review, critic, integrity, hash, package, stop)"]}
    _out(r)
    return _code(r)


def main(argv: list[str] | None = None, runner=None, critic=None) -> int:
    critic = critic or (lambda prompt: run_claude(prompt, "sonnet"))
    ap = argparse.ArgumentParser(prog="python -m scripts.write_pipeline", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    def pkg(p):
        p.add_argument("--package", required=True, type=Path)
        return p
    i = pkg(sub.add_parser("init"))
    i.add_argument("--slug")
    i.add_argument("--framework")
    s = pkg(sub.add_parser("status"))
    s.add_argument("--json", action="store_true")
    pkg(sub.add_parser("next"))
    pkg(sub.add_parser("begin")).add_argument("stage", choices=NAMES)
    sm = pkg(sub.add_parser("submit"))
    sm.add_argument("stage", choices=NAMES)
    sm.add_argument("--file", required=True, type=Path)
    sm.add_argument("--report", type=Path)
    pkg(sub.add_parser("run")).add_argument("stage", choices=NAMES)
    af = pkg(sub.add_parser("antifp"))
    af.add_argument("sub", choices=("baseline", "rank", "try", "finish"))
    af.add_argument("--file")
    af.add_argument("--signal")
    rp = pkg(sub.add_parser("repair"))
    rp.add_argument("sub", choices=("try", "done"))
    rp.add_argument("--file", type=Path)
    pkg(sub.add_parser("finalize"))
    pkg(sub.add_parser("revalidate"))
    rb = pkg(sub.add_parser("rebase"))
    rb.add_argument("--reason", required=True)
    bl = pkg(sub.add_parser("block"))
    bl.add_argument("stage", choices=NAMES)
    bl.add_argument("--category", default="MODEL_UNAVAILABLE")
    bl.add_argument("--reason", required=True)
    a = ap.parse_args(argv)
    if a.cmd == "init":
        return cmd_init(a)
    try:
        pipe = Pipeline(a.package)
    except PipelineError as e:
        _out({"ok": False, "code": "USAGE", "reasons": [str(e)]})
        return 2
    if not pipe.initialized:
        _out({"ok": False, "code": "USAGE", "reasons": ["package is not initialized: run 'init' first"]})
        return 2
    fw, err = load_framework(pipe)
    if fw is None:
        _out({"ok": False, "code": "BLOCKED", "state": "BLOCKED_FRAMEWORK", "reasons": [err]})
        return 4
    runner = runner or G.make_runner(pipe.pkg / "write-pipeline" / "workspace")
    um = FN.sync_user_edit(pipe)
    if um and a.cmd not in ("status", "revalidate", "rebase"):
        _out({"ok": False, "code": "USER_MODIFIED", "reasons": ["FINAL.md changed after PASS; run 'revalidate' (reruns the affected analysis and the final gate)"], "user_modified": um})
        return 6
    if a.cmd == "status":
        return cmd_status(pipe, a)
    if a.cmd == "next":
        return cmd_next(pipe, a)
    if a.cmd == "begin":
        return cmd_begin(pipe, a)
    if a.cmd == "submit":
        r = SB.submit(pipe, a.stage, a.file, a.report, runner)
        _out(r)
        return _code(r)
    if a.cmd == "run":
        return cmd_run(pipe, a, runner, critic)
    if a.cmd == "antifp":
        return cmd_antifp(pipe, a, runner)
    if a.cmd == "repair":
        if a.sub == "done":
            r = RN.repair_done(pipe)
        elif not a.file:
            r = {"ok": False, "code": "USAGE", "reasons": ["--file is required"]}
        else:
            r = RN.repair_try(pipe, a.file.read_text(), runner)
        _out(r)
        return _code(r)
    if a.cmd == "finalize":
        r = FN.finalize(pipe, runner)
        _out(r)
        if r["ok"]:
            return 0
        return _code(r["results"][r["failed_at"]])
    if a.cmd == "revalidate":
        fwt, _ = load_framework(pipe)
        r = FN.revalidate(pipe, runner, critic, fwt or "")
        _out(r)
        if r.get("ok"):
            return 0
        res = r.get("results", {}).get(r.get("failed_at", ""), r.get("result", r))
        return _code(res) if isinstance(res, dict) and res.get("code") else 1
    if a.cmd == "rebase":
        r = FN.rebase(pipe, a.reason)
        _out(r)
        return 0 if r["ok"] else 2
    pipe.set(a.stage, BLOCKED, reasons=[a.reason], extra={"category": a.category})
    pipe.save()
    _out({"ok": False, "code": "BLOCKED", "stage": a.stage, "category": a.category, "reasons": [a.reason]})
    return 4


if __name__ == "__main__":
    sys.exit(main())
