"""Stages 15 to 18 and the post-PASS lifecycle: integrity gate on the exact final bytes, final hash, package, STOP, user edits.

Nothing here publishes. The only calls out are the existing evaluator CLIs (release authorize/verify, medium_review review,
publish_route decide), made through the injectable runner. publish_route is asked for a recommendation only.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from scripts.publish_route.orchestrate import ROUTE_REL, integrity_record_id

from . import editguard as G
from . import frame as FR
from . import linkpolicy as LP
from . import mdlib as M
from .core import (NAMES, BLOCKED, DONE, FAILED, FINAL_NAME, NOT_READY, QUARANTINED, READY_ROUTES, Pipeline, PipelineError, atomic_write, fail_exc, now,
                   safe_path, sha_bytes)
from . import fpv as FPV
from . import report as RP
from .runs import candidate_text, ensure_source_notes, final_text, gate_reference_frame, raw_gate_reference, reference_frame
from .submit import _finish, deps_ctx

REF_REL = Path("write-pipeline") / "frame" / "reference-frame.md"


def _py(*a: str) -> list[str]:
    return [sys.executable, "-m", *a]


def _prepare_binding(pipe: Pipeline, ref_sha: str, cand: str) -> dict:
    """Bind the reference through the evaluator's own mechanism: evals/prepublish-vN.json names it and records its hash."""
    pkg = pipe.pkg
    refp = pkg / REF_REL
    atomic_write(refp, gate_reference_frame(pipe, cand).encode())  # always the pre-rebase reference: the gate must not compare a text to itself
    evals = pkg / "evals"
    nums = sorted(int(p.stem.split("-v")[1]) for p in evals.glob("prepublish-v*.json") if p.stem.split("-v")[-1].isdigit())
    latest = evals / f"prepublish-v{nums[-1]}.json" if nums else None
    bound = False
    if latest:
        try:
            d = json.loads(latest.read_text())
            bound = d.get("articleFile") == str(REF_REL) and d.get("articleSha256") == ref_sha
        except (OSError, ValueError):
            pass
    if not bound:
        n = (nums[-1] + 1) if nums else 1
        atomic_write(evals / f"prepublish-v{n}.json", (json.dumps({"articleFile": str(REF_REL), "articleSha256": ref_sha, "ratedBy": "write_pipeline",
                                                                  "note": "pre-anti-fingerprint reference frame"}, indent=1) + "\n").encode())
    vj = pkg / "version.json"
    try:
        v = json.loads(vj.read_text()) if vj.exists() else {}
    except ValueError:
        v = {}
    prev = {k: v.get(k) for k in ("finalFile", "articleFile")}
    v.setdefault("slug", pkg.name)
    v["finalFile"], v["articleFile"] = FINAL_NAME, str(REF_REL)
    atomic_write(vj, (json.dumps(v, indent=2, ensure_ascii=False) + "\n").encode())
    ensure_source_notes(pipe)  # captured sources plus the evidence ledger: the gate's added-claim check sees what supports a repair-added sentence
    return {"previous_version_json": prev}


def _final_path(pipe: Pipeline) -> Path:
    return safe_path(pipe.pkg, FINAL_NAME)


def _read_final(pipe: Pipeline) -> bytes:
    return _final_path(pipe).read_bytes()


def run_integrity(pipe: Pipeline, runner: G.Runner) -> dict:
    try:
        return _run_integrity(pipe, runner)
    except Exception as e:  # noqa: BLE001  stage boundary
        return fail_exc(pipe, "integrity", e)


