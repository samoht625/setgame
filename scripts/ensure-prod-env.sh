#!/usr/bin/env bash
# Ensure deploy/setgame.env has required keys for SQLite persistence.
# Safe to re-run: never overwrites existing keys.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_EXAMPLE="$ROOT/deploy/setgame.env.example"
ENV_FILE="$ROOT/deploy/setgame.env"

if [[ ! -f "$ENV_FILE" ]]; then
  cp "$ENV_EXAMPLE" "$ENV_FILE"
  echo "Created $ENV_FILE from example."
fi

append_if_missing() {
  local key="$1"
  local value="$2"
  if grep -qE "^${key}=" "$ENV_FILE"; then
    return 0
  fi
  printf '\n%s=%s\n' "$key" "$value" >>"$ENV_FILE"
  echo "Added ${key} to deploy/setgame.env"
}

DEFAULT_DB="$HOME/www/setgame-data/production.sqlite3"
append_if_missing "DATABASE_PATH" "$DEFAULT_DB"
append_if_missing "WEB_CONCURRENCY" "1"
append_if_missing "RAILS_MAX_THREADS" "3"

# Export KEY=value lines for the rest of the deploy script.
set -a
while IFS= read -r line || [[ -n "$line" ]]; do
  case "$line" in
    ''|\#*) continue ;;
  esac
  if [[ "$line" =~ ^[A-Za-z_][A-Za-z0-9_]*= ]]; then
    # shellcheck disable=SC2163
    export "$line"
  fi
done <"$ENV_FILE"
set +a

if [[ -z "${DATABASE_PATH:-}" ]]; then
  echo "ensure-prod-env: DATABASE_PATH is empty" >&2
  if [[ "${BASH_SOURCE[0]}" != "${0}" ]]; then
    return 1
  fi
  exit 1
fi

mkdir -p "$(dirname "$DATABASE_PATH")"

# One-time move from in-checkout DB to durable path.
LEGACY_DB="$ROOT/storage/production.sqlite3"
if [[ -f "$LEGACY_DB" && ! -f "$DATABASE_PATH" ]]; then
  echo "Migrating $LEGACY_DB → $DATABASE_PATH"
  cp "$LEGACY_DB" "$DATABASE_PATH"
  [[ -f "${LEGACY_DB}-wal" ]] && cp "${LEGACY_DB}-wal" "${DATABASE_PATH}-wal" || true
  [[ -f "${LEGACY_DB}-shm" ]] && cp "${LEGACY_DB}-shm" "${DATABASE_PATH}-shm" || true
fi

echo "DATABASE_PATH=$DATABASE_PATH"
