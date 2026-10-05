import contextlib
import hashlib
import io
import json
import os
from pathlib import Path

import pytest

from scripts.medium_review import autofix as AF
from scripts.medium_review import cli as MR_CLI
from scripts.medium_review.package import resolve
from scripts.publish_route import cli as PR_CLI
from scripts.publish_route import orchestrate as OR
from scripts.publish_route import publications as PUB
from scripts.publish_route.decide import decide

GOOD = "# A Ghost Became A Waveform\n\n*An engineer traces a haunted lab to infrasound.*\n\nThe first clue is a sword shaking by itself.\n"
NOALT = GOOD + "\n![](assets/tandy-lab-fan.png)\n"


def sha(t: str) -> str:
    return hashlib.sha256(t.encode()).hexdigest()


def review_for(text: str, *, boost="NO", risk="LOW", derivative=False, integral=True, weak=(), hard=(), fixes=(), aiq=False,
               material=(), warnings=(), policy="pol1@x") -> dict:
    dims = {k: {"rating": "weak" if k in weak else "adequate"} for k in ("writer_experience", "originality", "reader_value")}
    return {"status": "REVIEWED", "binding": {"content_sha256": sha(text), "policy_version": policy},
            "scorecard": {"dimensions": dims, "boost_candidate": boost, "general_distribution_risk": risk, "derivative_summary": derivative,
                          "author_contribution": {"present": True, "integral": integral, "evidence": []}},
            "hard_policy_risks": [{"source": "model", "category": "hard_policy", "message": m, "evidence_quote": ""} for m in hard],
            "warnings": [{"id": w} for w in warnings],
            "safe_auto_fixes": [{"kind": k, "status": "available"} for k in fixes],
            "author_input_required": {"required": aiq, "reason": "needs author", "candidate_trusted_material": list(material)}}


def meta(**kw):
    return {"images": 0, "images_with_provenance": 0, "title": "T", "subtitle": "S", "title_candidates": [], "subtitle_candidates": [],
            "queue_item": {}, "topics": ["science"], **kw}


PASS = {"state": "PASS", "integrity_record_id": "r1", "reason": ""}
PUBS = [{"name": "Sci Pub", "url": "https://medium.com/sci", "topics": ["Science"], "submission_url": "https://medium.com/sci/submit",
         "editorial_review": True, "accepts_ai_assisted_with_disclosure": True, "source_url": "https://medium.com/sci/guidelines",
         "verified_at": "2026-10-01"}]


# ---- pure decide ------------------------------------------------------------------------------------------
def test_route_a_direct_publish():
    d = decide(PASS, review_for(GOOD), meta(), [])
    assert d["route_code"] == "A" and d["route"] == "DIRECT_PUBLISH"


def test_low_boost_and_high_not_a_gate():
    for b in ("NO", "UNCERTAIN", "YES"):
        assert decide(PASS, review_for(GOOD, boost=b), meta(), [])["route_code"] == "A"


def test_route_b_with_candidates_and_reason():
    d = decide(PASS, review_for(GOOD, derivative=True, integral=False), meta(), PUBS)
    assert d["route_code"] == "B" and d["detail"] == "B_PUBLICATION_CANDIDATES"
    assert d["publication_candidates"][0]["name"] == "Sci Pub" and "derivative" in d["reasons"][0]


def test_route_b_needs_research_when_no_match_and_no_invention():
    d = decide(PASS, review_for(GOOD, derivative=True), meta(topics=["neuroscience"]), PUBS)
    assert d["detail"] == "B_NEEDS_PUBLICATION_RESEARCH" and d["publication_candidates"] == [] and d["topics"] == ["neuroscience"]
    assert decide(PASS, review_for(GOOD, derivative=True), meta(), [])["publication_candidates"] == []


def test_publication_with_ai_false_or_invalid_entry_never_offered(tmp_path):
    bad = dict(PUBS[0], accepts_ai_assisted_with_disclosure=False)
    assert decide(PASS, review_for(GOOD, derivative=True), meta(), [bad])["detail"] == "B_NEEDS_PUBLICATION_RESEARCH"
    f = tmp_path / "p.json"
    f.write_text(json.dumps({"version": "1", "publications": [PUBS[0], {"name": "X", "topics": ["science"]}, dict(PUBS[0], editorial_review=False)]}))
    loaded = PUB.load(f)
    assert len(loaded["valid"]) == 1 and len(loaded["rejected"]) == 2


