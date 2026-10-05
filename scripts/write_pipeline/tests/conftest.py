import pytest

from .fakes import Driver


@pytest.fixture(autouse=True)
def _key(tmp_path_factory, monkeypatch):
    monkeypatch.setenv("FINGERPRINT_EVAL_KEY_FILE", str(tmp_path_factory.mktemp("k") / "record.key"))


@pytest.fixture
def d(tmp_path):
    return Driver(tmp_path)
