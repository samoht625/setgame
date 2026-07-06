#!/usr/bin/env bash
# Production Puma entrypoint for systemd.
# Loads/creates deploy/setgame.env (incl. DATABASE_PATH) then starts Puma.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT/scripts/ensure-prod-env.sh"
exec "$ROOT/scripts/setgame-with-bundle.sh" puma -C config/puma.rb -b tcp://127.0.0.1:7778
