#!/usr/bin/env bash
# Rotate Rails master key + secret_key_base after a leak. Run from repo root.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

KEY_PATH="$ROOT/config/master.key"
ENC_PATH="$ROOT/config/credentials.yml.enc"
TS="$(date +%Y%m%d%H%M%S)"

if [[ ! -f "$KEY_PATH" ]]; then
  echo "Missing $KEY_PATH — put the current key there first, or set RAILS_MASTER_KEY." >&2
  exit 1
fi

cp -a "$KEY_PATH" "$KEY_PATH.compromised.$TS"
cp -a "$ENC_PATH" "$ENC_PATH.compromised.$TS"

bundle exec ruby <<'RUBY'
require "active_support/encrypted_configuration"
require "securerandom"
require "pathname"

root = Pathname.new(Dir.pwd)
key_path = root.join("config/master.key")
enc_path = root.join("config/credentials.yml.enc")

config = ActiveSupport::EncryptedConfiguration.new(
  config_path: enc_path,
  key_path: key_path,
  env_key: "RAILS_MASTER_KEY",
  raise_if_missing_key: true
)
puts "Decrypted existing credentials (top-level keys only):"
config.read.each_line { |l| puts l if l.match?(/^[a-z_]+:/) }

new_key = ActiveSupport::EncryptedFile.generate_key
new_secret = SecureRandom.hex(64)
new_yaml = "secret_key_base: #{new_secret}\n"

File.write(key_path, new_key)
config.write(new_yaml)
puts "Wrote new config/master.key and config/credentials.yml.enc"
RUBY

echo ""
echo "Next steps:"
echo "  1. deploy/setgame.env → RAILS_MASTER_KEY=\$(cat config/master.key)"
echo "  2. systemctl --user restart setgame"
echo "  3. Purge git history (SECURITY.md) and force-push"
echo "  4. Resolve the GitGuardian alert on GitHub"
