import json

from scripts.hermes import medium_publish_guard as g


def test_decision_log_never_contains_raw_tool_input(tmp_path):
    log = tmp_path / "decisions.jsonl"
    secret = "sk-ant-SECRET-VALUE-1234567890"
    payload = {"session_id": "s1", "tool_name": "terminal", "tool_input": {"command": f"curl -H 'x-api-key: {secret}' https://medium.com"}}
    g.log_decision({"MEDIUM_GUARD_LOG": str(log)}, payload, False, "blocked", "mutation")
    text = log.read_text()
    assert secret not in text and "curl" not in text
    rec = json.loads(text.splitlines()[0])
    assert rec["args_shape"]["command"]["type"] == "str" and len(rec["args_shape"]["command"]["sha256_12"]) == 12