def _run_integrity(pipe: Pipeline, runner: G.Runner) -> dict:
    """Runs on every call, on the exact bytes in FINAL.md at this moment. A previous PASS is never reused."""
    ok, why = pipe.can_run("integrity")
    if not ok:
        return {"ok": False, "code": "WAITING", "stage": "integrity", "reasons": [why]}
    cand = final_text(pipe)  # the fingerprint-verified text (fpverify DONE is a dependency of integrity)
    cbytes = cand.encode()
    ref = reference_frame(pipe, cand)  # deterministic guard reference (author-rebased when approved)
    ref_sha = sha_bytes(gate_reference_frame(pipe, cand).encode())  # the evaluator gate always sees the pre-rebase reference
    rec = pipe.rec("integrity")
    if rec and rec["status"] == QUARANTINED and pipe.status("integrity") == QUARANTINED:
        return {"ok": False, "code": "QUARANTINED", "stage": "integrity", "reasons": rec["reasons"]}
    atomic_write(_final_path(pipe), cbytes)
    final_sha = sha_bytes(_read_final(pipe))  # re-read: the gate sees these bytes and no others
    c = deps_ctx(pipe)
    pre = G.edit_guard(ref, _read_final(pipe).decode("utf-8"), known_urls=c["known_urls"], blob_numbers=c["blob_numbers"], strict=True, author_material=c["author_material"], ev=c["ev"])
    # same link policy as the stage gates, against the pre-cut reference: the allowlist of declared removals comes only from the SIGNED removals
    # ledger (a forged, unsigned or state-mismatched list is rejected and never widens what may disappear)
    removals, led_err = LP.signed_removals(pipe.pkg, pipe.state.get("removals_ledger"))
    raw = raw_gate_reference(pipe)
    lp = LP.check_links(raw, _read_final(pipe).decode("utf-8"), removals, c["ev"]) if raw and not (pipe.state.get("rebase") or {}).get("accepted") else {"ok": True, "reasons": [], "categories": [], "removed_urls": []}
    if led_err or not lp["ok"]:
        pre = {"ok": False, "reasons": [*led_err, *lp["reasons"], *pre["reasons"]], "categories": sorted({*pre["categories"], "MISSING_LINK"})}
    elif pre["ok"] and lp["removed_urls"]:
        more, blocked = G.confirm_link_removals(lp, runner, pipe.pkg, _read_final(pipe).decode("utf-8"), pipe.pkg / "write-pipeline" / "work" / "integrity-removed")
        if blocked:
            pipe.set("integrity", BLOCKED, reasons=more, extra={"category": "MODEL_UNAVAILABLE", "final_sha256": final_sha})
            pipe.save()
            return {"ok": False, "code": "BLOCKED", "stage": "integrity", "reasons": more}
        if more:
            pre = {"ok": False, "reasons": more, "categories": ["MISSING_LINK"]}
    if not pre["ok"]:
        msg = ["final bytes differ from the pre-anti-fingerprint reference in a way the gate forbids: " + "; ".join(pre["reasons"])[:400]]
        pipe.set("integrity", NOT_READY, reasons=msg, extra={"categories": pre["categories"], "final_sha256": final_sha})
        pipe.save()
        return {"ok": False, "code": "NOT_READY", "stage": "integrity", "reasons": msg, "categories": pre["categories"]}
    extra = _prepare_binding(pipe, ref_sha, cand)
    rc, out = runner(_py("scripts.fingerprint_eval.release", "authorize", "--package", str(pipe.pkg), "--max-repairs", "0"))
    if rc != 0:
        q = _read(pipe.pkg / "QUARANTINE.json")
        if rc == 3:
            msg = [f"release authorize quarantined the final bytes: {q.get('category')} ({q.get('kind')})"]
            pipe.set("integrity", QUARANTINED, reasons=msg, extra={"final_sha256": final_sha, "quarantine": q})
            pipe.save()
            return {"ok": False, "code": "QUARANTINED", "stage": "integrity", "reasons": msg}
        msg = [f"release authorize could not complete (rc={rc}): {(out or '').strip()[-200:]}"]
        if rc == 4:
            pipe.set("integrity", BLOCKED, reasons=msg, extra={"category": q.get("category", "DEPENDENCY_FAILURE"), "final_sha256": final_sha})
            code = "BLOCKED"
        else:  # a failed final gate is terminal until an explicit rerun or revalidate
            pipe.set("integrity", NOT_READY, reasons=msg, extra={"final_sha256": final_sha})
            code = "NOT_READY"
        pipe.save()
        return {"ok": False, "code": code, "stage": "integrity", "reasons": msg}
    vrc, vout = runner(_py("scripts.fingerprint_eval.release", "verify", "--package", str(pipe.pkg), "--json"))
    try:
        v = json.loads(vout.strip().splitlines()[-1])
    except (ValueError, IndexError):
        v = {}
    now_sha = sha_bytes(_read_final(pipe))
    if vrc != 0 or v.get("valid") is not True or v.get("content_sha256") != now_sha or now_sha != final_sha:
        msg = [f"release verify does not confirm the exact final bytes (rc={vrc}, verified={v.get('content_sha256')!r}, current={now_sha[:12]}): {v.get('reason', '')}"]
        pipe.set("integrity", NOT_READY, reasons=msg, extra={"final_sha256": final_sha})
        pipe.save()
        return {"ok": False, "code": "NOT_READY", "stage": "integrity", "reasons": msg}
    rb = pipe.state.get("rebase") or {}
    rebased = bool(rb.get("accepted") and rb.get("candidate_sha256") == (pipe.state.get("candidate") or {}).get("sha256"))
    art = {"final_sha256": final_sha, "reference_sha256": ref_sha, "gate": "release authorize + verify on the exact FINAL.md bytes", "authorize_rc": rc,
           "verified_content_sha256": v["content_sha256"], "integrity_record_id": integrity_record_id(pipe.pkg), "ran_at": now(),
           "author_rebase": {"claims_gate": rb.get("claims_gate"), "gate_reference_sha256": rb.get("previous_reference_sha256")} if rebased else None}
    pipe.state["final"] = {"sha256": final_sha, "path": FINAL_NAME}
    pipe.state["user_modified"] = None
    main = (json.dumps({k: x for k, x in art.items() if k != "ran_at"}, indent=1, sort_keys=True) + "\n").encode()
    pipe.set("integrity", DONE, bundle=sha_bytes(main), artifact=pipe.store("integrity", "json", main), extra={"final_sha256": final_sha, "ran_at": art["ran_at"],
                                                                                                                   "previous_version_json": (pipe.rec("integrity") or {}).get("previous_version_json") or extra["previous_version_json"]})
    pipe.save()
    return {"ok": True, "stage": "integrity", "final_sha256": final_sha, "cached": False}


