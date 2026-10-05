"""The dry-run cases. Each takes a Ctx and returns (expected, actual): `expected` is a list of acceptable outcome dicts
(more than one only where the spec allows healed-or-blocked), `actual` the observed dict. A case passes iff actual is in expected.
"""
from __future__ import annotations

import json

from . import sandbox as S
from .context import Ctx
from .guardrig import CLICK, NAV, PASTE, PUBLISH_CLICK

LINK_MUT = {"MISSING_LINK", "STRUCTURAL_DAMAGE"}
BAD_REPAIRER = {"FINGERPRINT_EVAL_REPAIRER": "scripts.fingerprint_eval.repair:FaultyRepairer", "FINGERPRINT_EVAL_TEST_MODE": "1"}


def _authorize_and_guard(c: Ctx, pkg, input_sha: str, **kw) -> dict:
    """authorize, verify, then nav + paste through the guard. Common outcome shape for the mutation cases."""
    a = c.code("authorize", c.runner.authorize(pkg, **kw))
    v = c.code("verify", c.runner.verify(pkg))
    nav, paste = c.paste_flow(pkg)
    h = c.auth_hash(pkg)
    c.hash("authorized", h)
    c.hash("input", input_sha)
    return {"authorize_exit": a, "hash_changed": bool(h) and h != input_sha, "verify_exit": v, "guard_nav": nav, "guard_paste": paste}


HEALED = {"authorize_exit": 0, "hash_changed": True, "verify_exit": 0, "guard_nav": "allow", "guard_paste": "allow"}
BLOCKED = {"authorize_exit": 3, "hash_changed": False, "verify_exit": 1, "guard_nav": "block", "guard_paste": "block"}


# 1 -----------------------------------------------------------------------------------------------------------------
def normal(c: Ctx):
    pkg = c.package()
    h0 = S.sha(c.final_bytes(pkg))
    c.hash("source_final", h0)
    a = c.code("authorize", c.runner.authorize(pkg))
    vr = c.runner.verify(pkg)
    v = c.code("verify", vr)
    st = c.runner.status(pkg)
    c.code("status", st)
    states = st.json().get("states", {})
    rel = c.release_bytes(pkg)
    nav = c.rig.decide("navigate medium.com/new-story", NAV)
    pre = c.rig.decide("click before any paste receipt", CLICK)
    paste = c.rig.paste_with("paste (clipboard = release bytes)", rel or b"", PASTE)
    after = c.rig.decide("click after the receipt", CLICK)
    pub = c.rig.decide("publish click after verified paste (simulated Medium publish authorization; STOP, nothing sent)", PUBLISH_CLICK)
    c.hash("authorized", c.auth_hash(pkg))
    return [{"authorize_exit": 0, "verify_exit": 0, "verified_hash_is_source": True, "status_authorized": True, "release_equals_final": True,
             "guard_nav": "allow", "guard_click_before_paste": "block", "guard_paste": "allow", "guard_click_after_receipt": "allow",
             "guard_publish_click": "allow"}], {
        "authorize_exit": a, "verify_exit": v, "verified_hash_is_source": vr.json().get("content_sha256") == h0,
        "status_authorized": bool(states.get("authorized")), "release_equals_final": rel == c.final_bytes(pkg),
        "guard_nav": nav["decision"], "guard_click_before_paste": pre["decision"], "guard_paste": paste["decision"],
        "guard_click_after_receipt": after["decision"], "guard_publish_click": pub["decision"]}


# 2 -----------------------------------------------------------------------------------------------------------------
def missing_link(c: Ctx):
    pkg = c.package()
    _, h = S.edit_final(pkg, S.remove_one_link)
    actual = _authorize_and_guard(c, pkg, h)
    c.note("categories", sorted({str(x["category"]) for x in c.cycles(pkg)}))
    return [HEALED, BLOCKED], actual


