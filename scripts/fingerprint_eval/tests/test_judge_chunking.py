"""Chunked claim judging (JUDGE_BATCH) and the targeted re-ask of missing ids. Stub model only."""
import json

import pytest

from scripts.fingerprint_eval import added, judge as J
from scripts.fingerprint_eval.contracts import Category
from scripts.fingerprint_eval.errors import EvaluationError
from scripts.fingerprint_eval.judge import judge_claims
from scripts.fingerprint_eval.rewrite import Segment
from scripts.fingerprint_eval.textutil import Block


class StubModel:
    backend, name = "claude-cli", "stub"

    def __init__(self, *replies):
        self.replies, self.prompts = list(replies), []

    def complete(self, prompt, **kw):
        self.prompts.append(prompt)
        return self.replies.pop(0)


def reply(*verdicts):
    return json.dumps([{"i": i, "evidence": "q", "dimension": "none", "verdict": v, "reason": "r"} for i, v in enumerate(verdicts, 1)])


def partial(ids, verdict="entailed"):
    return json.dumps([{"i": i, "evidence": "q", "dimension": "none", "verdict": verdict, "reason": "r"} for i in ids])


def many(n):
    return Segment(0, "S", 0, [Block("paragraph", "ref")], propositions=[{"claim": f"claim {k}"} for k in range(1, n + 1)], output="A paraphrase.")


def claims_block(prompt):
    return prompt.split("Claims:")[1].split("Rewritten")[0]


def test_21_claims_are_three_calls_numbered_per_chunk_and_mapped_back():
    assert J.JUDGE_BATCH == 10
    m = StubModel(reply(*["changed" if k == 3 else "entailed" for k in range(1, 11)]),
                  reply(*["changed" if k == 4 else "entailed" for k in range(1, 11)]),
                  reply("changed"))
    r = judge_claims([many(21)], m, strict=True)
    assert len(m.prompts) == 3 and r["judge_calls"] == 3 and r["total"] == 21 and r["claims_changed"] == 3
    assert [f["claim"] for f in r["flagged"]] == ["claim 3", "claim 14", "claim 21"]
    assert "1. claim 1\n" in m.prompts[0] and "10. claim 10" in m.prompts[0] and "claim 11" not in m.prompts[0]
    assert "1. claim 11" in m.prompts[1] and "10. claim 20" in m.prompts[1]
    assert "1. claim 21" in m.prompts[2] and "2." not in claims_block(m.prompts[2])


def test_missing_id_gets_one_targeted_reask_then_succeeds():
    m = StubModel(partial([i for i in range(1, 11) if i != 7]), partial([1], "changed"))
    r = judge_claims([many(10)], m, strict=True)
    assert len(m.prompts) == 2 and r["claims_changed"] == 1 and r["claims_unjudged"] == 0 and r["claims_entailed"] == 9
    assert "1. claim 7" in m.prompts[1] and "claim 6" not in m.prompts[1] and "2." not in claims_block(m.prompts[1])
    assert r["flagged"][0]["claim"] == "claim 7"


def test_still_missing_after_reask_is_malformed_and_never_defaulted():
    m = StubModel(partial([i for i in range(1, 11) if i != 7]), "[]")
    with pytest.raises(EvaluationError) as ei:
        judge_claims([many(10)], m, strict=True)
    assert ei.value.category == Category.MALFORMED_MODEL_OUTPUT and len(m.prompts) == 2
    m = StubModel(partial([i for i in range(1, 11) if i != 7]), "[]")
    r = judge_claims([many(10)], m)  # non-strict: unjudged, no inferred verdicts
    assert r["claims_unjudged"] == 10 and r["claims_entailed"] == 0


@pytest.mark.parametrize("raw", [
    json.dumps([{"i": 1, "verdict": "entailed"}, {"i": 1, "verdict": "entailed"}, {"i": 2, "verdict": "entailed"}]),  # duplicate
    json.dumps([{"i": 1, "verdict": "entailed"}, {"i": 2, "verdict": "entailed"}, {"i": 3, "verdict": "entailed"}]),  # extra
    json.dumps([{"i": 1, "verdict": "entailed"}, {"i": 2, "verdict": "maybe"}]),  # verdict outside the allowed set
])
def test_duplicate_extra_or_bad_entries_are_errors_without_reask(raw):
    m = StubModel(raw, raw)
    with pytest.raises(EvaluationError) as ei:
        judge_claims([many(2)], m, strict=True)
    assert ei.value.category == Category.MALFORMED_MODEL_OUTPUT and len(m.prompts) == 2  # ordinary one retry only


def test_reask_reply_with_extra_id_is_error():
    m = StubModel(partial([1]), partial([1, 2]), partial([1]), partial([1, 2]))
    with pytest.raises(EvaluationError):
        judge_claims([many(2)], m, strict=True)


def test_confirm_telemetry_over_ten_flagged_is_chunked():
    m = StubModel(reply(*["changed"] * 10), reply(*["changed"] * 2), *[reply(*["changed"] * 10), reply(*["changed"] * 2)] * 2)
    r = judge_claims([many(12)], m, strict=True, confirm_telemetry=True)
    assert r["judge_calls"] == 6 and r["flagged"][11]["votes"] == ["changed"] * 3


def test_added_support_is_chunked_with_reask(monkeypatch):
    claims = [f"claim {k}" for k in range(1, 22)]
    sup = lambda ids: json.dumps([{"i": i, "verdict": "unsupported" if i == 2 else "supported", "reason": "r"} for i in ids])
    m = StubModel(sup(range(1, 11)), sup([i for i in range(1, 11) if i != 5]), sup([1]), sup([1]))
    verdicts, n = J.ask_chunked(claims, lambda sub: m.complete(added.SUPPORT_PROMPT.format(claims="\n".join(f"{i}. {c}" for i, c in enumerate(sub, 1)), material="x")), added.parse_support)
    assert n == 3 and len(m.prompts) == 4 and sorted(verdicts) == list(range(1, 22))
    assert verdicts[2]["verdict"] == "unsupported" and verdicts[12]["verdict"] == "unsupported" and verdicts[15]["verdict"] == "supported"
    assert "1. claim 15" in m.prompts[2] and "2." not in claims_block(m.prompts[2].replace("Reference material", "Rewritten"))
