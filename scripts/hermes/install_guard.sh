#!/usr/bin/env bash
# Install a pinned, read-only copy of the Medium publish guard outside the repo.
#
#   scripts/hermes/install_guard.sh [--rotate-key]
#
# Env: HERMES_GUARD_DIR (default ~/.hermes/guards), MEDIUM_GUARD_WORKSPACE (default <repo>/data/article-workspace)
# Result: <dir>/medium_publish_guard.py 0444, config.json 0444, manifest.sha256 0444, key 0400, dir 0555,
#         <dir>/state 0700 (receipts + url memory, HMAC-signed with key).
# Best effort only: the same OS user can chmod these back. See docs/hermes-medium-release.md.
set -euo pipefail

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$SRC_DIR/../.." && pwd)"
DEST="${HERMES_GUARD_DIR:-$HOME/.hermes/guards}"
WORKSPACE="${MEDIUM_GUARD_WORKSPACE:-$REPO/data/article-workspace}"
ROTATE=0
[ "${1:-}" = "--rotate-key" ] && ROTATE=1

sha256() { if command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1" | cut -d' ' -f1; else sha256sum "$1" | cut -d' ' -f1; fi; }

[ -f "$SRC_DIR/medium_publish_guard.py" ] || { echo "install_guard: guard source missing" >&2; exit 1; }
python3 -c 'import sys; sys.exit(0 if sys.version_info >= (3, 9) else 1)' || { echo "install_guard: python3 >= 3.9 required" >&2; exit 1; }

umask 077
mkdir -p "$DEST"
chmod 0700 "$DEST"                      # writable while installing; locked at the end
mkdir -p "$DEST/state"
chmod 0700 "$DEST/state"

if [ "$ROTATE" = 1 ] || [ ! -f "$DEST/key" ]; then
  rm -f "$DEST/key"
  python3 -c 'import secrets,sys; sys.stdout.write(secrets.token_hex(32))' > "$DEST/key"
  # old receipts and url memory are signed with the old key; they would only be rejected, so drop them
  rm -f "$DEST/state/receipts.jsonl" "$DEST/state/url-memory.json"
  echo "install_guard: generated new HMAC key"
fi
chmod 0400 "$DEST/key"

rm -f "$DEST/medium_publish_guard.py" "$DEST/config.json" "$DEST/manifest.sha256"
cp "$SRC_DIR/medium_publish_guard.py" "$DEST/medium_publish_guard.py"
python3 - "$DEST/config.json" "$REPO" "$WORKSPACE" <<'PY'
import json, sys
json.dump({"repo": sys.argv[2], "workspace": sys.argv[3]}, open(sys.argv[1], "w"), indent=2, sort_keys=True)
PY

GUARD_SHA="$(sha256 "$DEST/medium_publish_guard.py")"
CONFIG_SHA="$(sha256 "$DEST/config.json")"
printf '%s  medium_publish_guard.py\n%s  config.json\n' "$GUARD_SHA" "$CONFIG_SHA" > "$DEST/manifest.sha256"

chmod 0444 "$DEST/medium_publish_guard.py" "$DEST/config.json" "$DEST/manifest.sha256"
chmod 0555 "$DEST"

echo "install_guard: installed $DEST/medium_publish_guard.py"
echo "sha256 medium_publish_guard.py $GUARD_SHA"
echo "sha256 config.json $CONFIG_SHA"
echo "hook command: python3 $DEST/medium_publish_guard.py"
echo "next: scripts/hermes/guard_selftest.sh"