# 3 -----------------------------------------------------------------------------------------------------------------
def altered_number(c: Ctx):
    pkg = c.package()
    info = {}

    def mut(md):
        new, before, after = S.alter_number(md)
        info.update(before=before, after=after)
        return new

    _, h = S.edit_final(pkg, mut)
    c.note("sentence_before", info["before"])
    c.note("sentence_after", info["after"])
    actual = _authorize_and_guard(c, pkg, h)
    rel = (c.release_bytes(pkg) or b"").decode()
    actual["claim_restored"] = bool(rel) and info["before"] in rel and info["after"] not in rel
    return [{**HEALED, "claim_restored": True}, {**BLOCKED, "claim_restored": False}], actual


# 4 -----------------------------------------------------------------------------------------------------------------
def deleted_section(c: Ctx):
    pkg = c.package()
    info = {}

    def mut(md):
        new, heading = S.delete_middle_section(md)
        info["heading"] = heading
        return new

    _, h = S.edit_final(pkg, mut)
    c.note("deleted_heading", info["heading"])
    actual = _authorize_and_guard(c, pkg, h)
    actual["section_restored"] = info["heading"] in (c.release_bytes(pkg) or b"").decode()
    return [{**HEALED, "section_restored": True}], actual


# 5 -----------------------------------------------------------------------------------------------------------------
def modify_after_pass(c: Ctx):
    pkg = c.package()
    a1 = c.code("authorize_1", c.runner.authorize(pkg))
    v1 = c.code("verify_1", c.runner.verify(pkg))
    h1 = c.auth_hash(pkg)
    old_release = c.release_bytes(pkg)
    _, h_mod = S.edit_final(pkg, lambda t: t.rstrip("\n") + "\n\nOne more thought added after approval.\n")
    v2 = c.code("verify_after_edit", c.runner.verify(pkg))
    nav_b = c.rig.decide("navigate after the edit (stale authorization)", NAV)
    paste_b = c.rig.paste_with("paste old release bytes after the edit", old_release or b"", PASTE)
    a2 = c.code("authorize_2", c.runner.authorize(pkg))
    v3 = c.code("verify_2", c.runner.verify(pkg))
    h2 = c.auth_hash(pkg)
    c.hash("first_authorized", h1)
    c.hash("modified", h_mod)
    c.hash("second_authorized", h2)
    nav_a, paste_a = c.paste_flow(pkg, "re-authorized: ")
    return [{"authorize_1": 0, "verify_1": 0, "verify_after_edit": 1, "guard_nav_stale": "block", "guard_paste_stale": "block",
             "authorize_2": 0, "new_hash": True, "verify_2": 0, "guard_nav_new": "allow", "guard_paste_new": "allow"}], {
        "authorize_1": a1, "verify_1": v1, "verify_after_edit": v2, "guard_nav_stale": nav_b["decision"], "guard_paste_stale": paste_b["decision"],
        "authorize_2": a2, "new_hash": bool(h2) and h2 != h1, "verify_2": v3, "guard_nav_new": nav_a, "guard_paste_new": paste_a}


# 6 -----------------------------------------------------------------------------------------------------------------
def missing_artifact(c: Ctx):
    pkg = c.package()
    a = c.code("authorize", c.runner.authorize(pkg))
    (pkg / "release/medium-final.md").unlink()
    v1 = c.code("verify_no_article", c.runner.verify(pkg))
    nav1 = c.rig.decide("navigate, release article deleted", NAV)
    paste1 = c.rig.paste_with("paste final bytes, release article deleted", c.final_bytes(pkg), PASTE)
    (pkg / "release/authorization.json").unlink()
    v2 = c.code("verify_no_auth", c.runner.verify(pkg))
    nav2 = c.rig.decide("navigate, authorization also deleted", NAV)
    return [{"authorize_exit": 0, "verify_no_article": 1, "guard_nav_no_article": "block", "guard_paste_no_article": "block",
             "verify_no_auth": 1, "guard_nav_no_auth": "block"}], {
        "authorize_exit": a, "verify_no_article": v1, "guard_nav_no_article": nav1["decision"], "guard_paste_no_article": paste1["decision"],
        "verify_no_auth": v2, "guard_nav_no_auth": nav2["decision"]}


