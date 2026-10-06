"""The TLDR under the hero is editable prose; the hero caption is editable; the footer, the hero image and every other quote stay frozen."""
import json

from scripts.fingerprint_eval import added
from scripts.fingerprint_eval.guards import frozen_blocks, frozen_diff
from scripts.fingerprint_eval.rewrite import hero_furniture, segment_article
from scripts.fingerprint_eval.textutil import parse_blocks

from .fakes import Fakes

BODY = ("## Section\n\nThe reactor ran for forty days without a single fault. It was inspected twice by the crew.\n\n"
        "> a quote inside the body stays put\n\n- item alpha one\n- item beta two\n")
FOOT = ("\n---\n\nRead next: [Another piece](https://medium.com/@a/another-1)\n\n---\n\nBio line with [Medium](https://medium.com/@a).\n\nPass it on.\n")
TLDR = "> The reactor ran for forty days without a fault, and the crew inspected it twice."


def doc(tldr=TLDR, caption="*A picture of the reactor hall.*", alt="Reactor hall", body=BODY):
    return f"# Title\n\n### Subtitle line\n\n![{alt}](assets/hero.jpg)\n\n{caption}\n\n{tldr}\n\n{body}{FOOT}"


def seg(md, **kw):
    return {("tldr" if s.tldr else "caption" if s.caption else "x"): s for s in segment_article(md)}


def test_the_quote_under_the_hero_is_prose_and_the_caption_is_marked():
    s = seg(doc())
    assert s["tldr"].frozen is False and s["caption"].frozen is True
    bl = parse_blocks(doc())
    cap, tl = hero_furniture(bl)
    assert bl[cap].text.startswith("*A picture") and bl[tl].text.startswith("> The reactor")


def test_other_quotes_and_the_footer_stay_frozen():
    frozen = frozen_blocks(doc())
    assert "> a quote inside the body stays put" in frozen
    assert not any("The reactor ran for forty days without a fault" in b for b in frozen)  # the TLDR is not a frozen block
    assert any("Bio line" in b for b in frozen)
    no_hero = "# T\n\n### S\n\n> A quote with no hero image above it, so it is an ordinary frozen quote.\n\n" + BODY
    assert any(b.startswith("> A quote with no hero") for b in frozen_blocks(no_hero))
    after_h2 = "# T\n\n## Early\n\n![alt](a.jpg)\n\n> This quote follows an image inside the body, not the hero.\n\n" + BODY
    assert any(b.startswith("> This quote follows") for b in frozen_blocks(after_h2))


def test_editing_the_tldr_or_the_caption_is_not_a_frozen_diff_but_the_footer_image_and_other_quotes_are():
    base = doc()
    assert frozen_diff(base, doc(tldr="> A shorter summary of the same reactor story.")) == []
    assert frozen_diff(base, doc(caption="*The reactor hall, seen from the gallery.*")) == []
    assert frozen_diff(base, doc(body=BODY.replace("stays put", "moved"))) != []
    assert frozen_diff(base, base.replace("Pass it on.", "Pass it along.")) != []
    assert frozen_diff(base, doc(alt="A different image")) != []  # the image reference (path and ALT, i.e. its provenance record) is still frozen


def test_tldr_sentences_are_checked_as_prose_against_the_whole_body():
    ref = doc()
    assert added.new_sentences(ref, doc(tldr=TLDR)) == {}
    new = added.new_sentences(ref, doc(tldr="> The reactor ran for forty days. Regulators later fined the operator nine million dollars."))
    assert list(new) == [added.TLDR_SECTION] and any("fined" in s for s in new[added.TLDR_SECTION])
    seen = {}
    f = Fakes()
    f.judge_reply = lambda p: (seen.update(p=p), json.dumps([{"i": 1, "verdict": "unsupported", "reason": "new"}]))[1]
    with f:
        res = added.check_added(ref, doc(tldr="> The reactor ran for forty days. Regulators later fined the operator nine million dollars."), None, "claude:sonnet", "claude:sonnet")
    assert res["unsupported"] and res["unsupported"][0]["section"] == added.TLDR_SECTION
    assert "inspected twice by the crew" in seen["p"]  # the material is the body the TLDR summarises