def test_shipped_publication_list_is_empty_and_valid():
    d = json.loads(PUB.DEFAULT_PATH.read_text())
    assert d["publications"] == [] and PUB.load()["valid"] == []


def test_d_check1_quarantine():
    d = decide({"state": "QUARANTINED", "reason": "ADDED_UNSUPPORTED_CLAIM"}, review_for(GOOD), meta(), PUBS)
    assert d["route_code"] == "D" and "Check 1 quarantine" in d["reasons"][0]


def test_d_missing_image_provenance_with_hard_risk():
    d = decide(PASS, review_for(GOOD, hard=["Video frames used as images without credit or permission"]), meta(images=3, images_with_provenance=0), PUBS)
    assert d["route_code"] == "D" and "rights" in d["reasons"][0]


def test_rights_risk_with_provenance_and_credit_fix_is_c():
    d = decide(PASS, review_for(GOOD, hard=["image lacks credit"], fixes=["image_credit"]), meta(images=2, images_with_provenance=2), [])
    assert d["route_code"] == "C" and d["repairs"][0]["kind"] == "image_credit"


def test_d_non_rights_hard_risk():
    assert decide(PASS, review_for(GOOD, hard=["plagiarised passage"]), meta(), [])["route_code"] == "D"


def test_author_input_required_d_unless_b_possible():
    r = review_for(GOOD, aiq=True)
    assert decide(PASS, r, meta(), [])["route_code"] == "D"
    assert decide(PASS, r, meta(), PUBS)["route_code"] == "B"
    assert decide(PASS, review_for(GOOD, aiq=True, material=[{"path": "x"}]), meta(), [])["route_code"] == "B"


def test_subtitle_trim_only_with_approved_shorter_variant():
    long_sub = "x" * 150
    r = review_for(GOOD, warnings=["subtitle_long"])
    assert decide(PASS, r, meta(subtitle=long_sub), [])["route_code"] == "A"
    d = decide(PASS, r, meta(subtitle=long_sub, title_candidates=[{"title": "T", "subtitle": "short approved"}]), [])
    assert d["route_code"] == "C" and d["repairs"][0] == {"kind": "subtitle_trim", "from": long_sub, "to": "short approved",
                                                          "basis": "approved shorter variant in title candidates"}
    too_long = decide(PASS, r, meta(subtitle=long_sub, title_candidates=[{"subtitle": "y" * 141}]), [])
    assert too_long["route_code"] == "A"


def test_title_suffix_only_on_exact_channel_or_source_match():
    r = review_for(GOOD, warnings=["title_pipe_suffix"])
    m = meta(title="Real Title | Pushka. Brain", queue_item={"channel": "Pushka. Brain"})
    assert decide(PASS, r, m, [])["repairs"][0]["kind"] == "title_suffix_strip"
    assert decide(PASS, r, meta(title="Real Title | Pushka. Brain", queue_item={"channel": "pushka. brain"}), [])["route_code"] == "A"
    assert decide(PASS, r, meta(title="Real Title | Pushka. Brain", queue_item={"source_name": "Pushka. Brain"}), [])["route_code"] == "C"


def test_check1_needs_authorize_is_c_and_stale_review_is_c():
    assert decide({"state": "NEEDS_AUTHORIZE"}, review_for(GOOD), meta(), [])["actions"] == ["authorize", "review"]
    assert decide(PASS, None, meta(), [])["actions"] == ["review"]