# 7 -----------------------------------------------------------------------------------------------------------------
def artifact_for_other_hash(c: Ctx):
    import shutil

    from scripts.fingerprint_eval import authz, release
    a_pkg, b_pkg = c.package("pkg-a"), c.package("pkg-b")
    a = c.code("authorize_a", c.runner.authorize(a_pkg))
    _, hb = S.edit_final(b_pkg, lambda t: t.rstrip("\n") + "\n\nA different ending.\n")
    shutil.copytree(a_pkg / "release", b_pkg / "release")  # B carries A's release article and authorization
    with c.runner.env():  # point the signed ACTIVE selector at B the way `release authorize` would
        release.write_active(authz.resolve_package(b_pkg), hb)
    vb = c.code("verify_b", c.runner.verify(b_pkg))
    nav = c.rig.decide("navigate, ACTIVE names package B holding A's authorization", NAV)
    paste = c.rig.paste_with("paste A's release bytes", (a_pkg / "release/medium-final.md").read_bytes(), PASTE)
    (a_pkg / "release/medium-final.md").write_text("tampered\n")
    va = c.code("verify_a_tampered", c.runner.verify(a_pkg))
    c.hash("b_final", hb)
    c.hash("a_authorized", c.auth_hash(a_pkg))
    return [{"authorize_a": 0, "verify_b": 1, "guard_nav": "block", "guard_paste": "block", "verify_a_tampered": 1}], {
        "authorize_a": a, "verify_b": vb, "guard_nav": nav["decision"], "guard_paste": paste["decision"], "verify_a_tampered": va}


# 8 -----------------------------------------------------------------------------------------------------------------
def obsolete_evaluator(c: Ctx):
    import shutil
    pkg = c.package()
    a1 = c.code("authorize_1", c.runner.authorize(pkg))
    auth = pkg / "release/authorization.json"
    shutil.copyfile(auth, pkg / "release/authorization.orig.json")  # untouched copy kept as evidence
    d = json.loads(auth.read_text())
    real_id = d["binding"]["evaluator_id"]
    d["binding"]["evaluator_id"] = "0" * 40  # pretend the authorization came from an older evaluator
    auth.write_text(json.dumps(d))
    vr = c.runner.verify(pkg)
    v = c.code("verify_forged_id", vr)
    nav = c.rig.decide("navigate, authorization names an obsolete evaluator id", NAV)
    paste = c.rig.paste_with("paste release bytes, obsolete evaluator id", c.release_bytes(pkg) or b"", PASTE)
    a2 = c.code("authorize_2", c.runner.authorize(pkg))
    v2 = c.code("verify_2", c.runner.verify(pkg))
    new_id = json.loads(auth.read_text())["binding"]["evaluator_id"]
    c.note("evaluator_id_real", real_id)
    c.note("verify_reason_forged", vr.json().get("reason"))
    return [{"authorize_1": 0, "verify_forged_id": 1, "guard_nav": "block", "guard_paste": "block", "authorize_2": 0,
             "rerun_binds_real_id": True, "verify_2": 0}], {
        "authorize_1": a1, "verify_forged_id": v, "guard_nav": nav["decision"], "guard_paste": paste["decision"], "authorize_2": a2,
        "rerun_binds_real_id": new_id == real_id != "0" * 40, "verify_2": v2}


