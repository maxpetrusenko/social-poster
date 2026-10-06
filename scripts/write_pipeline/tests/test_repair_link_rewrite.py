"""A repair may rewrite a link-bearing sentence when its URL set is kept and the rewrite is declared with its replacement.
Real sentences: the forecasting-tournament paragraph of the one-book run (write-pipeline/artifacts/13-images.candidate.md -> article-final.md)."""
import copy

from .fakes import DRAFT, URL
from .test_critic_budget import state
from .test_repair_adds import candidate, try_repair

MELLERS = "http://www.houdekpetr.cz/!data/papers/Mellers%20et%20al%202014.pdf"
OLD1 = f"One large test of that instruction, on this article's own reading, came in a [multi-year geopolitical tournament]({MELLERS})."
OLD2 = "Forecasters in it received probability training and worked on teams rather than alone."
NEW = (f"A [multi-year geopolitical tournament]({MELLERS}) evaluated probability training, teaming and tracking as interventions, "
       "and the walkthrough's advice resembles the first of those only loosely.")
SECTION = ("\n## What the forecasting tournament measured\n\n"
           f"The walkthrough asks you to replace binary thinking with probabilities and to say how confident you are. {OLD1} {OLD2} "
           "The organisers also tracked the best performers, moving the top ones from the first year into teams that kept working together. "
           "Calibration and resolution both improved.\n")
CRITIC = {"verdict": "revise", "findings": [{"id": "F1", "severity": "major", "passage": OLD1, "reason": "overclaims what the tournament tested",
                                             "fix": "reword to what the paper reports"}]}


def setup(d):
    d.EVIDENCE = copy.deepcopy(d.EVIDENCE)
    d.EVIDENCE["claims"].append({"id": "c5", "claim": "Mellers and coauthors reported that probability training, team collaboration and tracking improved both calibration and resolution in a multi-year geopolitical forecasting tournament.",
                                 "status": "supported", "supported_wording": "Probability training, team collaboration and tracking improved both calibration and resolution in a multi-year forecasting tournament.",
                                 "evidence": [{"url": MELLERS, "passage": "Results showed that probability training, team collaboration, and tracking improved both calibration and resolution. ... Training, teaming, and tracking are psychological interventions that dramatically increased the accuracy of forecasts."}]})
    d.FACTUAL = {"checked": [*d.FACTUAL["checked"], {"claim_id": "c5", "verdict": "supported"}]}
    d.same_text(DRAFT.rstrip("\n") + "\n" + SECTION)
    d.to_stage("critic")
    d.critic.replies = [CRITIC]
    assert d.cli("run", "critic")[1]["majors"] == 1
    return candidate(d)


def rewritten(cand):
    return cand.replace(f"{OLD1} {OLD2}", NEW)


def decl(**kw):
    return [{"text": OLD1, "reason": "overclaims what the tournament tested", "replacement": NEW, **kw}, {"text": OLD2, "reason": "folded into the rewritten sentence"}]


def test_declared_rewrite_of_a_link_bearing_sentence_keeping_its_url_is_accepted(d):
    cand = setup(d)
    assert OLD1 in cand
    rc, out = try_repair(d, rewritten(cand), removals=decl())
    assert rc == 0 and out["code"] == "ACCEPTED", out
    assert NEW in candidate(d) and OLD1 not in candidate(d)
    led = [e for e in state(d)["removals_ledger"] if e["stage"] == "repair"]
    assert any(e.get("replacement") == NEW for e in led)  # the signed ledger records the replacement


def test_the_replacement_is_support_checked_like_an_added_sentence(d):
    cand = setup(d)
    d.runner.unsupported = ["resembles the first of those only loosely"]  # the claims gate's added-claim check finds it unsupported
    rc, out = try_repair(d, rewritten(cand), removals=decl())
    assert rc == 1 and any("unsupported by the evidence ledger" in r for r in out["reasons"]), out
    bad = NEW.replace("evaluated", "proved beyond doubt 2013")
    rc, out = try_repair(d, cand.replace(f"{OLD1} {OLD2}", bad), removals=decl(replacement=bad))
    assert rc == 1 and any("number" in r for r in out["reasons"]), out


def test_url_loss_in_a_rewrite_hard_fails(d):
    cand = setup(d)
    plain = NEW.replace(f"[multi-year geopolitical tournament]({MELLERS})", "multi-year geopolitical tournament")
    rc, out = try_repair(d, cand.replace(f"{OLD1} {OLD2}", plain), removals=decl(replacement=plain))
    assert rc == 1 and any("link" in r for r in out["reasons"]), out
    assert OLD1 in candidate(d)


def test_undeclared_rewrite_of_a_link_bearing_sentence_hard_fails(d):
    cand = setup(d)
    rc, out = try_repair(d, rewritten(cand))
    assert rc == 1 and any("without a declaration" in r for r in out["reasons"]), out
    rc, out = try_repair(d, rewritten(cand), removals=[{"text": OLD1, "reason": "no replacement given"}, {"text": OLD2, "reason": "x"}])
    assert rc in (1, 3), out  # declared without a replacement it is an ordinary cut plus an added sentence: no softening word is waved through


def test_replacement_must_appear_verbatim_and_map_to_a_ledger_claim(d):
    cand = setup(d)
    rc, out = try_repair(d, rewritten(cand), removals=decl(replacement=NEW + " It settled the matter."))
    assert rc == 1 and any("not in the text word for word" in r for r in out["reasons"]), out
    offtopic = f"The [paper]({MELLERS}) is long."
    rc, out = try_repair(d, cand.replace(f"{OLD1} {OLD2}", offtopic), removals=decl(replacement=offtopic))
    assert rc == 1 and any("no evidence-ledger claim" in r for r in out["reasons"]), out
