"""The critic must not flag required skill furniture for removal; a deterministic post-filter marks such findings not_applicable."""
import json

from scripts.write_pipeline import criticev as CE
from scripts.write_pipeline import furniture as FU

from .test_critic_budget import state


def reply(*findings):
    return {"verdict": "revise", "findings": [{"id": f"F{i}", "severity": "major", "kind": "other", "reason": "r", **f} for i, f in enumerate(findings, 1)]}


def run(d, *findings):
    d.to_stage("critic")
    return run_after(d, *findings)


def final_text(d):
    return (d.pkg / state(d)["candidate"]["path"]).read_text()


def run_after(d, *findings):
    d.critic.replies = [reply(*findings)]
    rc, out = d.cli("run", "critic")
    return rc, out, json.loads((d.pkg / state(d)["stages"]["critic"]["artifact"]).read_text())


def test_prompt_states_the_furniture_is_required(d):
    d.to_stage("critic")
    d.critic.replies = [{"verdict": "pass", "findings": []}]
    assert d.cli("run", "critic")[0] == 0
    p = d.critic.prompts[0]
    assert "REQUIRED by the" in p and "medium-article-generator" in p and "TLDR" in p and "pass-it-on" in p and "Read next" in p


def test_remove_the_tldr_finding_is_not_applicable_and_does_not_count(d):
    d.to_stage("critic")
    tl = FU.tldr_block(final_text(d))
    assert tl
    rc, out, art = run_after(d, {"passage": tl.lstrip("> ").strip(), "fix": "Remove the TLDR blockquote; it repeats the opening."})
    f = art["findings"][0]
    assert rc == 0 and out["majors"] == 0 and art["majors"] == 0 and art["verdict"] == "pass", out
    assert f["severity"] == "not_applicable" and f["original_severity"] == "major" and "TLDR" in f["not_applicable"] and "required furniture" in f["not_applicable"]
    assert d.cli("repair", "done")[0] == 0  # no open major: the repair stage is not asked to delete the TLDR


def test_remove_the_pass_it_on_line_is_not_applicable(d):
    d.to_stage("critic")
    line = FU.DEFAULT_PASS_IT_ON
    assert line in final_text(d)
    rc, out, art = run_after(d, {"passage": line, "fix": "Delete the pass-it-on line."})
    assert art["findings"][0]["severity"] == "not_applicable" and art["majors"] == 0


def test_a_content_finding_on_the_tldr_still_counts(d):
    d.to_stage("critic")
    tl = FU.tldr_block(final_text(d)).lstrip("> ").strip()
    rc, out, art = run_after(d, {"passage": tl, "fix": "Remove the word 'only' and state the one-workload limit; the claim overreaches."})
    assert art["findings"][0]["severity"] == "major" and art["majors"] == 1


def test_unit_filter_covers_each_element_and_leaves_body_fixes_alone():
    text = ("# T\n\n*sub*\n\n![hero](assets/hero.jpg)\n\n*Caption of the hero.*\n\n> A TLDR sentence that sums up the body in plain words for the reader here.\n\n"
            "## Body\n\nThe body has a claim that overreaches.\n\n---\n\nRead next: [Another piece](https://medium.com/@a/another-piece-0123456789ab)\n\n---\n\n"
            "Bio paragraph about the author and the work.\n\n" + FU.DEFAULT_PASS_IT_ON + "\n")
    f = lambda passage, fix, sev="major": {"id": "F", "severity": sev, "passage": passage, "fix": fix, "verified": True}  # noqa: E731
    out = CE.furniture_filter([
        f("Read next: [Another piece](https://medium.com/@a/another-piece-0123456789ab)", "Remove the Read next line."),
        f("Bio paragraph about the author and the work.", "Delete the bio.", "minor"),
        f("anything", "Drop the hero image and caption."),
        f("The body has a claim that overreaches.", "Remove this sentence."),
        f("The body has a claim that overreaches.", "Cut the claim, or soften it."),
    ], text)
    assert [x["severity"] for x in out] == ["not_applicable", "not_applicable", "not_applicable", "major", "major"]
    assert out[1]["original_severity"] == "minor"