def _read(p: Path) -> dict:
    try:
        d = json.loads(p.read_text())
        return d if isinstance(d, dict) else {}
    except (OSError, ValueError):
        return {}


def run_hash(pipe: Pipeline) -> dict:
    try:
        return _run_hash(pipe)
    except Exception as e:  # noqa: BLE001  stage boundary
        return fail_exc(pipe, "hash", e)


def _run_hash(pipe: Pipeline) -> dict:
    ok, why = pipe.can_run("hash")
    if not ok:
        return {"ok": False, "code": "WAITING", "stage": "hash", "reasons": [why]}
    raw = _read_final(pipe)
    sha = sha_bytes(raw)
    want = (pipe.rec("integrity") or {}).get("final_sha256")
    if sha != want:  # terminal: a hash mismatch is never a pending state
        msg = [f"FINAL.md ({sha[:12]}) is not the bytes the integrity gate passed ({str(want)[:12]})"]
        pipe.set("hash", NOT_READY, reasons=msg)
        pipe.save()
        return {"ok": False, "code": "NOT_READY", "stage": "hash", "reasons": msg}
    main = (json.dumps({"final_sha256": sha, "bytes": len(raw), "gate_verified": True}, indent=1) + "\n").encode()
    return _finish(pipe, "hash", main, "json")


def run_package(pipe: Pipeline, runner: G.Runner) -> dict:
    try:
        return _run_package(pipe, runner)
    except Exception as e:  # noqa: BLE001  stage boundary
        return fail_exc(pipe, "package", e)