# ---- orchestration with the real autofix, stubbed gate/model ----------------------------------------------
class Fakes:
    def __init__(self, package: Path, review_kw=None, authorize="pass", fixable=True):
        self.package, self.review_kw, self.authorize_mode, self.fixable = package, review_kw or {}, authorize, fixable
        self.calls: list[tuple[str, str]] = []

    def cur(self):
        return resolve(self.package)

    def __call__(self, argv):
        sub = argv[argv.index("-m") + 2] if "-m" in argv else argv[2]
        mod = argv[argv.index("-m") + 1]
        ctx = self.cur()
        text = ctx.article_path.read_text()
        tag = "authorize" if sub == "authorize" else ("verify" if sub == "verify" else sub)
        self.calls.append((tag, sha(text)))
        if sub == "verify":
            a = self.package / "release" / "authorization.json"
            ok = a.exists() and json.loads(a.read_text())["sha"] == sha(text)
            return (0 if ok else 1), json.dumps({"valid": ok, "reason": "ok" if ok else "NOT AUTHORIZED", "content_sha256": sha(text) if ok else None})
        if sub == "authorize":
            if self.authorize_mode == "unresolvable":
                return 2, "cannot resolve"
            (self.package / "release").mkdir(exist_ok=True)
            (self.package / "release" / "authorization.json").write_text(
                json.dumps({"sha": sha(text), "record_path": f"evals/fingerprint-gate/runs/ts-{sha(text)[:12]}.json"}))
            return 0, ""
        if sub == "review":
            rec = review_for(text, fixes=AF_kinds(text, ctx) if self.fixable else self.review_kw.get("fixes", ()),
                             **{k: v for k, v in self.review_kw.items() if k != "fixes"})
            d = self.package / "evals" / "medium-distribution"
            d.mkdir(parents=True, exist_ok=True)
            (d / "MEDIUM_REVIEW.json").write_text(json.dumps(rec))
            return 0, ""
        if sub == "autofix":
            buf = io.StringIO()
            with contextlib.redirect_stdout(buf):
                rc = MR_CLI.main(["autofix", "--package", str(self.package), "--json"])
            return rc, buf.getvalue()
        raise AssertionError(argv)


def AF_kinds(text, ctx):
    return [f["kind"] for f in AF.available_fixes(text, ctx) if f["kind"] != "tags"]


def make_pkg(tmp_path: Path, text: str, **version) -> Path:
    p = tmp_path / "pkg"
    p.mkdir()
    (p / "article.md").write_text(text)
    (p / "version.json").write_text(json.dumps({"articleFile": "article.md", "tags": ["science"], **version}))
    return p


NO_PUBS = Path("/nonexistent/publications.json")


def run(p, fk, **kw):
    return OR.run_route(p, runner=fk, publications_path=NO_PUBS, **kw)


def test_safe_fix_c_recheck_a(tmp_path):
    p = make_pkg(tmp_path, NOALT)
    fk = Fakes(p)
    fk(["py", "-m", "m", "authorize"]); fk(["py", "-m", "m", "review"])  # Check 1 PASS + Check 2 on the original bytes
    fk.calls.clear()
    rec = run(p, fk, repair=True)
    assert rec["route_code"] == "A" and len(rec["repair_cycles"]) == 1
    final = resolve(p).article_path
    assert final.name == "article-medium-fix-1.md" and "![Tandy lab fan]" in final.read_text()
    kinds = [c[0] for c in fk.calls]
    # every content change reruns authorize, then BOTH checks are rerun on the new bytes
    assert kinds.index("autofix") < kinds.index("authorize") < kinds.index("review")
    assert dict(fk.calls)["authorize"] == sha(final.read_text()) != sha(NOALT)
    assert rec["binding"]["content_sha256"] == sha(final.read_text()) and rec["binding"]["integrity_record_id"].startswith("ts-")


def test_check1_absent_authorizes_then_a(tmp_path):
    p = make_pkg(tmp_path, GOOD)
    rec = run(p, Fakes(p), repair=True)
    assert rec["route_code"] == "A" and len(rec["repair_cycles"]) == 1 and rec["repair_cycles"][0]["content_changed"] is False


def test_repair_loop_bounded_at_two_cycles(tmp_path):
    p = make_pkg(tmp_path, GOOD)
    fk = Fakes(p, review_kw={"fixes": ("formatting",)}, fixable=False)  # review keeps reporting a fix autofix cannot apply
    rec = run(p, fk, repair=True, max_cycles=99)
    assert rec["route_code"] == "D" and rec["detail"] == "D_REPAIR_EXHAUSTED" and len(rec["repair_cycles"]) == 2
    assert [c[0] for c in fk.calls].count("authorize") == 2


def test_unresolvable_package_stops_repair(tmp_path):
    p = make_pkg(tmp_path, GOOD)
    rec = run(p, Fakes(p, authorize="unresolvable"), repair=True)
    assert rec["detail"] == "D_UNRESOLVABLE_PACKAGE" and len(rec["repair_cycles"]) == 1


def test_missing_image_provenance_is_d_end_to_end(tmp_path):
    p = make_pkg(tmp_path, GOOD + "\n![Frame](assets/frame-01.jpg)\n")
    fk = Fakes(p, review_kw={"hard": ("Video frames used as images without credit or permission",)})
    fk(["py", "-m", "m", "authorize"]); fk(["py", "-m", "m", "review"])
    rec = run(p, fk)
    assert rec["route_code"] == "D" and rec["binding"]["integrity_record_id"].startswith("ts-")


