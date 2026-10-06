"""The critic budget (3 rounds) belongs to the run. Resubmitting a title, subtitle, image or caption never refills it."""
import json

from .fakes import sha

MAJOR = {"verdict": "revise", "findings": [{"id": "F1", "severity": "major", "passage": "The report covers one workload on one fleet.", "reason": "stated as bare fact",
                                            "fix": "attribute it to the report"}]}


def state(d):
    return json.loads((d.pkg / "write-pipeline/state.json").read_text())


def resubmit_frame(d, n):
    """A caption change rebuilds the candidate frame (new bytes) without touching the prose."""
    imgs = d.images(caption=f"Median latency before and after the change, version {n}. Source: the lab report.")
    rc, out = d.submit("images", imgs)
    assert rc == 0, out


def test_round_count_survives_resubmitted_images_title_and_subtitle(d):
    d.to_stage("critic")
    d.critic.replies = [MAJOR, MAJOR, MAJOR]
    assert d.cli("run", "critic")[1]["round"] == 1
    resubmit_frame(d, 2)  # candidate bytes change, so the critic is STALE and must run again
    assert state(d)["critic"]["rounds"] == 1  # not reset by the images resubmit
    assert d.cli("run", "critic")[1]["round"] == 2
    t = dict(d.TITLES, subtitle="A 2025 report shows median latency falling from 120 ms to 85 ms on 40 nodes, measured on one workload.")
    assert d.submit("title", t)[0] == 0 and state(d)["critic"]["rounds"] == 2  # a new subtitle does not reset it either
    resubmit_frame(d, 3)
    rc, out = d.cli("run", "critic")
    assert rc == 3 and out["code"] == "NOT_READY" and "3 rounds per run" in out["reasons"][0]
    assert state(d)["critic"]["rounds"] == 3 and len(d.critic.prompts) == 3


def test_exhausted_budget_is_not_refilled_by_a_later_resubmit_and_no_fourth_model_call(d):
    d.to_stage("critic")
    d.critic.replies = [MAJOR, MAJOR, MAJOR, MAJOR]
    d.cli("run", "critic")
    for n in (2, 3):
        resubmit_frame(d, n)
        d.cli("run", "critic")
    assert len(d.critic.prompts) == 3
    resubmit_frame(d, 4)
    rc, out = d.cli("run", "critic")
    assert rc == 3 and out["code"] == "NOT_READY" and len(d.critic.prompts) == 3  # still three model calls, never a fourth
    assert d.cli("status", "--json")[1]["overall"] == "NOT_READY"


def test_not_ready_package_is_written_by_the_cli_with_the_open_findings(d):
    d.to_stage("critic")
    d.critic.replies = [MAJOR, MAJOR, MAJOR]
    d.cli("run", "critic")
    for n in (2, 3):
        resubmit_frame(d, n)
        d.cli("run", "critic")
    pm = (d.pkg / "PACKAGE.md").read_text()
    assert "NOT_READY" in pm.split("## READY/NOT_READY")[1] and "open critic finding F1" in pm and "The report covers one workload on one fleet." in pm
    assert "OPEN major F1" in pm  # also in the editorial scorecard
    fm, fh = (d.pkg / "FINAL.md").read_text(), (d.pkg / "FINAL.html").read_text()
    assert fm.startswith("> NOT READY.") and 'class="notready"' in fh and "NOT READY" in fh
    assert d.cli("finalize")[0] == 2  # nothing past the critic runs


def test_clean_critic_after_the_budget_carries_over_for_a_frame_only_change(d):
    d.to_stage("critic")
    d.critic.replies = [MAJOR, MAJOR, {"verdict": "pass", "findings": []}]
    d.cli("run", "critic")
    for n in (2, 3):
        cand = d.cli("status", "--json")  # keep the prose identical: only the frame changes
        resubmit_frame(d, n)
        rc, out = d.cli("run", "critic")
    assert out["majors"] == 0 and state(d)["critic"]["rounds"] == 3
    resubmit_frame(d, 4)  # frame only: the last clean verdict carries over with no fourth round
    rc, out = d.cli("run", "critic")
    assert rc == 0 and out["carried_over"] is True and len(d.critic.prompts) == 3


def test_stale_critic_still_blocks_repair_and_budget_is_signed_in_state(d):
    d.to_stage("critic")
    d.critic.replies = [MAJOR]
    d.cli("run", "critic")
    resubmit_frame(d, 2)
    f = d.write("r.md", "# x\n")
    rc, out = d.cli("repair", "try", "--file", str(f))
    assert rc == 2 and out["code"] == "WAITING"  # the critic is stale: it must see the new bytes first
    from scripts.fingerprint_eval import record as R
    assert state(d)[R.SIG_FIELD] and state(d)["critic"]["rounds"] == 1
    p = d.pkg / "write-pipeline/state.json"
    s = json.loads(p.read_text())
    s["critic"]["rounds"] = 0  # a hand edit that tries to refill the budget breaks the signature
    p.write_text(json.dumps(s))
    assert d.cli("status", "--json")[1]["overall"] == "NOT_READY"