def _run_package(pipe: Pipeline, runner: G.Runner) -> dict:
    ok, why = pipe.can_run("package")
    if not ok:
        return {"ok": False, "code": "WAITING", "stage": "package", "reasons": [why]}
    fpath = _final_path(pipe)
    sha = sha_bytes(fpath.read_bytes())
    if sha != (pipe.read_json("hash") or {}).get("final_sha256"):
        msg = ["FINAL.md changed after the final hash was recorded"]
        pipe.set("package", NOT_READY, reasons=msg)
        pipe.save()
        return {"ok": False, "code": "NOT_READY", "stage": "package", "reasons": msg}
    # a review and a route recommendation bound to the exact final bytes (the stage 10 review saw the pre-title body)
    rrc, rout = runner(_py("scripts.medium_review", "review", "--package", str(pipe.pkg), "--article", str(fpath), "--json"))
    try:
        review = json.loads(rout[rout.index("{"):rout.rindex("}") + 1])
    except ValueError:
        review = {}
    if rrc != 0 or review.get("status") != "REVIEWED":
        msg = [f"medium review of the final bytes failed (rc={rrc}): {str(review.get('error') or rout)[-200:]}"]
        pipe.set("package", BLOCKED, reasons=msg, extra={"category": "DEPENDENCY_FAILURE"})
        pipe.save()
        return {"ok": False, "code": "BLOCKED", "stage": "package", "reasons": msg}
    drc, dout = runner(_py("scripts.publish_route", "decide", "--package", str(pipe.pkg), "--article", str(fpath), "--json"))
    try:
        route = json.loads(dout[dout.index("{"):dout.rindex("}") + 1])
    except ValueError:
        route = {}
    if not route.get("route_code"):
        msg = [f"publish_route decide returned no route (rc={drc}): {dout.strip()[-200:]}"]
        pipe.set("package", BLOCKED, reasons=msg, extra={"category": "DEPENDENCY_FAILURE"})
        pipe.save()
        return {"ok": False, "code": "BLOCKED", "stage": "package", "reasons": msg}
    if route["route_code"] == "D":  # quarantine route: no package, never READY_FOR_REVIEW
        msg = [f"publish_route returned quarantine route D ({route.get('detail') or route.get('route')}): " + "; ".join(str(x) for x in (route.get("reasons") or []))[:300]]
        pipe.set("package", QUARANTINED, reasons=msg, extra={"route_code": "D"})
        pipe.save()
        return {"ok": False, "code": "QUARANTINED", "stage": "package", "reasons": msg}
    if route["route_code"] not in READY_ROUTES:
        msg = [f"publish_route returned an unknown route code {str(route['route_code'])[:20]!r}: fail closed"]
        pipe.set("package", BLOCKED, reasons=msg, extra={"category": "DEPENDENCY_FAILURE"})
        pipe.save()
        return {"ok": False, "code": "BLOCKED", "stage": "package", "reasons": msg}
    text = fpath.read_text()
    title, _, _ = M.title_subtitle(text)
    (pipe.pkg / "FINAL.html").write_text(FR.to_html(text, title or pipe.state["slug"]))
    pmd = RP.build_package_md(pipe, review, route, sha)
    atomic_write(pipe.pkg / "PACKAGE.md", pmd.encode())
    files = {n: sha_bytes(safe_path(pipe.pkg, n).read_bytes()) for n in (FINAL_NAME, "FINAL.html", "PACKAGE.md")}
    rt = str(ROUTE_REL)
    try:
        files[rt] = sha_bytes(safe_path(pipe.pkg, rt).read_bytes())
    except (OSError, PipelineError):
        files[rt] = None  # route.json missing: tracked as None so the record can never be current
    main = (json.dumps({"files": files, "route_code": route["route_code"], "review_binding": review.get("binding")}, indent=1, sort_keys=True) + "\n").encode()
    return _finish(pipe, "package", main, "json", extra={"external": files})


def run_stop(pipe: Pipeline) -> dict:
    try:
        return _run_stop(pipe)
    except Exception as e:  # noqa: BLE001  stage boundary
        return fail_exc(pipe, "stop", e)


def _run_stop(pipe: Pipeline) -> dict:
    ok, why = pipe.can_run("stop")
    if not ok:
        return {"ok": False, "code": "WAITING", "stage": "stop", "reasons": [why]}
    if pipe.read_json("package").get("route_code") not in READY_ROUTES:
        msg = ["the package route is not an approved review route (quarantine or unknown): READY_FOR_REVIEW is never emitted"]
        pipe.set("stop", QUARANTINED, reasons=msg)
        pipe.save()
        return {"ok": False, "code": "QUARANTINED", "stage": "stop", "reasons": msg}
    bad = pipe.verify_final(before_stop=True)
    if bad:
        msg = ["final verification recomputed from the files failed: " + "; ".join(bad)[:400]]
        pipe.set("stop", NOT_READY, reasons=msg)
        pipe.save()
        return {"ok": False, "code": "NOT_READY", "stage": "stop", "reasons": msg}
    main = (json.dumps({"state": "READY_FOR_REVIEW", "published": False, "note": "stopped for Max's review; nothing was published, scheduled or mutated"}, indent=1) + "\n").encode()
    out = _finish(pipe, "stop", main, "json")
    pipe.state["awaiting_review"] = True
    pipe.save()
    return out


