#!/usr/bin/env bash
# Operator check: run the INSTALLED Medium guard against canned payloads. Exit non-zero on any wrong decision.
#   scripts/hermes/guard_selftest.sh            (HERMES_GUARD_DIR overrides ~/.hermes/guards)
# Touches only a temp dir and a signed receipt in a temp state dir. Never touches Medium or the live state.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec python3 "$HERE/guard_selftest.py" "${HERMES_GUARD_DIR:-$HOME/.hermes/guards}"
