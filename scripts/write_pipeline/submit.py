"""Submit and validate the artifact of an agent-run stage; run the review stage. Returns plain dicts, never raises on bad input."""
from __future__ import annotations

import json
from pathlib import Path

from . import editguard as G
from . import frame as FR
from . import mdlib as M
from . import validators as V
from .core import BLOCKED, DONE, FAILED, KIND, NOT_READY, Pipeline, atomic_write, sha_bytes, sha_json

JSON_STAGES = {"source": "json", "research": "json", "angle": "json", "outline": "json", "title": "json", "images": "json"}
TEXT_STAGES = {"draft": "md", "validate": "md", "editorial": "md", "voice": "md"}


def deps_ctx(pipe: Pipeline) -> dict:
    src = pipe.read_json("source")
    ev = pipe.read_json("research")
    blob = V.source_blob(src, pipe.pkg) if src else ""
    return {"src": src, "ev": ev, "known_urls": V.known_urls(src, ev), "blob_numbers": V.blob_numbers(blob, ev),
            "author_material": G.has_author_material(src), "blob": blob}


def _fail(pipe: Pipeline, stage: str, reasons: list[str], code: str = "INVALID") -> dict:
    pipe.set(stage, FAILED, reasons=reasons)
    pipe.save()
    return {"ok": False, "code": code, "stage": stage, "reasons": reasons}


def _finish(pipe: Pipeline, stage: str, main: bytes, ext: str, extra_bundle: bytes = b"", report: bytes | None = None, extra: dict | None = None) -> dict:
    bundle = sha_bytes(sha_bytes(main).encode() + sha_bytes(report or b"").encode() + extra_bundle)
    prev = pipe.rec(stage)
    if prev and pipe.status(stage) == DONE and prev.get("bundle_sha256") == bundle and prev.get("inputs") == pipe.input_shas(stage):
        return {"ok": True, "cached": True, "stage": stage, "bundle_sha256": bundle}
    art = pipe.store(stage, ext, main)
    ex = dict(extra or {})
    if report is not None:
        ex["report"] = pipe.store(stage, "report.json", report)
    pipe.set(stage, DONE, bundle=bundle, artifact=art, extra=ex)
    pipe.save()
    return {"ok": True, "cached": False, "stage": stage, "bundle_sha256": bundle, "artifact": art}


def _json(path: Path) -> tuple[dict | None, str]:
    try:
        d = json.loads(Path(path).read_text())
    except (OSError, ValueError) as e:
        return None, f"not valid JSON: {e}"
    return (d, "") if isinstance(d, dict) else (None, "JSON must be an object")


def submit(pipe: Pipeline, stage: str, file: Path, report: Path | None, runner: G.Runner) -> dict:
    ok, why = pipe.can_run(stage)
    if not ok:
        return {"ok": False, "code": "WAITING", "stage": stage, "reasons": [why]}
    if KIND[stage] != "agent" or stage == "repair":
        return {"ok": False, "code": "USAGE", "stage": stage, "reasons": [f"stage '{stage}' is not submitted; use its run command"]}
    try:
        raw = Path(file).read_bytes()
    except OSError as e:
        return {"ok": False, "code": "USAGE", "stage": stage, "reasons": [f"cannot read {file}: {e}"]}
    rep_raw, rep = None, None
    if report is not None:
        try:
            rep_raw = Path(report).read_bytes()
        except OSError as e:
            return {"ok": False, "code": "USAGE", "stage": stage, "reasons": [f"cannot read report {report}: {e}"]}
        rep, err = _json(report)
        if rep is None:
            return _fail(pipe, stage, [f"report {err}"])
    c = deps_ctx(pipe)
    if stage in JSON_STAGES:
        data, err = _json(file)
        if data is None:
            return _fail(pipe, stage, [err])
        return _json_stage(pipe, stage, data, c)
    text = raw.decode("utf-8", "replace")
    return _text_stage(pipe, stage, text, rep, rep_raw, c, runner)