def finalize(pipe: Pipeline, runner: G.Runner) -> dict:
    """integrity, hash, package, stop in order; stops at the first stage that is not DONE."""
    res = {}
    for stage, fn in (("integrity", lambda: run_integrity(pipe, runner)), ("hash", lambda: run_hash(pipe)),
                      ("package", lambda: run_package(pipe, runner)), ("stop", lambda: run_stop(pipe))):
        res[stage] = fn()
        if not res[stage]["ok"]:
            return {"ok": False, "failed_at": stage, "results": res}
    return {"ok": True, "results": res}


# ---- user edits after PASS ---------------------------------------------------------------------------------------
def sync_user_edit(pipe: Pipeline) -> dict | None:
    """If FINAL.md no longer matches the bytes that passed, invalidate everything bound to them. Idempotent."""
    fin = pipe.state.get("final")
    if not fin:
        return None
    p = pipe.pkg / fin["path"]
    cur = sha_bytes(p.read_bytes()) if p.exists() else None
    if cur == fin["sha256"]:
        if pipe.state.get("user_modified") and pipe.state["user_modified"].get("new_sha256") == cur:
            pipe.state["user_modified"] = None
        return None
    um = pipe.state.get("user_modified")
    if um and um.get("new_sha256") == cur:
        return um
    um = {"detected_at": now(), "old_sha256": fin["sha256"], "new_sha256": cur}
    pipe.state["user_modified"] = um
    pipe.state["awaiting_review"] = False
    hit = pipe.invalidate(["integrity", "hash", "package", "stop"], "user_modified")
    um["invalidated"] = hit
    pipe.save()
    return um


def revalidate(pipe: Pipeline, runner: G.Runner, critic, framework_text: str) -> dict:
    """Adopt the edited FINAL.md as the candidate, rerun the affected analysis (critic) and the final gate, then repackage."""
    from .runs import repair_done, run_critic
    um = sync_user_edit(pipe)
    if not um:
        return {"ok": True, "note": "FINAL.md is unchanged since the last PASS; nothing to revalidate"}
    try:
        p = _final_path(pipe)
        if not p.exists():
            return {"ok": False, "code": "INVALID", "reasons": ["FINAL.md is missing"]}
        try:
            text = p.read_bytes().decode("utf-8")
        except UnicodeDecodeError as e:
            msg = [f"FINAL.md is not valid UTF-8 ({e.reason} at byte {e.start}): fix the edit, then rerun 'revalidate'"]
            pipe.set("integrity", NOT_READY, reasons=msg)
            pipe.save()
            return {"ok": False, "code": "NOT_READY", "stage": "integrity", "reasons": msg}
        new = sha_bytes(text.encode())
        q = pipe.pkg / "write-pipeline" / "frame" / f"candidate-user-{new[:8]}.md"
        atomic_write(q, text.encode())
        pipe.state["candidate"] = {"path": str(q.relative_to(pipe.pkg)), "sha256": new, "origin": "user-edit",
                                   "history": [*(pipe.state.get("candidate") or {}).get("history", []), (pipe.state.get("candidate") or {}).get("sha256")]}
        pipe.state["final"] = None  # the old PASS no longer describes any bytes on disk; the critic round budget is NOT reset (it belongs to the run)
        pipe.state["user_modified"] = {**um, "adopted_sha256": new}
        pipe.save()
        c = run_critic(pipe, critic, framework_text)
        if not c["ok"]:
            return {"ok": False, "stage": "critic", "result": c}
        if c.get("majors"):
            return {"ok": False, "stage": "critic", "reasons": ["the critic found major issues in the edited text: use 'repair try' or fix and rerun 'revalidate'"], "result": c}
        r = repair_done(pipe)
        if not r["ok"]:
            return {"ok": False, "stage": "repair", "result": r}
        fp = FPV.finish(pipe)  # re-measure the adopted text against the baseline draft; remaining signals are reported, not blocking
        if not fp["ok"]:
            return {"ok": False, "stage": "fpverify", "result": fp}
        f = finalize(pipe, runner)
        if f["ok"]:
            pipe.state["user_modified"] = None
            pipe.save()
        return f
    except Exception as e:  # noqa: BLE001  stage boundary
        return fail_exc(pipe, "integrity", e)


