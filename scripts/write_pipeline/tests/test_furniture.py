"""Article furniture: hero, TLDR, frozen footer (Read next, author bio, sharing line, disclosure), FINAL.html and PACKAGE.md reporting."""
import json
import re

from scripts.fingerprint_eval.guards import frozen_diff, frozen_blocks
from scripts.fingerprint_eval.rewrite import segment_article
from scripts.write_pipeline import furniture as FU

from .fakes import BIO_TEXT, jpeg, png
from .test_failures import overall
from .test_injection import passed, state_json

RN = {"title": "Why tail latency tells a different story", "url": "https://medium.com/@max.petrusenko/why-tail-latency-tells-a-different-story-0123456789ab"}


def titles(d, **over):
    t = {**d.TITLES, **over}
    for k in [k for k, v in over.items() if v is None]:
        t.pop(k)
    return t


def final(d) -> str:
    return (d.pkg / "FINAL.md").read_text()


def reasons(out) -> str:
    return " ".join(out["reasons"])


# ---- title stage: TLDR, Read next ------------------------------------------------------------------------------------
def test_title_requires_a_tldr(d):
    d.to_stage("title")
    rc, out = d.submit("title", titles(d, tldr=None))
    assert rc == 1 and "'tldr' is required" in reasons(out)


def test_tldr_rejects_the_direct_answer_label_new_numbers_links_and_experience(d):
    d.to_stage("title")
    ok = d.TITLES["tldr"]
    for bad, why in ((f"Direct answer: {ok}", "Direct answer"), (ok.replace("40 nodes", "400 nodes"), "not in the body"), (ok + " See https://x.org/a for more.", "plain prose"),
                     (ok + " I tested this on my own fleet last year.", "experience"), ("Too short to summarise anything.", "words")):
        rc, out = d.submit("title", titles(d, tldr=bad))
        assert rc == 1 and why in reasons(out), (bad, out)


def test_tldr_is_checked_by_the_claims_gate_against_the_body(d):
    d.to_stage("title")
    d.runner.forbidden = ["confirmed the result on cloud hardware"]
    claim = d.TITLES["tldr"] + " The authors also confirmed the result on cloud hardware."
    rc, out = d.submit("title", titles(d, tldr=claim))
    assert rc == 1 and "adds a claim" in reasons(out)
    d.runner.forbidden = []
    assert d.submit("title", titles(d))[0] == 0
    assert d.runner.n("scripts.write_pipeline.gaterun") >= 2  # the gate saw the TLDR against the body, with the source notes


def test_tldr_gate_error_blocks_instead_of_passing(d):
    d.to_stage("title")
    d.runner.gate = "ERROR"
    rc, out = d.submit("title", titles(d))
    assert rc == 4 and out["code"] == "BLOCKED"


def test_read_next_must_be_a_medium_url_and_is_never_invented(d):
    d.to_stage("title")
    for bad in ({"title": "A post", "url": "https://example.com/post"}, {"title": "A post", "url": "http://medium.com/x/y"}, {"title": "A post", "url": "https://medium.com.evil.io/x"},
                {"title": "", "url": RN["url"]}, {"title": "A [post]", "url": RN["url"]}, "https://medium.com/x"):
        rc, out = d.submit("title", titles(d, read_next=bad))
        assert rc == 1 and "read_next" in reasons(out), bad
    assert d.submit("title", titles(d, read_next={"title": "A post", "url": "https://publication.medium.com/a-post-123"}))[0] == 0
    rc, out = d.submit("title", titles(d, read_next=None))
    assert rc == 0 and any("AUTHOR OPPORTUNITY" in x for x in out["author_opportunities"])


def test_pass_it_on_must_be_first_person(d):
    d.to_stage("title")
    rc, out = d.submit("title", titles(d, pass_it_on="Readers may share this article with others."))
    assert rc == 1 and "first person" in reasons(out)


def test_a_missing_bio_file_fails_the_title_stage(d, monkeypatch, tmp_path):
    d.to_stage("title")
    monkeypatch.setenv("WRITE_PIPELINE_BIO", str(tmp_path / "nope.md"))
    rc, out = d.submit("title", titles(d))
    assert rc == 1 and "author bio" in reasons(out)


# ---- images stage: the hero contract ---------------------------------------------------------------------------------
def frame_hero(d, **over):
    kw = {"method": "frame", "source_url": "https://www.youtube.com/watch?v=abc123", "timestamp": "00:12:40", "presenter_face": False,
          "provenance": "Extracted at 00:12:40 from the source video, scaled to 1280x720, screened: a chart panel, no presenter"}
    return d.images(**{**kw, **over})


