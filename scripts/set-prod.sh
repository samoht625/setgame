#!/usr/bin/env bash
# Rebuild assets, migrate SQLite, refresh systemd unit, restart production.
# Intended entrypoint for auto-deploy / post-pull on the Linux host.
#
# Self-contained: env, gems, assets, db:prepare, unit refresh, restart.
# Opt into the shared www-restart handoff with SETGAME_USE_ORCHESTRATOR=1
# (after SQLite/env/unit prep) if you want the shared host script to finish.
#
# Env:
#   SETGAME_SKIP_RESTART=1       — prepare only (used by install-setgame-service)
#   SETGAME_USE_ORCHESTRATOR=1    — hand off to ~/www/scripts/www-restart.sh after prepare
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ORCHESTRATOR="$(cd "$ROOT/.." && pwd)/scripts/www-restart.sh"

if [[ -d "${HOME}/.rbenv/bin" ]]; then
  export PATH="${HOME}/.rbenv/bin:${HOME}/.rbenv/shims:${PATH}"
fi
if command -v rbenv >/dev/null 2>&1; then
  eval "$(rbenv init - bash)" 2>/dev/null || true
fi

prepare_sqlite_runtime() {
  echo "==> Ensuring production env + SQLite data dir"
  # shellcheck disable=SC1091
  source "$ROOT/scripts/ensure-prod-env.sh"

  echo "==> Refresh systemd user unit"
  UNIT_SRC="$ROOT/deploy/setgame.service"
  UNIT_DEST="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user/setgame.service"
  mkdir -p "$(dirname "$UNIT_DEST")"
  cp "$UNIT_SRC" "$UNIT_DEST"
  systemctl --user daemon-reload 2>/dev/null || true
}

install_ruby_deps() {
  echo "==> Bundler (production, vendor/bundle)"
  bundle config set --local path 'vendor/bundle'
  bundle config set --local without 'development:test'
  bundle config set --local deployment 'true'
  bundle install --quiet
}

build_assets() {
  echo "==> JS / CSS"
  if command -v yarn >/dev/null 2>&1; then
    yarn install --frozen-lockfile
    yarn build
    yarn build:css
  elif command -v npm >/dev/null 2>&1; then
    npm ci
    npm run build
    npm run build:css
  else
    echo "set-prod: need yarn or npm" >&2
    exit 1
  fi

  echo "==> Rails assets"
  RAILS_ENV=production "$ROOT/scripts/setgame-with-bundle.sh" rake assets:precompile
}

prepare_database() {
  echo "==> SQLite schema (db:prepare)"
  RAILS_ENV=production "$ROOT/scripts/setgame-with-bundle.sh" rails db:prepare
}

restart_service() {
  echo "==> Restart setgame"
  systemctl --user restart setgame.service

  sleep 1
  if systemctl --user is-active --quiet setgame.service; then
    echo "Set Game restarted OK: https://set.tido.site"
    echo "  DB: ${DATABASE_PATH:-unknown}"
  else
    echo "set-prod: service failed to start — check: journalctl --user -u setgame -n 50" >&2
    systemctl --user status setgame.service --no-pager || true
    exit 1
  fi
}

chmod +x "$ROOT/scripts/"*.sh 2>/dev/null || true
prepare_sqlite_runtime

# Always install gems before any restart so sqlite3 is present for ExecStartPre.
install_ruby_deps
prepare_database

if [[ -x "$ORCHESTRATOR" && "${SETGAME_USE_ORCHESTRATOR:-}" == "1" && "${SETGAME_SKIP_RESTART:-}" != "1" ]]; then
  # Env, unit, gems, and schema are already prepared above.
  echo "==> Handing off to $ORCHESTRATOR setgame"
  exec "$ORCHESTRATOR" setgame
fi

build_assets

if [[ "${SETGAME_SKIP_RESTART:-}" == "1" ]]; then
  echo "Prepared (restart skipped)."
  exit 0
fi

restart_service