def rebase(pipe: Pipeline, reason: str, runner: G.Runner) -> dict:
    """The author accepts the edited FINAL.md for the deterministic edit guard. Recorded as an override. It never skips the evaluator:
    the claims/links gate runs here on (previous reference -> edit) and its result is recorded; a FAIL or ERROR refuses the rebase. The
    reference the final gate binds stays the previous one, so the identity shortcut cannot fire, and rebase never marks integrity PASS."""
    if not reason.strip():
        return {"ok": False, "reasons": ["--reason is required"]}
    if (pipe.state.get("candidate") or {}).get("origin") != "user-edit":
        return {"ok": False, "reasons": ["rebase only applies to an author edit adopted by 'revalidate'"]}
    try:
        cand = candidate_text(pipe)
        rec = pipe.rec("images")
        if not rec:
            return {"ok": False, "reasons": ["no frame to rebase"]}
        old_ref = gate_reference_frame(pipe, cand)
        old, new = sha_bytes(old_ref.encode()), sha_bytes(cand.encode())
        base = pipe.pkg / "write-pipeline" / "work" / "rebase"
        atomic_write(base / "candidate" / "article.md", cand.encode())
        atomic_write(base / "reference" / "reference.md", old_ref.encode())
        gate = G.claims_gate(runner, base / "candidate" / "article.md", base / "reference" / "reference.md", base / "gate", pipe.pkg)
        entry = {"at": now(), "kind": "rebase_reference", "by": "author", "reason": reason, "old_reference_sha256": old, "new_reference_sha256": new,
                 "gate_reference_sha256": old, "claims_gate": gate["state"], "claims_gate_categories": gate["categories"], "accepted": gate["state"] == "PASS"}
        pipe.state["overrides"].append(entry)
        if gate["state"] != "PASS":
            pipe.log("rebase_refused", old=old, new=new, gate=gate["state"])
            pipe.save()
            msg = [f"claims/links gate against the previous reference did not pass ({gate['state']}): " + "; ".join(gate["reasons"])[:300]
                   + " A claim or link change needs the upstream stages, not a rebase."]
            return {"ok": False, "code": "BLOCKED" if gate["state"] == "ERROR" else "NOT_READY", "reasons": msg, "claims_gate": gate["state"]}
        rp = pipe.pkg / "write-pipeline" / "frame" / f"rebased-reference-{new[:8]}.md"
        atomic_write(rp, cand.encode())
        pipe.state["rebase"] = {"accepted": True, "path": str(rp.relative_to(pipe.pkg)), "new_reference_sha256": new, "previous_reference_sha256": old,
                                "candidate_sha256": new, "claims_gate": gate["state"], "at": entry["at"]}
        pipe.invalidate(["integrity", "hash", "package", "stop"], "reference_rebased")
        pipe.log("rebase", old=old, new=new, reason=reason, claims_gate=gate["state"])
        pipe.save()
        return {"ok": True, "old_reference_sha256": old, "new_reference_sha256": new, "claims_gate": gate["state"],
                "note": "the final gate still runs against the previous reference; run finalize"}
    except Exception as e:  # noqa: BLE001  stage boundary
        return fail_exc(pipe, "integrity", e)


# ---- NOT_READY output ---------------------------------------------------------------------------------------------
def best_text(pipe: Pipeline) -> str:
    """The most advanced article text the run has: the final candidate when it exists, else the antifp loop's best kept candidate, else the
    latest stage artifact. May be stale."""
    try:
        t = final_text(pipe)
        if t.strip():
            return t
    except (PipelineError, OSError, ValueError):
        pass
    if pipe.status("antifp") != DONE:  # the loop's current.md is the best accepted candidate so far (baseline or a gated, kept edit)
        try:
            from . import antifp as AF
            loop = AF._loop(pipe)
            return AF._current(pipe, loop) if loop else ""
        except Exception:  # noqa: BLE001  fall through to the stage artifacts
            pass
    for n in ("fpverify", "antifp", "voice", "editorial", "validate", "draft"):
        try:
            t = pipe.read_art(n)
        except (PipelineError, OSError, ValueError):
            t = None
        if t and t.strip():
            return t
    return ""