def test_images_need_a_hero_with_a_recorded_provenance_at_assets_hero_jpg(d):
    d.to_stage("images")
    for over, why in (({"method": "diagram"}, "hero method"), ({"provenance": "made"}, "provenance"), ({"path": "assets/other.jpg"}, "assets/hero.jpg"),
                      ({"contains_presenter": True}, "presenter")):
        if over.get("path"):
            jpeg(d.pkg / "assets" / "other.jpg")
        rc, out = d.submit("images", d.images(**over))
        assert rc == 1 and why in reasons(out), (over, out)
    jpeg(d.pkg / "assets" / "hero.jpg", 1000, 560)
    imgs = d.images()
    jpeg(d.pkg / "assets" / "hero.jpg", 1000, 560)
    rc, out = d.submit("images", imgs)
    assert rc == 1 and "below the quality bar" in reasons(out)


def test_hero_must_be_a_jpeg(d):
    d.to_stage("images")
    imgs = d.images()
    png(d.pkg / "assets" / "hero.jpg")
    rc, out = d.submit("images", imgs)
    assert rc == 1 and "JPEG" in reasons(out)


def test_a_documentary_frame_hero_is_accepted_and_a_presenter_or_thumbnail_is_not(d):
    d.to_stage("images")
    assert d.submit("images", frame_hero(d))[0] == 0
    for over, why in (({"presenter_face": None}, "presenter_face"), ({"timestamp": ""}, "timestamp"), ({"source_url": ""}, "source_url"),
                      ({"provenance": "The video's default thumbnail, the presenter pointing at a slide, 1280x720"}, "thumbnail or presenter")):
        rc, out = d.submit("images", frame_hero(d, **over))
        assert rc == 1 and why in reasons(out), (over, out)


def test_licensed_hero_needs_a_source_url(d):
    d.to_stage("images")
    rc, out = d.submit("images", d.images(method="licensed"))
    assert rc == 1 and "source_url" in reasons(out)
    assert d.submit("images", d.images(method="licensed", source_url="https://example.com/photo/1"))[0] == 0


# ---- FINAL.md, FINAL.html, PACKAGE.md ---------------------------------------------------------------------------------
def test_final_md_has_hero_tldr_body_and_the_footer_in_order(d):
    d.TITLES = titles(d, read_next=RN)
    passed(d)
    t = final(d)
    assert re.match(r"# .+\n\n### .+\n\n!\[[^\]]+\]\(assets/hero\.jpg\)\n\n\*[^\n]+\*\n\n> A 2025 lab report found", t)
    assert t.index("> A 2025 lab report") < t.index("## What the test measured")
    assert t.endswith(f"\n---\n\nRead next: [{RN['title']}]({RN['url']})\n\n---\n\n{BIO_TEXT}\n\n{FU.DEFAULT_PASS_IT_ON}\n")
    assert state_json(d)["stages"]["images"]["bio_sha256"]


def test_the_bio_path_is_configurable_and_read_verbatim(d, monkeypatch, tmp_path):
    bio = tmp_path / "other-bio.md"
    bio.write_text("Someone Else writes about gardens; read more on [Medium](https://medium.com/@someone).\n\n---\n\n**Read next** [x](https://medium.com/x/y)\n")
    monkeypatch.setenv("WRITE_PIPELINE_BIO", str(bio))
    d.TITLES = titles(d, read_next=RN)
    passed(d)
    t = final(d)
    assert "Someone Else writes about gardens; read more on [Medium](https://medium.com/@someone).\n\n" + FU.DEFAULT_PASS_IT_ON in t and BIO_TEXT not in t


def test_no_read_next_omits_the_line_and_records_an_author_opportunity(d):
    d.TITLES = titles(d, read_next=None)
    passed(d)
    t = final(d)
    assert "Read next" not in t and t.endswith(f"\n---\n\n{BIO_TEXT}\n\n{FU.DEFAULT_PASS_IT_ON}\n")
    pk = (d.pkg / "PACKAGE.md").read_text()
    assert "- Read next: missing" in pk and pk.count("AUTHOR OPPORTUNITY: add a related published Medium article") >= 1


def test_the_disclosure_line_is_rendered_after_the_footer(d):
    d.TITLES = titles(d, read_next=RN, disclosure="Disclosure: drafted with AI assistance and edited by the author.")
    passed(d)
    assert final(d).endswith(f"{FU.DEFAULT_PASS_IT_ON}\n\nDisclosure: drafted with AI assistance and edited by the author.\n")
    assert "- disclosure: present" in (d.pkg / "PACKAGE.md").read_text()


def test_final_html_renders_the_hero_inline_from_a_package_relative_path(d):
    d.TITLES = titles(d, read_next=RN)
    passed(d)
    h = (d.pkg / "FINAL.html").read_text()
    m = re.search(r'<img src="([^"]+)" alt="([^"]+)"', h)
    assert m and m.group(1) == "assets/hero.jpg" and not m.group(1).startswith(("/", "http", "file:"))
    assert (d.pkg / m.group(1)).is_file()
    assert h.index("<img") < h.index("<blockquote>") < h.index("What the test measured")
    assert 'href="https://medium.com/@max.petrusenko/why-tail' in h


