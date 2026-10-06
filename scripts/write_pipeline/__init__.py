"""Deterministic write pipeline: state, caching, gating and verification around the agent-run semantic stages.

The agent (Sonnet via claude -p, running the generate-article skill) writes prose and judgement artifacts. This package
never writes prose. It validates each artifact, binds it by hash to its inputs, skips unchanged stages, measures our own
fingerprint metrics, and calls the existing evaluator modules (fingerprint_eval, medium_review, publish_route).
Nothing here publishes, schedules or mutates Medium.
"""
PIPELINE_VERSION = "2"