def _safe(fn, default):
    try:
        return fn()
    except Exception as e:  # noqa: BLE001  every NOT_READY output is independent: one failing writer never costs the others
        return default(e) if callable(default) else default


def _fallback_package(pipe: Pipeline, text: str, reasons: list[str], final_sha: str, err: Exception) -> str:
    """Minimal PACKAGE.md with every required section, used only if the full builder raised."""
    body = [f"# Review package: {pipe.state.get('slug')}", "", "NOT READY. This run ended without a verified article. Nothing was published, scheduled or changed on Medium.", ""]
    for k in RP.SECTIONS:
        lines = ["- not reached or not available (the full report could not be built: " + f"{type(err).__name__}: {str(err)[:120]})"]
        if k == "ARTICLE":
            lines = ["- file: FINAL.md (rendered copy: FINAL.html); both carry a NOT READY banner", f"- words: {len(text.split())}"]
        elif k == "EXACT FINAL HASH":
            lines = [f"- FINAL.md sha256: {final_sha}", *[f"- stage {n}: {(pipe.rec(n) or {}).get('status')}" for n in NAMES if pipe.rec(n)]]
        elif k == "READY/NOT_READY":
            lines = ["- NOT_READY. Do not publish. FINAL.md and FINAL.html carry a NOT READY banner.", *[f"- reason: {r}" for r in reasons]]
        body += [f"## {RP.HEADINGS.get(k, k)}", "", *lines, ""]
    return "\n".join(body) + "\n"


def write_not_ready_package(pipe: Pipeline) -> dict | None:
    """Written by the CLI itself whenever a run ends NOT_READY, at any stage: PACKAGE.md (reasons, the open findings, every required section with
    'not reached' where a stage did not run), FINAL.md and FINAL.html carrying a NOT READY banner. The text is the best accepted candidate so far.
    A run that already passed the final gate keeps its FINAL.md bytes; only a missing PACKAGE.md is written for it."""
    if pipe.state.get("invalid"):
        return None
    t = pipe.terminal() or {}
    reasons = [f"{t.get('stage', 'pipeline')}: {t.get('reason')}"] if t else ["the run is NOT_READY"]
    banner = f"Do not publish. This article did not pass the pipeline ({reasons[0][:200]})."
    kept_final = bool(pipe.state.get("final")) and (pipe.pkg / FINAL_NAME).exists()
    if kept_final:
        text = _safe(lambda: (pipe.pkg / FINAL_NAME).read_text(), "")
        body = text
    else:
        text = _safe(lambda: best_text(pipe), "")
        body = f"> NOT READY. {banner}\n\n{text}"
    written = {}
    if not kept_final:
        written["final"] = _safe(lambda: (atomic_write(pipe.pkg / FINAL_NAME, body.encode()), FINAL_NAME)[1], None)
        title = _safe(lambda: M.title_subtitle(text)[0], None)
        written["html"] = _safe(lambda: (atomic_write(pipe.pkg / "FINAL.html", FR.to_html(text, title or pipe.state["slug"], banner=banner).encode()), "FINAL.html")[1], None)
    if kept_final and (pipe.pkg / "PACKAGE.md").exists():
        return written  # nothing bound to the passed bytes is ever rewritten
    final_sha = sha_bytes(body.encode())
    pmd = _safe(lambda: RP.build_package_md(pipe, None, None, final_sha, verdict="NOT_READY", reasons=reasons, text=text), lambda e: _fallback_package(pipe, text, reasons, final_sha, e))
    written["package"] = _safe(lambda: (atomic_write(pipe.pkg / "PACKAGE.md", pmd.encode()), "PACKAGE.md")[1], None)
    pipe.log("not_ready_package", reasons=reasons)
    return written