def test_package_md_reports_the_hero_and_every_furniture_part(d):
    d.TITLES = titles(d, read_next=RN)
    passed(d)
    pk = (d.pkg / "PACKAGE.md").read_text()
    img = pk.split("## IMAGES")[1].split("\n## ")[0]
    assert "HERO: method generated" in img and "provenance: Generated by the pipeline operator" in img and "caption: Median latency" in img and "ALT: Two bars" in img
    fur = pk.split("## FURNITURE")[1].split("\n## ")[0]
    for part in ("hero", "TLDR", "Read next", "bio", "pass-it-on"):
        assert f"- {part}: present" in fur
    assert "- disclosure: none requested" in fur and "WRITE_PIPELINE_BIO" not in fur and "bio.md" in fur


# ---- frozen boilerplate ------------------------------------------------------------------------------------------------
def tamper(d, old, new):
    p = passed(d)
    p.write_text(p.read_text().replace(old, new))
    rc, out = d.cli("revalidate")
    assert rc == 3 and overall(d) == "NOT_READY", out
    return " ".join(state_json(d)["stages"]["integrity"]["reasons"])


def test_editing_the_bio_fails_the_final_check(d):
    d.TITLES = titles(d, read_next=RN)
    why = tamper(d, "writes about AI agents", "writes lovingly about AI agents")
    assert "footer" in why


def test_editing_read_next_or_the_sharing_line_fails(d):
    d.TITLES = titles(d, read_next=RN)
    assert "footer" in tamper(d, "Why tail latency tells a different story", "Why tail latency tells another story")


def test_editing_the_sharing_line_fails(d):
    d.TITLES = titles(d, read_next=RN)
    assert "footer" in tamper(d, "passed it on", "forwarded it")


def test_removing_the_footer_fails(d):
    d.TITLES = titles(d, read_next=RN)
    p = passed(d)
    p.write_text(p.read_text().split("\n---\n")[0] + "\n")
    rc, out = d.cli("revalidate")
    assert rc == 3 and "STRUCTURAL_DAMAGE" in state_json(d)["stages"]["integrity"]["categories"]


def test_a_changed_bio_source_after_the_images_stage_fails_closed(d, monkeypatch, tmp_path):
    d.TITLES = titles(d, read_next=RN)
    d.to_stage("integrity")
    other = tmp_path / "bio2.md"
    other.write_text("A different bio that links [Medium](https://medium.com/@max.petrusenko).\n")
    monkeypatch.setenv("WRITE_PIPELINE_BIO", str(other))
    rc, out = d.cli("finalize")
    assert rc == 3 and "footer" in " ".join(out["results"]["integrity"]["reasons"])


FOOT = f"\n---\n\nRead next: [A post](https://medium.com/x/a-post)\n\n---\n\n{BIO_TEXT}\n\nI hope you pass it on to someone who will use it, and I would like to hear what you build.\n"
ART = "# T\n\n### S\n\n![alt text here](assets/hero.jpg)\n\n*cap*\n\n> A summary of the whole article in one paragraph of plain prose that is long enough to count.\n\n## Part\n\nThe lab ran a latency test on 40 nodes in 2025 and published the numbers in its report.\n"


def test_the_evaluator_gate_freezes_the_footer_and_extracts_no_claims_from_it():
    segs = segment_article(ART + FOOT)
    prose = [s.text for s in segs if not s.frozen]
    assert prose == ["The lab ran a latency test on 40 nodes in 2025 and published the numbers in its report."]
    fr = frozen_blocks(ART + FOOT)
    assert BIO_TEXT in fr and any(x.startswith("Read next:") for x in fr)
    assert frozen_diff(ART + FOOT, ART + FOOT) == []
    assert frozen_diff(ART + FOOT, ART + FOOT.replace("writes about", "writes much about"))  # byte-exact: any edit is a difference


def test_a_trailing_rule_in_the_body_does_not_hide_prose_from_the_gate():
    t = ART + "\n---\n\nThe lab also tested 400 nodes in 2026 and found the opposite result everywhere it looked.\n"
    assert [s.text for s in segment_article(t) if not s.frozen][-1].startswith("The lab also tested 400 nodes")


def test_split_footer_and_status():
    core, foot = FU.split_footer(ART + FOOT)
    assert core.rstrip().endswith("in its report.") and foot == FOOT.lstrip("\n")
    assert FU.split_footer(ART)[1] is None
    st = FU.status(ART + FOOT, {"pass_it_on": "I hope you pass it on to someone who will use it, and I would like to hear what you build.", "disclosure": None}, BIO_TEXT)
    assert st["hero"] == st["TLDR"] == st["Read next"] == st["bio"] == st["pass-it-on"] == "present"
    miss = FU.status("# T\n\n### S\n\nBody.\n", None, BIO_TEXT)
    assert miss["hero"] == miss["TLDR"] == miss["Read next"] == miss["bio"] == miss["pass-it-on"] == "missing"
