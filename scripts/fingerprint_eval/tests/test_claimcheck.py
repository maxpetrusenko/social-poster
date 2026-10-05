"""Deterministic claim checks: hedge/certainty/quantifier lexicon, numbers, negations, removed sentences. Offline (embedder stubbed)."""
import pytest

from scripts.fingerprint_eval import claimcheck as C
from scripts.fingerprint_eval import guards

PARA = ("The study might explain part of the drop in covert actions across models. Researchers measured the rate at three labs over two years. "
        "Anthropic reported the caveat in its own system card for the model.")


@pytest.fixture(autouse=True)
def _no_gateway(monkeypatch):
    """Hash embedder: identical text is cosine 1.0, anything else is low. A test that wants a rescue passes its own."""
    def emb(texts):
        return [[1.0 if i == hash(t) % 7 else 0.0 for i in range(7)] + [0.01] for t in texts]
    monkeypatch.setattr(guards, "_embed", emb)


def run(final, draft=PARA):
    return C.check_claims(f"# T\n\n## S\n\n{draft}\n", f"# T\n\n## S\n\n{final}\n")


def test_unchanged_and_benign_edits_find_nothing():
    assert run(PARA) == []
    assert run(PARA.replace("measured the rate", "measured that rate")) == []
    merged = PARA.replace("models. Researchers", "models, and researchers")  # merge
    assert run(merged) == []


@pytest.mark.parametrize("old,new,key,term", [
    ("might explain", "explains", "modality", "might"),
    ("might explain", "proves", "modality", "prove"),   # swap: might out, prove in
    ("part of the drop", "the drop", "modality", "some"),
    ("three labs", "five labs", "numbers", "three"),
    ("measured the rate", "did not measure the rate", "negations", "not"),
    ("covert actions across models", "covert actions across most models", "modality", "most"),
    ("two years", "about 2 years", "numbers", "2"),
])
def test_aligned_sentence_feature_changes_fail(old, new, key, term):
    found = run(PARA.replace(old, new))
    assert found and found[0]["verdict"] == "changed" and found[0]["dimension"] == key and term in found[0]["reason"]


def test_inflection_is_not_a_swap_but_a_different_verb_is():
    assert C.modality("It shows the gap.") == C.modality("It showed the gap.") == C.modality("It has shown the gap.")
    assert C.modality("It suggests the gap.") != C.modality("It proves the gap.")
    assert C.modality("About 40 people came.") == {"about"} and C.modality("Think about it.") == frozenset()
    assert C.modality("At least four, up to nine.") == {"at least", "up to"}


def test_removed_sentence_fails_even_when_the_extractor_never_saw_it():
    found = run(PARA.replace(" Anthropic reported the caveat in its own system card for the model.", ""))
    assert [f["verdict"] for f in found] == ["missing"] and "Anthropic reported" in found[0]["claim"]


def test_short_sentence_removal_is_below_the_floor():
    draft = PARA + " It held."
    assert run(PARA, draft=draft) == []


def test_split_is_not_a_removal():
    split = PARA.replace("across models. Researchers measured the rate at three labs over two years.", "across models. Researchers measured the rate. They did it at three labs over two years.")
    assert run(split) == []


def test_paraphrase_is_rescued_by_embedding_and_removal_is_not(monkeypatch):
    para = "The conglomerate eventually abandoned its flagship refinery after protracted litigation."
    draft = f"{PARA} {para}"
    final = f"{PARA} The company finally shut down its main plant once the court fight dragged on."
    assert [f["verdict"] for f in run(final, draft)] == ["missing"]  # hash embedder: not similar
    monkeypatch.setattr(guards, "_embed", lambda texts: [[1.0, 0.0] for _ in texts])  # everything similar
    assert run(final, draft) == []


def test_embedder_is_not_called_when_everything_aligns_lexically(monkeypatch):
    monkeypatch.setattr(guards, "_embed", lambda texts: pytest.fail("embedder must not run"))
    assert run(PARA.replace("measured", "measured")) == []
