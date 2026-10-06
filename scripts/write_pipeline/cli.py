"""python -m scripts.write_pipeline <command> --package P

init, status, next, begin, submit, run (brief|review|critic|fpverify|integrity|hash|package|stop), antifp (baseline|rank|try|finish),
repair (try|done), fpverify (measure|try|done), finalize, revalidate, rebase, block.
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
from . import brief as BR
from . import editguard as G
from . import final as FN
from . import fpv as FPV
from . import runs as RN
from . import submit as SB
from . import verify as VF
from .core import (BLOCKED, DEPS, DONE, FAILED, KIND, NAMES, NOT_READY, NUM, PENDING, STALE, Pipeline, PipelineError, fail_exc, contain_input, input_roots, sha_bytes)

from scripts.fingerprint_eval.record import RecordError as R_ERR  # noqa: E402

EXIT = {"OK": 0, "INVALID": 1, "USAGE": 2, "WAITING": 2, "NOT_READY": 3, "BLOCKED": 4, "BLOCKED_INPUT": 4, "QUARANTINED": 5}
DEFAULT_FRAMEWORK = Path.home() / "Desktop/Projects/medium-automation/FRAMEWORK.md"

SPEC = {
    "source": "JSON {sources:[{id, kind url|text|transcript|draft|note|author, status captured|blocked, file (captured, under the package), url/captured_at/method (kind url), blocker (blocked)}]}",
    "research": "JSON {research_delta, claims:[{id, claim, status supported|attributed|inference|unresolved, supported_wording, evidence:[{url|source_id, passage, date}]}]}",
    "angle": "JSON {question, reader, angle, verdict adds|summary_only, contributions:[{id, text, kind, evidence_ids}], author_opportunities:[{id, prompt, why}]}",
    "outline": "JSON {sections:[{heading, purpose, evidence_ids}]} (2+ sections, unique headings)",
    "brief": "run brief (deterministic, no file): the fingerprint and voice brief, 400 words at most. Quote its sha256 as {\"brief_sha256\": ...} in the --report of draft, editorial and voice.",
    "draft": "Markdown starting with '# Title' plus --report {brief_sha256}. Links only from the evidence set; numbers only from sources or evidence; no tables, em dashes or invented experience. Follow the brief targets.",
    "validate": "Markdown plus --report JSON {checked:[{claim_id, verdict}, ...one entry per research claim id, unresolved ones verdict omitted], removals:[{text, reason}]}. An unresolved claim must not be asserted in any wording, verbatim or paraphrased.",
    "editorial": "Markdown plus --report {brief_sha256, unslop:{applied:true, prose_checker:ran|unavailable}, removals:[{text, reason}]}. No link or number may be lost or invented.",
    "voice": "Markdown plus --report {brief_sha256, unslop:{...}, removals:[...]}. Meaning must survive (claims gate).",
    "title": "JSON {candidates:[10+ strings], pick, rationale, subtitle (140 chars max)}",
    "images": "JSON {images:[{id, path, purpose, placement hero|after:<heading>|after-paragraph:<n>, method, provenance, license, caption, alt, source_url}], waived_reason}. No presenter or video frames.",
}


def _out(obj) -> None:
    print(json.dumps(obj, indent=1, sort_keys=True, default=str))


def _code(res: dict) -> int:
    if res.get("ok"):
        return 0
    return EXIT.get(res.get("code", "INVALID"), 1)


def framework_roots() -> tuple[Path, ...]:
    """The configured framework files (default and WRITE_PIPELINE_FRAMEWORK), exactly as resolved, are always allowed."""
    cfg = [DEFAULT_FRAMEWORK] + ([Path(os.environ["WRITE_PIPELINE_FRAMEWORK"])] if os.environ.get("WRITE_PIPELINE_FRAMEWORK") else [])
    return tuple(p.resolve() for p in cfg)


def contain_framework(pkg: Path, path) -> Path:
    return contain_input(pkg, path, exact=framework_roots())


def load_framework(pipe: Pipeline) -> tuple[str | None, str]:
    fw = pipe.state.get("framework")
    if not isinstance(fw, dict) or not isinstance(fw.get("path"), str) or not isinstance(fw.get("sha256"), str):
        pipe.mark_invalid("framework record is malformed")
        return None, "NOT_READY: framework record is malformed"
    try:
        p = contain_framework(pipe.pkg, fw["path"])
        t = p.read_text()
    except PipelineError as e:
        return None, f"BLOCKED_FRAMEWORK: {e}"
    except OSError:
        return None, f"BLOCKED_FRAMEWORK: cannot read {fw['path']}"
    except ValueError as e:  # not UTF-8 text: the framework data is malformed, recorded as NOT_READY
        pipe.mark_invalid(f"framework file is not valid text: {e}")
        return None, "NOT_READY: framework file is not valid text"
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
        fwp = contain_framework(p, fwp)
        t = fwp.read_text()
    except PipelineError as e:
        _out({"ok": False, "code": "BLOCKED", "state": "BLOCKED_FRAMEWORK", "reasons": [str(e)]})
        return 4
    except (OSError, ValueError):
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
    overall = pipe.overall()  # recomputes the final verification from the files; computed once per call
    d = {"package": str(pipe.pkg), "overall": overall, "published": False, "awaiting_review": overall == "READY_FOR_REVIEW",
         "invalid": pipe.state.get("invalid"),
         "final": fin, "user_modified": pipe.state.get("user_modified"), "critic_rounds": (pipe.state.get("critic") or {}).get("rounds", 0),
         "terminal": pipe.terminal(), "stages": rows}
    if a.json:
        _out(d)
    else:
        print(f"{overall}  published=False  final={(fin or {}).get('sha256', '-')[:12]}")
        for r in rows:
            print(f"{r['n']:>2} {r['stage']:<10} {r['kind']:<5} {r['state']:<10} {r['note']}")
        if d["terminal"]:
            print(f"STOP: {d['terminal']['state']} at {d['terminal']['stage']}: {d['terminal']['reason']}")
    return {"USER_MODIFIED": 6, "NOT_READY": 3, "QUARANTINED": 5, "BLOCKED": 4}.get(overall, 0)


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
    hint = f"submit {s} --file F" if KIND[s] == "agent" and s != "repair" else {"antifp": "antifp baseline / try / finish", "repair": "repair try --file F [--report R with removals] | repair done",
                                                                                 "fpverify": "run fpverify | fpverify try --file F --signal S (2 rounds max) | fpverify done"}.get(s, f"run {s}")
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
            _out({"ok": False, "reasons": ["--file and --signal are required (--signal one of " + ", ".join(sorted(AF.WEIGHTS)) + ")"]})
            return 2
        c = SB.deps_ctx(pipe)
        try:
            text = contain_input(pipe.pkg, a.file).read_text()
        except (OSError, ValueError, PipelineError) as e:
            _out({"ok": False, "code": "USAGE", "reasons": [f"cannot read {a.file}: {e}"]})
            return 2
        res = AF.try_edit(pipe, text, a.signal, runner, c)
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
               "the draft is generic. Rework it upstream with real author material (see AUTHOR OPPORTUNITIES); one upstream rework per stage is allowed, a second ends the run"]
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
    if s == "brief":
        r = BR.run_brief(pipe)
    elif s == "fpverify":
        r = FPV.run_fpverify(pipe)
    elif s == "review":
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
        r = {"ok": False, "code": "USAGE", "reasons": [f"'{s}' is not a run stage (brief, review, critic, fpverify, integrity, hash, package, stop)"]}
    _out(r)
    return _code(r)


def cmd_fpverify(pipe: Pipeline, a, runner) -> int:
    if a.sub == "measure":
        r = FPV.view(pipe) if FPV.can_measure(pipe) else {"ok": False, "code": "WAITING", "reasons": ["upstream stage of fpverify is not DONE"]}
        r.pop("report", None)
    elif a.sub == "done":
        r = FPV.finish(pipe)
    else:
        if not a.file or not a.signal:
            r = {"ok": False, "code": "USAGE", "reasons": ["--file and --signal are required (--signal one of " + ", ".join(sorted(FPV.PF.SIGNALS)) + ")"]}
        else:
            try:
                text = contain_input(pipe.pkg, a.file).read_text()
            except (OSError, ValueError, PipelineError) as e:
                r = {"ok": False, "code": "USAGE", "reasons": [f"cannot read {a.file}: {e}"]}
            else:
                r = FPV.try_edit(pipe, text, a.signal, runner)
    _out(r)
    return _code(r) if r.get("code") in EXIT else (0 if r.get("ok") else 1)


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
    rp.add_argument("--report", type=Path, help="repair try: JSON {removals:[{text, reason}]} declaring every deleted sentence")
    fv = pkg(sub.add_parser("fpverify"))
    fv.add_argument("sub", choices=("measure", "try", "done"))
    fv.add_argument("--file", type=Path)
    fv.add_argument("--signal")
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
    except (PipelineError, R_ERR) as e:
        _out({"ok": False, "code": "USAGE", "reasons": [str(e)]})
        return 2
    if not pipe.initialized:
        _out({"ok": False, "code": "USAGE", "reasons": ["package is not initialized: run 'init' first"]})
        return 2
    if pipe.state.get("invalid"):  # a rejected or malformed state stays NOT_READY until a human removes it
        if a.cmd == "status":
            return cmd_status(pipe, a)
        _out({"ok": False, "code": "NOT_READY", "state": "NOT_READY", "reasons": [pipe.state["invalid"].get("reason", "pipeline state is invalid")]})
        return 3
    fw, err = load_framework(pipe)
    if fw is None:
        if pipe.state.get("invalid"):  # persisted: malformed framework data is NOT_READY, not an exception
            _out({"ok": False, "code": "NOT_READY", "state": "NOT_READY", "reasons": [err]})
            return 3
        _out({"ok": False, "code": "BLOCKED", "state": "BLOCKED_FRAMEWORK", "reasons": [err]})
        return 4
    runner = runner or G.make_runner(pipe.pkg / "write-pipeline" / "workspace")
    pipe.final_verifier = VF.make_verifier(runner)
    try:
        rc = _dispatch(a, pipe, runner, critic)
    except Exception as e:  # noqa: BLE001  stage boundary: persist a terminal state instead of escaping with pending state
        stage = getattr(a, "stage", None) or {"antifp": "antifp", "repair": "repair", "fpverify": "fpverify", "finalize": "integrity", "revalidate": "integrity", "rebase": "integrity"}.get(a.cmd)
        if stage is None:
            _out({"ok": False, "code": "USAGE", "reasons": [f"{type(e).__name__}: {str(e)[:200]}"]})
            return 2
        r = fail_exc(pipe, stage, e)
        _out(r)
        rc = _code(r)
    _not_ready_outputs(pipe, a, rc)
    return rc


def _not_ready_outputs(pipe: Pipeline, a, rc: int) -> None:
    """A run that ends NOT_READY gets its PACKAGE.md, FINAL.md and FINAL.html from the CLI itself, with the open findings and a banner."""
    if rc == 0 or a.cmd in ("init", "status", "next", "begin"):
        return
    try:
        if pipe.overall() == "NOT_READY":
            FN.write_not_ready_package(pipe)
    except Exception as e:  # noqa: BLE001  best effort: the verdict is already persisted in state
        pipe.log("not_ready_package_failed", error=f"{type(e).__name__}: {str(e)[:200]}")


def _dispatch(a, pipe: Pipeline, runner, critic) -> int:
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
            try:
                text = contain_input(pipe.pkg, a.file).read_text()
            except (OSError, ValueError, PipelineError) as e:
                r = {"ok": False, "code": "USAGE", "reasons": [f"cannot read {a.file}: {e}"]}
            else:
                rep, bad = None, None
                if a.report:
                    try:
                        rep = json.loads(contain_input(pipe.pkg, a.report).read_text())
                    except (OSError, ValueError, PipelineError) as e:
                        bad = {"ok": False, "code": "USAGE", "reasons": [f"cannot read report {a.report}: {e}"]}
                r = bad or RN.repair_try(pipe, text, runner, rep)
        _out(r)
        return _code(r)
    if a.cmd == "fpverify":
        return cmd_fpverify(pipe, a, runner)
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
        r = FN.rebase(pipe, a.reason, runner)
        _out(r)
        return 0 if r["ok"] else (_code(r) if r.get("code") else 2)
    pipe.set(a.stage, BLOCKED, reasons=[a.reason], extra={"category": a.category})
    pipe.save()
    _out({"ok": False, "code": "BLOCKED", "stage": a.stage, "category": a.category, "reasons": [a.reason]})
    return 4


if __name__ == "__main__":
    sys.exit(main())