def _json_stage(pipe: Pipeline, stage: str, data: dict, c: dict) -> dict:
    extra: dict = {}
    if stage == "source":
        r = V.sources(data, pipe.pkg)
        if r.get("blocked"):
            pipe.set(stage, BLOCKED, reasons=r["reasons"], extra={"category": r["blocked"]})
            pipe.save()
            return {"ok": False, "code": r["blocked"], "stage": stage, "reasons": r["reasons"]}
    elif stage == "research":
        r = V.evidence(data, c["src"])
    elif stage == "angle":
        r = V.angle(data, c["ev"], c["src"])
    elif stage == "outline":
        r = V.outline(data, c["ev"])
    elif stage == "title":
        r = V.titles(data, M.body_without_frame(pipe.read_art("antifp") or ""))
    else:  # images
        body = M.body_without_frame(pipe.read_art("antifp") or "")
        r = V.images(data, pipe.pkg, body)
        if r["ok"]:
            t = pipe.read_json("title")
            imgs = data.get("images") or []
            cand = FR.assemble(pipe.read_art("antifp") or "", t["pick"], t["subtitle"], imgs)
            refframe = FR.assemble(pipe.read_art("voice") or "", t["pick"], t["subtitle"], imgs)
            lint = M.lint_v6(cand)
            if lint:
                r = {"ok": False, "reasons": lint}
            else:
                pipe.state["candidate"] = {"path": str(pipe.store("images", "candidate.md", cand.encode())), "sha256": sha_bytes(cand.encode()), "origin": "frame"}
                pipe.state["critic"] = {"rounds": 0, "history": [], "repair_rejected": 0}
                extra = {"candidate_sha256": sha_bytes(cand.encode()), "reference_frame": pipe.store("images", "reference-frame.md", refframe.encode()),
                         "reference_frame_sha256": sha_bytes(refframe.encode())}
    if not r["ok"]:
        return _fail(pipe, stage, r["reasons"])
    data = r.get("data", data)
    main = (json.dumps(data, indent=1, sort_keys=True) + "\n").encode()
    out = _finish(pipe, stage, main, "json", extra_bundle=sha_json(extra).encode(), extra=extra)
    if r.get("terminal") and not out.get("cached"):
        pipe.set(stage, NOT_READY, reasons=[r["terminal"][1]], extra={"artifact": out["artifact"]})
        pipe.save()
        return {"ok": False, "code": "NOT_READY", "stage": stage, "reasons": [r["terminal"][1]],
                "author_opportunities": data.get("author_opportunities", [])}
    if r.get("terminal"):
        return {"ok": False, "code": "NOT_READY", "stage": stage, "reasons": [r["terminal"][1]]}
    return out


PREV = {"validate": "draft", "editorial": "validate", "voice": "editorial"}


def _text_stage(pipe: Pipeline, stage: str, text: str, rep: dict | None, rep_raw: bytes | None, c: dict, runner: G.Runner) -> dict:
    reasons = V.text_basic(text, src=c["src"], urls=c["known_urls"])
    reasons += V.unsupported_numbers(text, c["blob_numbers"] + M.significant_numbers(pipe.read_art(PREV.get(stage, "")) or ""))
    if stage == "draft":
        heads = {M.norm(b.text.lstrip("# ").strip()) for b in M.blocks(text) if b.kind == "heading"}
        want = [M.norm(s.get("heading", "")) for s in pipe.read_json("outline").get("sections", [])]
        miss = [w for w in want if w not in heads]
        if want and len(miss) / len(want) > 0.4:
            reasons.append(f"draft does not follow the outline: missing headings {miss[:3]}")
    if stage == "validate":
        if rep is None:
            reasons.append("the validate stage needs --report (factual report JSON with a 'checked' list)")
        else:
            reasons += V.factual_report(rep, text, c["ev"])
    if stage in ("editorial", "voice"):  # the unslop gate is attested by the agent; the CLI cannot run it, but it will not proceed without the statement
        u = (rep or {}).get("unslop") or {}
        if u.get("applied") is not True or u.get("prose_checker") not in ("ran", "unavailable"):
            reasons.append("--report must attest the unslop gate: {\"unslop\": {\"applied\": true, \"prose_checker\": \"ran\" | \"unavailable\"}}")
    removals = (rep or {}).get("removals") if stage in ("validate", "editorial", "voice") else None
    if stage in PREV:
        g = G.edit_guard(pipe.read_art(PREV[stage]) or "", text, known_urls=c["known_urls"], blob_numbers=c["blob_numbers"], strict=False,
                         removals=removals if isinstance(removals, list) else [], author_material=c["author_material"])
        reasons += g["reasons"]
    if reasons:
        return _fail(pipe, stage, reasons)
    if stage in ("editorial", "voice"):  # the evaluator's claim judge: meaning must survive the pass (only claim categories block here)
        prev = pipe.read_art(PREV[stage]) or ""
        base = pipe.pkg / "write-pipeline" / "work" / stage
        atomic_write(base / "candidate" / "article.md", text.encode())
        atomic_write(base / "reference" / "reference.md", prev.encode())
        gate = G.claims_gate(runner, base / "candidate" / "article.md", base / "reference" / "reference.md", base / "gate", pipe.pkg)
        if gate["state"] == "ERROR":
            msg = [f"claims gate could not evaluate the {stage} pass (retry later): " + "; ".join(gate["reasons"])[:200]]
            pipe.set(stage, BLOCKED, reasons=msg, extra={"category": "MODEL_UNAVAILABLE"})
            pipe.save()
            return {"ok": False, "code": "BLOCKED", "stage": stage, "reasons": msg}
        if gate["state"] == "FAIL" and set(gate["categories"]) & G.CLAIM_CATS:
            return _fail(pipe, stage, [f"{stage} pass changed meaning: " + "; ".join(gate["reasons"])[:300]])
    return _finish(pipe, stage, text.encode(), "md", report=rep_raw)
