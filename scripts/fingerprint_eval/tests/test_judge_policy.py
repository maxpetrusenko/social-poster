"""Offline tests for the calibrated claim-judge policy: prompt B parsing, identity pre-filter, 2-of-3 confirmation. Stub model only."""
import json

import pytest

from scripts.fingerprint_eval.contracts import Category
from scripts.fingerprint_eval.errors import EvaluationError
from scripts.fingerprint_eval.gateway import GatewayError
from scripts.fingerprint_eval.judge import JUDGE_PROMPT, judge_claims, majority, parse_verdicts
from scripts.fingerprint_eval.rewrite import Segment
from scripts.fingerprint_eval.textutil import Block

REF = "The trial enrolled 40 patients. Survival rose to 13.2 months."


class StubModel:
    """Replies come from a script of per-call callables/strings; records every prompt."""
    backend, name = "claude-cli", "stub"

    def __init__(self, *replies):
        self.replies, self.prompts = list(replies), []

    def complete(self, prompt, **kw):
        self.prompts.append(prompt)
        r = self.replies.pop(0)
        if isinstance(r, Exception):
            raise r
        return r


def reply(*verdicts, dim="none"):
    return json.dumps([{"i": i, "evidence": "q", "dimension": dim if v != "entailed" else "none", "verdict": v, "reason": "r"} for i, v in enumerate(verdicts, 1)])


def seg(output, claims=("40 patients", "13.2 months")):
    return Segment(0, "S", 0, [Block("paragraph", REF)], propositions=[{"claim": c} for c in claims], output=output)


def test_prompt_is_b_and_parser_accepts_evidence_and_dimension():
    assert "You MUST name the dimension" in JUDGE_PROMPT and '"evidence"' in JUDGE_PROMPT
    out = parse_verdicts(reply("entailed", "changed", dim="number"), 2)
    assert out[2]["dimension"] == "number" and out[2]["evidence"] == "q"


@pytest.mark.parametrize("raw", [
    'x [{"i": 1, "verdict": "entailed"}]',
    '[{"i": 1, "verdict": "maybe"}]',
    '[{"i": 1, "verdict": "entailed", "confidence": 1}]',
    '[{"i": 1, "verdict": "entailed", "evidence": 3}]',
    '[{"i": 2, "verdict": "entailed"}]',
])
def test_parser_stays_strict(raw):
    with pytest.raises(ValueError):
        parse_verdicts(raw, 1)


def test_identity_segment_is_entailed_with_zero_calls():
    m = StubModel()
    r = judge_claims([seg("  the TRIAL enrolled 40 patients.\n\nSurvival rose to 13.2 months. ![x](a.png)")], m, strict=True)
    assert m.prompts == [] and r["judge_calls"] == 0 and r["prefiltered_segments"] == 1
    assert (r["claims_entailed"], r["total"], r["flagged"]) == (2, 2, [])


def test_punctuation_change_is_not_identity():
    m = StubModel(reply("entailed", "entailed"))
    r = judge_claims([seg(REF.replace("13.2", "132"))], m, strict=True)
    assert r["judge_calls"] == 1 and r["prefiltered_segments"] == 0


def test_all_entailed_costs_one_call():
    m = StubModel(reply("entailed", "entailed"))
    r = judge_claims([seg("A paraphrase.")], m, strict=True)
    assert r["judge_calls"] == 1 and r["claims_entailed"] == 2 and r["flagged"] == []


def test_two_of_three_overturns_a_single_false_flag():
    m = StubModel(reply("entailed", "changed", dim="number"), reply("entailed"), reply("entailed"))
    r = judge_claims([seg("A paraphrase.")], m, strict=True)
    assert r["judge_calls"] == 3
    assert r["claims_changed"] == 0 and r["claims_entailed"] == 2 and r["flagged"] == []
    assert r["overturned"] == [{"section": "S", "claim": "13.2 months", "votes": ["changed", "entailed", "entailed"]}]
    # confirmation re-judges only the flagged claim, renumbered from 1
    assert "1. 13.2 months" in m.prompts[1] and "40 patients" not in m.prompts[1]


def test_two_of_three_confirms_a_true_flag_and_records_votes():
    m = StubModel(reply("entailed", "changed", dim="number"), reply("changed", dim="number"), reply("entailed"))
    r = judge_claims([seg("Survival rose to 12.3 months.")], m, strict=True)
    assert r["judge_calls"] == 3 and r["claims_changed"] == 1 and r["claims_entailed"] == 1
    f = r["flagged"][0]
    assert f["claim"] == "13.2 months" and f["verdict"] == "changed" and f["votes"] == ["changed", "changed", "entailed"] and f["dimension"] == "number"


def test_flag_label_is_the_most_common_non_entailed_vote():
    assert majority(["changed", "missing", "missing"]) == "missing"
    assert majority(["changed", "entailed", "missing"]) == "changed"
    assert majority(["entailed", "changed", "entailed"]) == "entailed"
    assert majority(["changed", "changed"]) == "changed"          # one confirmation failed (non-strict)
    assert majority(["changed", "entailed"]) == "changed"         # tie: first-pass flag stands


def test_confirmation_batches_per_segment_not_per_claim():
    m = StubModel(reply("changed", "changed"), reply("changed", "changed"), reply("changed", "changed"))
    r = judge_claims([seg("Something else.")], m, strict=True)
    assert r["judge_calls"] == 3 and r["claims_changed"] == 2


def test_garbage_retries_once_then_raises_malformed():
    m = StubModel("not json", "still [not json")
    with pytest.raises(EvaluationError) as ei:
        judge_claims([seg("A paraphrase.")], m, strict=True)
    assert ei.value.category == Category.MALFORMED_MODEL_OUTPUT and len(m.prompts) == 2


def test_garbage_then_valid_recovers():
    m = StubModel("nope", reply("entailed", "entailed"))
    assert judge_claims([seg("A paraphrase.")], m, strict=True)["claims_entailed"] == 2


def test_gateway_error_keeps_its_category():
    e = GatewayError("t", Category.MODEL_TIMEOUT, "claude-cli")
    with pytest.raises(EvaluationError) as ei:
        judge_claims([seg("A paraphrase.")], StubModel(e, e), strict=True)
    assert ei.value.category == Category.MODEL_TIMEOUT and ei.value.dependency == "claude-cli"


def test_confirmation_failure_is_an_error_in_strict_mode():
    m = StubModel(reply("changed", "entailed"), "bad", "bad")
    with pytest.raises(EvaluationError) as ei:
        judge_claims([seg("Other text.")], m, strict=True)
    assert ei.value.category == Category.MALFORMED_MODEL_OUTPUT


def test_non_strict_counts_unjudged_and_tolerates_failed_confirmation():
    r = judge_claims([seg("Other text.")], StubModel("bad", "bad"), strict=False)
    assert r["claims_unjudged"] == 2 and r["flagged"][0]["verdict"] == "unjudged"
    r = judge_claims([seg("Other text.")], StubModel(reply("changed", "entailed"), "bad", "bad", "bad", "bad"), strict=False)
    assert r["claims_changed"] == 1 and r["flagged"][0]["votes"] == ["changed"]
