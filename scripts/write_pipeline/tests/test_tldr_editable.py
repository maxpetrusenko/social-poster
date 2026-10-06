"""Only the bio, the footer and the disclosure are frozen. The TLDR is prose (editable, claims-checked against the body, fingerprint-measured);
the hero caption is editable too, with the hero image and its provenance untouched."""
import pytest

from scripts.fingerprint_eval.rewrite import unquote

from . import fakes
from .test_repair_adds import candidate, major_open, state, try_repair

OLD = "> " + fakes.Driver.TITLES["tldr"]
NEW = ("> A 2025 lab report found median latency fell from 120 ms to 85 ms on 40 nodes after a cache change. The authors attribute the drop to the cache, "
       "for one workload.")


def reasons(out):
    return " | ".join(out["reasons"]) if isinstance(out, dict) else str(out)


def test_a_rewritten_tldr_is_accepted_in_repair_and_judged_by_the_claims_gate(d):
    major_open(d)
    cand = candidate(d)
    assert OLD in cand
    rc, out = try_repair(d, cand.replace(OLD, NEW))
    assert rc == 0 and out["code"] == "ACCEPTED" and out["claims_gate"] == "PASS", out
    assert NEW in candidate(d)


@pytest.mark.parametrize("bad,why", [
    (NEW + " Median latency also fell 300 ms on cloud hardware.", "number"),
    (NEW.replace("a cache change", "a [cache change](https://example.com/lab-report)"), "link"),
    ("> Direct answer: " + NEW[2:], "Direct answer"),
    (NEW + " The change will cut hosting costs by 30 percent worldwide.", "number"),
])
def test_tldr_cannot_gain_a_claim_number_link_or_label(d, bad, why):
    major_open(d)
    rc, out = try_repair(d, candidate(d).replace(OLD, bad))
    assert rc == 1 and why.lower() in reasons(out).lower(), out


def test_tldr_claim_the_body_does_not_make_is_rejected_by_the_claims_gate(d):
    major_open(d)
    d.runner.unsupported = ["lab also doubled the fleet"]
    rc, out = try_repair(d, candidate(d).replace(OLD, NEW + " The lab also doubled the fleet afterwards."))
    assert rc == 1 and "unsupported" in reasons(out), out
    assert d.runner.n("scripts.write_pipeline.gaterun") >= 2  # the gate ran, with the source notes


def test_removing_or_moving_the_tldr_is_rejected(d):
    major_open(d)
    rc, out = try_repair(d, candidate(d).replace(OLD + "\n\n", ""))
    assert rc == 1 and ("TLDR" in reasons(out)), out


def test_footer_bio_and_hero_image_are_still_frozen(d):
    major_open(d)
    cand = candidate(d)
    rc, out = try_repair(d, cand.replace("passed it on", "passed it along").replace("If this was useful, I would be glad", "If this helped, I would be glad"))
    assert rc == 1 and "footer" in reasons(out), out
    rc, out = try_repair(d, cand.replace("Two bars comparing", "A chart comparing"))
    assert rc == 1 and "images changed" in reasons(out), out


CAP = "*Median latency before and after the change. Source: the lab report.*"


def test_the_hero_caption_is_editable(d):
    major_open(d)
    cand = candidate(d)
    assert CAP in cand
    rc, out = try_repair(d, cand.replace(CAP, "*The two medians the lab reported, before and after the cache change.*"))
    assert rc == 0, out


def test_a_caption_with_a_link_is_rejected(d):
    major_open(d)
    rc, out = try_repair(d, candidate(d).replace(CAP, "*See https://example.com/lab-report for more.*"))
    assert rc == 1 and "caption" in reasons(out), out


def test_fingerprint_measurement_includes_the_tldr(d):
    from scripts.write_pipeline import authorprofile as PF
    from scripts.write_pipeline import fpcaps as FC
    d.to_stage("critic")
    cand = candidate(d)
    paras, sents = FC._prose(cand)
    assert any(unquote(OLD).strip() in p for p in paras)       # generation caps and fpverify count the TLDR's sentences and templates
    sl, pl, texts = PF._lengths(cand)
    assert any("lab report found median latency" in t for t in texts)


def test_an_edited_tldr_and_caption_survive_fpverify_and_the_final_integrity_gate(d):
    major_open(d)
    cand = candidate(d)
    rc, out = try_repair(d, cand.replace(OLD, NEW).replace(CAP, "*The two medians the lab reported, before and after the cache change.*"))
    assert rc == 0, out
    assert d.cli("run", "critic")[0] == 0
    assert d.cli("repair", "done")[0] == 0 and d.cli("fpverify", "done")[0] == 0
    rc, out = d.cli("run", "integrity")
    assert rc == 0, out
    final = (d.pkg / "FINAL.md").read_text()
    assert NEW in final and "The two medians the lab reported" in final