# 9 -----------------------------------------------------------------------------------------------------------------
def gateway_unavailable(c: Ctx):
    pkg = c.package()
    h0 = S.sha(c.final_bytes(pkg))
    faults = []
    if c.offline:  # the e2e fakes cannot honour LLM_GATEWAY_URL, so the outage is scripted at the same seam
        from scripts.fingerprint_eval.tests.e2e.fakes import Fault
        faults = [Fault("chat", "refused", times=None), Fault("embed", "refused", times=None)]
    a = c.code("authorize", c.runner.authorize(pkg, env={"LLM_GATEWAY_URL": "http://gateway.unroutable.invalid/v1"}, faults=faults))
    v = c.code("verify", c.runner.verify(pkg))
    nav, paste = c.paste_flow(pkg)
    q = c.quarantine(pkg) or {}
    unchanged = S.sha(c.final_bytes(pkg)) == h0
    c.hash("final_before", h0)
    c.hash("final_after", S.sha(c.final_bytes(pkg)))
    c.note("quarantine", {k: q.get(k) for k in ("category", "kind", "retryable")})
    c.note("simulation", "scripted refusals on gateway chat+embed" if c.offline else "LLM_GATEWAY_URL=http://gateway.unroutable.invalid/v1")
    return [{"authorize_exit": 4, "quarantine_kind": "infra", "release_files": [], "verify_exit": 1, "guard_nav": "block",
             "guard_paste": "block", "article_bytes_unchanged": True, "no_healed_files": True}], {
        "authorize_exit": a, "quarantine_kind": q.get("kind"), "release_files": c.release_files(pkg), "verify_exit": v,
        "guard_nav": nav, "guard_paste": paste, "article_bytes_unchanged": unchanged and not _healed(pkg),
        "no_healed_files": not _healed(pkg)}


def _healed(pkg) -> list:
    return sorted(p.name for p in pkg.glob("article-healed-*.md"))


# 10 ----------------------------------------------------------------------------------------------------------------
def style_only(c: Ctx):
    from scripts.fingerprint_eval.tests.e2e.injectors import style_only as mutate
    pkg = c.package()
    _, h = S.edit_final(pkg, mutate)
    a = c.code("authorize", c.runner.authorize(pkg))
    v = c.code("verify", c.runner.verify(pkg))
    rec = c.last_record(pkg) or {}
    nav, paste = c.paste_flow(pkg)
    c.hash("input", h)
    c.hash("authorized", c.auth_hash(pkg))
    c.note("advisory", rec.get("advisory"))
    return [{"authorize_exit": 0, "heal_cycles": 0, "result": "PASS", "advisory_present": True, "verify_exit": 0, "guard_nav": "allow",
             "guard_paste": "allow", "released_hash_is_input": True}], {
        "authorize_exit": a, "heal_cycles": len(c.cycles(pkg)), "result": rec.get("result"), "advisory_present": bool(rec.get("advisory")),
        "verify_exit": v, "guard_nav": nav, "guard_paste": paste, "released_hash_is_input": c.auth_hash(pkg) == h}


# 11 ----------------------------------------------------------------------------------------------------------------
def unsupported_claim(c: Ctx):
    pkg = c.package()
    _, h = S.edit_final(pkg, S.add_unsupported_section)
    a = c.code("authorize", c.runner.authorize(pkg))
    v = c.code("verify", c.runner.verify(pkg))
    nav, paste = c.paste_flow(pkg)
    q = c.quarantine(pkg) or {}
    c.hash("input", h)
    c.note("quarantine_category", q.get("category"))
    return [{"authorize_exit": 3, "quarantine_status": "NEEDS_REVIEW", "release_files": [], "verify_exit": 1, "guard_nav": "block",
             "guard_paste": "block", "bytes_unchanged": True}], {
        "authorize_exit": a, "quarantine_status": q.get("status"), "release_files": c.release_files(pkg), "verify_exit": v,
        "guard_nav": nav, "guard_paste": paste, "bytes_unchanged": S.sha(c.final_bytes(pkg)) == h}


# 12 ----------------------------------------------------------------------------------------------------------------
def bad_repair(c: Ctx):
    pkg = c.package()
    _, h = S.edit_final(pkg, S.remove_one_link)
    a = c.code("authorize", c.runner.authorize(pkg, env=BAD_REPAIRER))
    v = c.code("verify", c.runner.verify(pkg))
    nav, paste = c.paste_flow(pkg)
    states = c.ledger_states(pkg)
    cycles = c.cycles(pkg)
    c.hash("input", h)
    c.note("repairer", BAD_REPAIRER["FINGERPRINT_EVAL_REPAIRER"])
    return [{"authorize_exit": 3, "release_files": [], "verify_exit": 1, "ever_authorized": False, "heal_cycles_bounded": True,
             "guard_nav": "block", "guard_paste": "block"}], {
        "authorize_exit": a, "release_files": c.release_files(pkg), "verify_exit": v, "ever_authorized": "PUBLISH_AUTHORIZED" in states,
        "heal_cycles_bounded": 1 <= len(cycles) <= 3, "guard_nav": nav, "guard_paste": paste}


