"""Editorial repair may add sentences. Each added sentence is evaluated on its own; deleted material must be declared."""
import json

from .fakes import sha
from .test_critic_budget import MAJOR, state

TARGET = "A reader with a different request mix should rerun"
CONCLUSION = "Taken together, the 40 node test links the latency drop to the cache change."
TAIL = "so the median alone cannot say whether the slowest requests improved."


def candidate(d) -> str:
    return (d.pkg / state(d)["candidate"]["path"]).read_text()


def major_open(d):
    d.to_stage("critic")
    d.critic.replies = [MAJOR]
    assert d.cli("run", "critic")[1]["majors"] == 1


def try_repair(d, text, removals=None):
    args = ["repair", "try", "--file", str(d.write("repair.md", text))]
    if removals is not None:
        args += ["--report", str(d.write("repair.report.json", {"removals": removals}))]
    return d.cli(*args)


def test_one_supported_conclusion_sentence_is_accepted(d):
    major_open(d)
    cand = candidate(d)
    rc, out = try_repair(d, cand.replace(TAIL, TAIL + " " + CONCLUSION))
    assert rc == 0 and out["code"] == "ACCEPTED" and out["added_sentences"] == 1, out
    assert CONCLUSION in candidate(d)
    assert d.runner.notes_seen and d.runner.notes_seen.endswith("sources/source-notes.md")  # the gate saw the source notes
    notes = (d.pkg / "sources/source-notes.md").read_text()
    assert "Evidence ledger" in notes and "unresolved" not in notes.lower().split("evidence ledger")[1]  # unresolved claims never support anything


def test_unsupported_added_sentence_is_rejected_by_the_support_check(d):
    major_open(d)
    d.runner.unsupported = ["halved the energy bill"]
    rc, out = try_repair(d, candidate(d).replace(TAIL, TAIL + " The change also halved the energy bill for the lab."))
    assert rc == 1 and any("unsupported by the evidence ledger" in r for r in out["reasons"]), out
    assert "halved the energy bill" not in candidate(d)


def test_added_sentence_with_an_invented_number_is_rejected_deterministically(d):
    major_open(d)
    before = d.runner.n("scripts.write_pipeline.gaterun")  # the title stage's TLDR check already used the gate once
    rc, out = try_repair(d, candidate(d).replace(TAIL, TAIL + " Tail latency improved by 17 percent."))
    assert rc == 1 and any("added sentence rejected" in r or "number" in r for r in out["reasons"])
    assert d.runner.n("scripts.write_pipeline.gaterun") == before  # rejected before any model call


def test_invented_first_person_experience_is_rejected(d):
    major_open(d)
    rc, out = try_repair(d, candidate(d).replace(TAIL, TAIL + " When I tested this on my own fleet the drop held."))
    assert rc == 1 and any("experience" in r for r in out["reasons"])


def test_added_sentence_with_a_stronger_hedge_or_a_new_negation_is_rejected(d):
    major_open(d)
    rc, out = try_repair(d, candidate(d).replace(TAIL, TAIL + " The cache never explains the drop on these nodes."))
    assert rc == 1 and any("negation" in r for r in out["reasons"])


def test_changed_factual_meaning_and_lost_link_are_rejected(d):
    major_open(d)
    cand = candidate(d)
    rc, out = try_repair(d, cand.replace("from 120 ms to 85 ms", "from 120 ms to 95 ms"))
    assert rc == 1 and any("number" in r for r in out["reasons"])
    d.runner.forbidden = ["attribute the drop to the network"]
    head, sep, tail = cand.partition("\n\n## ")  # the TLDR (frozen furniture) also says "attribute the drop to the cache": only the body changes here
    rc, out = try_repair(d, head + sep + tail.replace("attribute the drop to the cache", "attribute the drop to the network"))
    assert rc == 1 and any("claims gate failed" in r for r in out["reasons"])
    rc, out = try_repair(d, cand.replace("[test report](https://example.com/lab-report)", "test report"))
    assert rc == 3 and out["code"] == "NOT_READY" and "link removed" in out["reasons"][0]  # the third rejection ends the run


def test_undeclared_deletion_is_rejected_and_a_declared_one_is_checked_and_accepted(d):
    major_open(d)
    cut = "The report covers one workload on one fleet."
    d.runner.required = ["covers one workload on one fleet"]  # the gate sees a missing claim when the reference still has it
    gone = candidate(d).replace(cut + " ", "")
    rc, out = try_repair(d, gone)
    assert rc == 1 and any("claims gate failed" in r for r in out["reasons"])
    rc, out = try_repair(d, gone, removals=[{"text": cut, "reason": "restates the next paragraph"}])
    assert rc == 0 and out["removed_sentences"] == 1, out
    s = state(d)
    assert [c["text"] for c in s["repair_cuts"]] == [cut.lower()] or len(s["repair_cuts"]) == 1
    assert any(e["stage"] == "repair" for e in s["removals_ledger"])  # the signed ledger
    assert (d.pkg / "write-pipeline/removals-ledger.json").exists()


def test_removal_declarations_are_validated(d):
    major_open(d)
    cand = candidate(d)
    rc, out = try_repair(d, cand.replace(cut_text(cand), ""), removals=[{"text": cut_text(cand), "reason": "x"}])
    assert rc == 1 and any("link" in r for r in out["reasons"])  # a link-bearing sentence cannot be cut
    rc, out = try_repair(d, cand, removals=[{"text": "", "reason": ""}])
    assert rc == 1 and any("removals[0]" in r for r in out["reasons"])


def cut_text(cand: str) -> str:
    para = next(p for p in cand.split("\n\n") if "[test report]" in p)
    return para.split(". ")[0] + "."
