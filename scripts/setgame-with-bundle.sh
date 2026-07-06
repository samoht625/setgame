#!/usr/bin/env bash
# Run a command via Bundler in the app root with rbenv on PATH.
# Used by systemd (no login shell) and deploy scripts.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ -d "${HOME}/.rbenv/bin" ]]; then
  export PATH="${HOME}/.rbenv/bin:${HOME}/.rbenv/shims:${PATH}"
fi
if command -v rbenv >/dev/null 2>&1; then
  eval "$(rbenv init - bash)" 2>/dev/null || true
fi

BUNDLE_BIN=""
if [[ -x "$ROOT/bin/bundle" ]]; then
  BUNDLE_BIN="$ROOT/bin/bundle"
else
  BUNDLE_BIN="$(ls -1 "$ROOT"/vendor/bundle/ruby/*/bin/bundle 2>/dev/null | sort -V | tail -1 || true)"
fi
if [[ -z "$BUNDLE_BIN" ]] && command -v bundle >/dev/null 2>&1; then
  BUNDLE_BIN="$(command -v bundle)"
fi
if [[ -z "$BUNDLE_BIN" ]]; then
  echo "setgame-with-bundle: could not find bundle (run scripts/set-prod.sh)" >&2
  exit 1
fi

exec "$BUNDLE_BIN" exec "$@"