# 13 ----------------------------------------------------------------------------------------------------------------
def queue_continuation(c: Ctx):
    pkgs = [c.package(f"{c.slug}-q{i}") for i in (1, 2, 3)]
    S.edit_final(pkgs[1], S.remove_one_link)
    ref = S.reference_file(pkgs[1])
    if ref is not None:
        ref.unlink()  # rated reference gone: a repair cannot be grounded, so the middle package is unrepairable
    codes, verifies = [], []
    for i, p in enumerate(pkgs, 1):  # the driver loop: one authorize per package, a failure never stops the queue
        codes.append(c.code(f"authorize_{i}", c.runner.authorize(p)))
        verifies.append(c.code(f"verify_{i}", c.runner.verify(p)))
    # ACTIVE now names package 3. Its bytes paste; package 2's bytes must not.
    nav = c.rig.decide("navigate (ACTIVE = package 3)", NAV)
    paste3 = c.rig.paste_with("paste package 3 release bytes", c.release_bytes(pkgs[2]) or b"", PASTE)
    paste2 = c.rig.paste_with("paste package 2 (quarantined) bytes", c.final_bytes(pkgs[1]), PASTE)
    q = c.quarantine(pkgs[1]) or {}
    for i, p in enumerate(pkgs, 1):
        c.snapshot(p, f"pkg{i}")
    c.note("pkg2_quarantine_category", q.get("category"))
    return [{"authorize_exit_codes": [0, 3, 0], "verify_exit_codes": [0, 1, 0], "pkg2_quarantine_status": "NEEDS_REVIEW",
             "pkg2_release_files": [], "guard_nav": "allow", "guard_paste_pkg3": "allow", "guard_paste_pkg2": "block"}], {
        "authorize_exit_codes": codes, "verify_exit_codes": verifies, "pkg2_quarantine_status": q.get("status"),
        "pkg2_release_files": c.release_files(pkgs[1]), "guard_nav": nav["decision"], "guard_paste_pkg3": paste3["decision"],
        "guard_paste_pkg2": paste2["decision"]}


CASES = [
    ("normal_path", "authorize, verify, status, guard nav/paste/click/publish-click on the untouched article", normal),
    ("missing_link", "remove one source link: healed to a new hash and PASS, or quarantine plus guard blocked", missing_link),
    ("altered_number", "change a number in one claim: healed (claim restored) or blocked", altered_number),
    ("deleted_section", "delete a section: restored from the reference", deleted_section),
    ("modify_after_pass", "edit after PASS: verify 1, guard blocks, re-authorize gives a new PASS", modify_after_pass),
    ("missing_artifact", "release article / authorization removed: verify 1, guard blocks", missing_artifact),
    ("artifact_other_hash", "another package's authorization, and tampered release bytes: verify 1, guard blocks", artifact_for_other_hash),
    ("obsolete_evaluator", "evaluator id edited in the authorization: signature invalid, blocked; re-run re-binds", obsolete_evaluator),
    ("gateway_unavailable", "gateway unroutable: infra quarantine (exit 4), guard blocks, bytes unchanged", gateway_unavailable),
    ("style_only", "style-only anomaly: PASS with an advisory, no repair", style_only),
    ("unsupported_claim", "added unsupported claim: quarantine NEEDS_REVIEW", unsupported_claim),
    ("bad_repair", "FaultyRepairer (test-mode hook): never authorized, bounded cycles", bad_repair),
    ("queue_continuation", "3 packages, the middle one unrepairable: the 1st and 3rd authorized", queue_continuation),
]
