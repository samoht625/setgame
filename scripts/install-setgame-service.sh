#!/usr/bin/env bash
# Install user systemd unit so production survives reboot (no root except linger).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UNIT_SRC="$ROOT/deploy/setgame.service"
UNIT_DEST="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user/setgame.service"

chmod +x "$ROOT/scripts/"*.sh

if [[ -d "${HOME}/.rbenv/bin" ]]; then
  export PATH="${HOME}/.rbenv/bin:${HOME}/.rbenv/shims:${PATH}"
fi
if command -v rbenv >/dev/null 2>&1; then
  eval "$(rbenv init - bash)" 2>/dev/null || true
fi

# Prepare gems, assets, DB, and copy unit — without restarting yet.
SETGAME_SKIP_RESTART=1 "$ROOT/scripts/set-prod.sh"

if [[ ! -f "$ROOT/deploy/setgame.env" ]] || ! grep -qE '^RAILS_MASTER_KEY=' "$ROOT/deploy/setgame.env"; then
  echo "WARNING: set RAILS_MASTER_KEY in $ROOT/deploy/setgame.env before relying on this service." >&2
fi

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
echo "  Redeploy after git pull: ./scripts/set-prod.sh"
