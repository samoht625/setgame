#!/usr/bin/env bash
# Rebuild assets and restart production after code changes.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

yarn install --frozen-lockfile
yarn build
yarn build:css
RAILS_ENV=production bundle exec rake assets:precompile

systemctl --user restart setgame.service
echo "Set Game restarted: https://set.tido.site"
