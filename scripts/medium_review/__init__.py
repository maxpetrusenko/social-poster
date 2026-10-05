"""Medium distribution / Boost review: an advisory evaluator, separate from fingerprint-eval.

Fingerprint-eval is the integrity gate (claims, links, structure) plus style diagnostics. This package
judges only how Medium's published distribution guidelines would read the story. It never blocks
publishing itself; the release controller decides. See docs/medium-distribution-review.md.
"""
REVIEW_VERSION = 1
DISCLAIMER = "A score does not guarantee Boost. Medium curators make the final call, and the guidelines describe nuanced characteristics, not a checklist."
