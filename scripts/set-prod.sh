#!/usr/bin/env bash
# Rebuild assets and restart production after code changes.
# Prefers the shared ~/www/scripts/www-restart.sh orchestrator (pull main,
# install deps, build, restart, health-check); falls back to a local
# rebuild + restart when it isn't available.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ORCHESTRATOR="$(cd "$ROOT/.." && pwd)/scripts/www-restart.sh"

if [[ -x "$ORCHESTRATOR" ]]; then
  exec "$ORCHESTRATOR" setgame
fi

cd "$ROOT"

yarn install --frozen-lockfile
yarn build
yarn build:css
RAILS_ENV=production bundle exec rake assets:precompile

systemctl --user restart setgame.service
echo "Set Game restarted: https://set.tido.site"
