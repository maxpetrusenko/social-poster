"""Offline checks of the held-out e2e harness: fixtures are well formed and the confusion tables count what they say."""
from collections import Counter

from scripts.fingerprint_eval.calibration import e2e


def test_set2_fixtures_are_balanced_and_apply_cleanly():
    res, ref, cases = e2e.load(2)
    cats = Counter((label, cat) for _, label, cat, _ in cases)
    assert sum(cats.values()) == 49 and cats[("PASS", "identity")] == 1
    assert all(n == 4 for k, n in cats.items() if k[1] != "identity") and len({k[1] for k in cats}) == 13
    assert [c for c in cases if c[3] == ref] == [c for c in cases if c[2] == "identity"]  # only the identity case equals the reference


def test_set1_lifts_segment_fixtures_to_whole_articles():
    _, ref, cases = e2e.load(1)
    assert len(cases) == 49 and sum(c[3] == ref for c in cases) == 1
    assert all(c[3] != ref for c in cases if c[2] != "identity")


def test_confusion_counts_and_ignores_errors():
    rows = [{"label": "FAIL", "result": "FAIL"}, {"label": "FAIL", "result": "PASS"}, {"label": "PASS", "result": "FAIL"},
            {"label": "PASS", "result": "PASS"}, {"label": "FAIL", "result": "ERROR"}]
    c = e2e.confusion(rows)
    assert (c["TP"], c["FN"], c["FP"], c["TN"]) == (1, 1, 1, 1) and c["precision"] == 0.5 and c["recall"] == 0.5
