"""Placeholder lint: real markdown links are never placeholders; true placeholders always are."""
from pathlib import Path

import pytest

from scripts.write_pipeline import mdlib as M

CANON = Path.home() / "Desktop/Projects/medium-automation/bio.md"
BIO = ("Max Petrusenko writes about AI agents; follow on [Medium](https://medium.com/@max.petrusenko), [X](https://x.com/petrusenko_max), "
       "[Substack](https://maxpetrusenko.substack.com/), or [LinkedIn](https://www.linkedin.com/in/max-petrusenko-40574b4a).")


def test_bio_with_linkedin_link_is_clean():
    assert M.find_placeholder(BIO) is None
    assert not any("placeholder" in x for x in M.lint_v6(f"# T\n\n### S\n\n{BIO}\n"))


@pytest.mark.skipif(not CANON.exists(), reason="canonical bio not on this host")
def test_canonical_bio_passes():
    assert M.find_placeholder(CANON.read_text()) is None


@pytest.mark.parametrize("text", ["[TODO]", "see [link] here", "[URL]", "<placeholder>", "[some label] with no url", "TBD", "lorem ipsum dolor",
                                  "[Link](TODO)", "[here]()", "[LinkedIn]", "[INSERT NAME]"])
def test_true_placeholders_fail(text):
    assert M.find_placeholder(f"A sentence. {text} more.")


@pytest.mark.parametrize("text", ["[Link](https://a.example/x)", "[link](https://a.example)", "[URL](https://a.example)", "[LINK](/relative)", "![alt](img.png)",
                                  "[ref][1]\n\n[1]: https://a.example", "footnote [1] and [sic]"])
def test_real_links_and_markers_pass(text):
    assert M.find_placeholder(text) is None