def test_repair_without_command_never_edits_article(tmp_path):
    p = make_pkg(tmp_path, NOALT)
    fk = Fakes(p)
    fk(["py", "-m", "m", "authorize"]); fk(["py", "-m", "m", "review"])
    before = (p / "article.md").read_bytes()
    rec = run(p, fk)  # decide only
    assert rec["route_code"] == "C" and (p / "article.md").read_bytes() == before and not list(p.glob("article-medium-fix-*"))


# ---- route.json binding -------------------------------------------------------------------------------------
def _decided_a(tmp_path):
    p = make_pkg(tmp_path, GOOD)
    fk = Fakes(p)
    fk(["py", "-m", "m", "authorize"]); fk(["py", "-m", "m", "review"])
    rec = run(p, fk)
    assert rec["route_code"] == "A"
    return p


def test_route_json_valid_then_invalid_after_any_byte_change(tmp_path):
    p = _decided_a(tmp_path)
    assert OR.verify_route(p)[0]
    (p / "article.md").write_bytes((p / "article.md").read_bytes() + b" ")
    ok, why = OR.verify_route(p)
    assert not ok and "bytes changed" in why


def test_route_json_invalid_when_tampered_or_bindings_change(tmp_path):
    p = _decided_a(tmp_path)
    rj = p / OR.ROUTE_REL
    orig = rj.read_text()
    rj.write_text(orig.replace("DIRECT_PUBLISH", "PUBLICATION_ROUTE", 1))
    assert OR.verify_route(p) == (False, "route.json was modified (self hash mismatch)")
    rj.write_text(orig)
    assert OR.verify_route(p)[0]
    auth = p / "release" / "authorization.json"
    d = json.loads(auth.read_text()); d["record_path"] = "evals/fingerprint-gate/runs/other.json"; auth.write_text(json.dumps(d))
    assert "integrity record changed" in OR.verify_route(p)[1]
    auth.write_text(json.dumps({**d, "record_path": f"evals/fingerprint-gate/runs/ts-{sha(GOOD)[:12]}.json"}))
    mr = p / OR.REVIEW_REL
    r = json.loads(mr.read_text()); r["binding"]["policy_version"] = "pol2@y"; mr.write_text(json.dumps(r))
    assert "policy version changed" in OR.verify_route(p)[1]


# ---- env allowlist + CLI -----------------------------------------------------------------------------------
def test_default_runner_uses_allowlisted_env(monkeypatch):
    seen = {}

    def fake_run(argv, **kw):
        seen.update(kw)
        return type("P", (), {"returncode": 0, "stdout": "", "stderr": ""})()
    monkeypatch.setattr(OR.subprocess, "run", fake_run)
    monkeypatch.setenv("ANTHROPIC_API_KEY", "secret")
    monkeypatch.setenv("OPENAI_API_KEY", "secret")
    OR.default_runner(["true"])
    assert "ANTHROPIC_API_KEY" not in seen["env"] and "OPENAI_API_KEY" not in seen["env"] and set(seen["env"]) <= set(OR.ROUTE_ENV_KEYS)


def test_cli_decide_exit_codes_and_verify(tmp_path, capsys):
    p = make_pkg(tmp_path, GOOD)
    fk = Fakes(p)
    fk(["py", "-m", "m", "authorize"]); fk(["py", "-m", "m", "review"])
    assert PR_CLI.main(["decide", "--package", str(p), "--publications", str(NO_PUBS)], runner=fk) == 0
    assert PR_CLI.main(["verify", "--package", str(p)]) == 0
    (p / "article.md").write_text(GOOD + "edit")
    assert PR_CLI.main(["verify", "--package", str(p)]) == 1


def test_apply_own_repairs_use_only_approved_text():
    from scripts.publish_route import repair as RP
    text = "# Real Title | Pushka. Brain\n\n*" + "x" * 150 + "*\n\nBody.\n"
    new, applied = RP.apply_own(text, [{"kind": "title_suffix_strip", "suffix": "Pushka. Brain"},
                                       {"kind": "subtitle_trim", "to": "Approved short subtitle"}])
    assert new == "# Real Title\n\n*Approved short subtitle*\n\nBody.\n" and len(applied) == 2
    same, none = RP.apply_own(text, [{"kind": "title_suffix_strip", "suffix": "Other"}])
    assert same == text and none == []
