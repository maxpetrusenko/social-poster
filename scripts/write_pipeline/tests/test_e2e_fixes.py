"""E2E mismatch fixes: negated image provenance, topical author suggestions, schema-naming rejections, upstream rework limit."""
import json

from scripts.write_pipeline import relevance as RV
from scripts.write_pipeline import validators as V

from .fakes import DRAFT, UNSLOP, VOICE
from .test_failures import stages


# ---- images provenance regex ------------------------------------------------------------------------------------------
def test_negated_video_frame_statements_do_not_fire():
    for ok in ("Drawn from the two published medians; no video frames and no presenter shots", "not a video frame, not a thumbnail", "made without any presenter or speaker",
               "contains no thumbnail and never uses a talking head"):
        assert V.video_frame_claim(ok) is None, ok
    for bad in ("a video frame from the keynote", "cropped thumbnail of the talk", "the presenter at the podium", "still from the video"):
        assert V.video_frame_claim(bad), bad


def test_images_stage_accepts_negated_provenance_and_rejects_a_real_video_frame(d):
    d.to_stage("images")
    ok = d.images(provenance="Drawn by the operator from the two published medians; no video frames, no presenter, no photo")
    assert d.submit("images", ok)[0] == 0
    bad = d.images(provenance="A video frame taken from the lab's talk")
    rc, out = d.submit("images", bad)
    assert rc == 1 and "presenter and video frames are not allowed" in out["reasons"][0] and "method" in out["reasons"][0]


# ---- author-input suggestions need topical relevance ---------------------------------------------------------------------
KEY = RV.key_terms("What a lab's cache test says about latency", "A 2025 report on median latency across 40 nodes", "# T\n\n## What the test measured\n\nx\n",
                   [{"claim": "The lab tested 40 nodes in 2025", "supported_wording": "Median latency fell from 120 ms to 85 ms"}])


def test_relevance_threshold():
    assert RV.is_relevant("Add your own latency measurements from a cache test on your nodes", KEY)
    assert not RV.is_relevant("Share a personal story about your career journey and what motivated you", KEY)
    assert not RV.is_relevant("Add your own experience", KEY)
    assert RV.filter_suggestions(["Add your own experience", "Compare the median latency on your nodes"], KEY) == (["Compare the median latency on your nodes"], 1)


def test_summary_only_response_lists_only_topical_suggestions(d):
    d.to_stage("angle")
    rc, out = d.submit("angle", dict(d.ANGLE, verdict="summary_only", contributions=[]))
    assert rc == 3 and [o["id"] for o in out["author_opportunities"]] == ["a1"] and out["omitted_generic_suggestions"] == 1


def test_package_omits_off_topic_review_suggestions(d):
    d.to_stage("integrity")
    orig = d.runner
    def with_author_input(argv):
        rc, out = orig(argv)
        if argv[2] == "scripts.medium_review" and rc == 0:
            j = json.loads(out)
            j["author_input_required"] = {"required": True, "reason": "Add a personal anecdote about your career journey",
                                          "candidate_trusted_material": ["the median latency test on 40 nodes", "your holiday photos"]}
            out = json.dumps(j)
        return rc, out
    d.runner = with_author_input
    assert d.cli("finalize")[0] == 0
    pm = (d.pkg / "PACKAGE.md").read_text()
    assert "median latency test on 40 nodes" in pm and "holiday photos" not in pm and "career journey" not in pm.split("## MEDIUM REVIEW")[1]


# ---- rejection messages name the schema -------------------------------------------------------------------------------------
def test_validate_rejections_name_the_expected_schema_keys(d):
    d.to_stage("validate")
    rc, out = d.submit("validate", DRAFT, report={"checked": [{"claim_id": "c1", "verdict": "supported"}]})
    msg = " ".join(out["reasons"])
    assert rc == 1 and '"claim_id"' in msg and '"verdict"' in msg
    rep = {"checked": [{**e, "verdict": "supported"} if e["claim_id"] == "c4" else e for e in d.FACTUAL["checked"]]}
    msg = " ".join(d.submit("validate", DRAFT, report=rep)[1]["reasons"])
    assert '"verdict": "omitted"' in msg
    msg = " ".join(d.submit("validate", DRAFT, report={"checked": "x"})[1]["reasons"])
    assert "factual report schema" in msg and "claim_id" in msg and "omitted" in msg
    rc, out = d.cli("submit", "validate", "--file", str(d.write("v.md", DRAFT)))
    assert "factual report schema" in " ".join(out["reasons"])


def test_antifp_rejections_name_the_block_limit_and_the_thresholds(d):
    d.same_text(DRAFT.replace("The report covers one workload on one fleet.", "This isn't a benchmark. It's a single test on one fleet.")).to_stage("antifp")
    d.cli("antifp", "baseline")
    big = d.write("e.md", "\n\n".join(f"Paragraph {i} says something else entirely about caches." for i in range(8)))
    rc, out = d.cli("antifp", "try", "--file", str(big), "--signal", "template_hits")
    msg = " ".join(out["reasons"])
    assert rc == 1 and "limit is 3 blocks" in msg and "MAX_CHANGED_BLOCKS=3" in msg
    rc, out = d.cli("antifp", "try", "--file", str(big), "--signal", "bogus")
    assert "one of" in out["reasons"][0] and "3 blocks" in out["reasons"][0]
    rc, out = d.cli("antifp", "try")
    assert "--signal one of" in out["reasons"][0]


# ---- upstream rework limit (1 per stage) ---------------------------------------------------------------------------------------
def test_second_rework_of_a_content_stage_ends_not_ready(d):
    d.to_stage("critic")
    v1 = VOICE.replace("Anyone with a different", "Someone with a different")
    assert d.submit("voice", v1, report=UNSLOP)[0] == 0  # rework 1: allowed, everything downstream is stale
    assert stages(d)["antifp"] == "STALE"
    v2 = VOICE.replace("Anyone with a different", "A person with a different")
    rc, out = d.submit("voice", v2, report=UNSLOP)
    assert rc == 3 and out["code"] == "NOT_READY" and "rework limit" in out["reasons"][0] and "limit 1 per stage" in out["reasons"][0]
    assert stages(d)["voice"] == "NOT_READY" and d.cli("status", "--json")[1]["overall"] == "NOT_READY"
    assert json.loads((d.pkg / "write-pipeline/state.json").read_text())["rework"] == {"voice": 1}
    assert "NOT READY" in (d.pkg / "FINAL.md").read_text()
    assert d.submit("voice", VOICE, report=UNSLOP)[0] == 0  # going back to bytes the stage already had is a revert, not a new rework


def test_title_and_images_are_not_rework_limited(d):
    d.to_stage("critic")
    for n in range(2, 6):
        assert d.submit("images", d.images(caption=f"Median latency before and after the change, take {n}. Source: the lab report."))[0] == 0
