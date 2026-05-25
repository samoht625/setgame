#!/usr/bin/env bash
# Install user systemd unit so production survives reboot (no root except linger).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_EXAMPLE="$ROOT/deploy/setgame.env.example"
ENV_FILE="$ROOT/deploy/setgame.env"
UNIT_SRC="$ROOT/deploy/setgame.service"
UNIT_DEST="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user/setgame.service"

if [[ ! -f "$ENV_FILE" ]]; then
  cp "$ENV_EXAMPLE" "$ENV_FILE"
  echo "Created $ENV_FILE from example."
fi

if [[ ! -f "$ROOT/public/assets/.manifest.json" ]] && [[ ! -f "$ROOT/public/assets/manifest.json" ]]; then
  echo "Building assets…"
  (cd "$ROOT" && yarn install --frozen-lockfile && yarn build && yarn build:css)
  (cd "$ROOT" && RAILS_ENV=production bundle exec rake assets:precompile)
fi

mkdir -p "$(dirname "$UNIT_DEST")"
cp "$UNIT_SRC" "$UNIT_DEST"

pkill -f "puma.*7778" 2>/dev/null || true
if command -v fuser >/dev/null 2>&1; then
  fuser -ks 7778/tcp 2>/dev/null || true
fi

systemctl --user daemon-reload
systemctl --user enable --now setgame.service

if ! loginctl show-user "$(id -un)" -p Linger 2>/dev/null | grep -q 'Linger=yes'; then
  echo "Enabling linger so the service starts at boot without a login session…"
  sudo loginctl enable-linger "$(id -un)"
fi

echo ""
echo "Set Game production service is enabled."
echo "  Status:  systemctl --user status setgame"
echo "  Logs:    journalctl --user -u setgame -f"
echo "  Site:    https://set.tido.site"
