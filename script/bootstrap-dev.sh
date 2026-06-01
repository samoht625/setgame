#!/usr/bin/env bash
# Bootstrap local development on a fresh machine (especially Linux / Cursor cloud VMs).
# Idempotent — safe to re-run. Used by .cursor/environment.json "install" on default images.
set -euo pipefail

cd "$(dirname "$0")/.."

echo "== Set Game dev bootstrap =="

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    return 1
  fi
}

install_linux_packages() {
  if ! command -v apt-get >/dev/null 2>&1; then
    return 0
  fi
  if ! command -v ruby >/dev/null 2>&1; then
    echo "== Installing Ruby and build tools (apt) =="
    sudo DEBIAN_FRONTEND=noninteractive apt-get update -qq
    sudo DEBIAN_FRONTEND=noninteractive apt-get install -y \
      ruby3.2 ruby3.2-dev ruby-bundler build-essential \
      libyaml-dev zlib1g-dev libssl-dev libffi-dev
  fi
}

install_linux_packages

need_cmd ruby || { echo "Install Ruby 3.2+ (see README)" >&2; exit 1; }
need_cmd bundle || { echo "Install Bundler (gem install bundler or ruby-bundler)" >&2; exit 1; }
need_cmd node || { echo "Install Node.js 18+ (https://nodejs.org)" >&2; exit 1; }
need_cmd yarn || { echo "Install Yarn (npm install -g yarn)" >&2; exit 1; }

echo "Ruby:  $(ruby -v)"
echo "Node:  $(node -v)"
echo "Yarn:  $(yarn -v)"

# Deployment-oriented bundle settings break local dev (skips :development gems).
if [[ -f .bundle/config ]] && grep -q 'BUNDLE_WITHOUT' .bundle/config 2>/dev/null; then
  echo "== Resetting Bundler config for local development =="
  bundle config unset deployment 2>/dev/null || true
  bundle config unset without 2>/dev/null || true
fi

echo "== bundle install =="
bundle install

echo "== yarn install =="
yarn install --check-files

echo "== Building assets =="
yarn build
yarn build:css

echo ""
echo "Done. Start the app with:"
echo "  bin/dev          # Rails + JS/CSS watchers (recommended)"
echo "  bin/rails server # Rails only (run yarn build / yarn build:css after UI changes)"
echo ""
echo "Open http://localhost:3000 (solo) or http://localhost:3000/m (multiplayer)"
