import pytest

from scripts.write_pipeline import verify

from .fakes import Driver, fake_record_check


@pytest.fixture(autouse=True)
def _key(tmp_path_factory, monkeypatch):
    monkeypatch.setenv("FINGERPRINT_EVAL_KEY_FILE", str(tmp_path_factory.mktemp("k") / "record.key"))
    monkeypatch.setattr(verify, "record_check", fake_record_check)  # the offline Runner writes a signed stand-in for the evaluator's gate record


@pytest.fixture(autouse=True)
def _roots(tmp_path, monkeypatch):
    monkeypatch.setenv("WRITE_PIPELINE_INPUT_ROOTS", str(tmp_path.parent))


@pytest.fixture
def d(tmp_path):
    return Driver(tmp_path)


@pytest.fixture(autouse=True)
def _bio(tmp_path_factory, monkeypatch):
    from .fakes import BIO_TEXT
    p = tmp_path_factory.mktemp("bio") / "bio.md"
    p.write_text(BIO_TEXT + "\n\n---\n\n**Read next ->** [An old pick](https://medium.com/x/old-1)\n")
    monkeypatch.setenv("WRITE_PIPELINE_BIO", str(p))


@pytest.fixture(autouse=True)
def _tiny_fixture_regression_tolerance(request, monkeypatch):
    """The fixtures are ~120 word articles: the frame (title, subtitle, caption, alt) alone shifts their n-gram share, so the strict
    final-vs-draft guard (fpcontract.REGRESSION_EPS = 0.0) is relaxed here. test_regression_guard.py pins the strict value itself."""
    if request.module.__name__.endswith("test_regression_guard"):
        return
    from scripts.write_pipeline import fpcontract as CT
    monkeypatch.setattr(CT, "REGRESSION_EPS", 1000.0)
