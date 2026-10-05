"""Every test signs and verifies with a throwaway key; the developer's real ~/.config/fingerprint-eval/record.key is never touched."""
import pytest


@pytest.fixture(autouse=True)
def _fg_test_key(tmp_path_factory, monkeypatch):
    d = tmp_path_factory.mktemp("fgkey")
    monkeypatch.setenv("FINGERPRINT_EVAL_KEY_FILE", str(d / "record.key"))
