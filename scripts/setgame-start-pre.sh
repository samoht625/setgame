#!/usr/bin/env bash
# systemd ExecStartPre: env + schema before Puma starts.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT/scripts/ensure-prod-env.sh"
exec "$ROOT/scripts/setgame-with-bundle.sh" rails db:prepare
