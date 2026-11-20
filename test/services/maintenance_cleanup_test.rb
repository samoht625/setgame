# frozen_string_literal: true

require "test_helper"
require "tmpdir"

class MaintenanceCleanupTest < ActiveSupport::TestCase
  test "prunes expired sign-in tokens, old 0-set expired solo games, stale sessions, and old OG PNGs" do
    now = Time.current
    account = Account.create!(email: "clean@example.com", player_id: SecureRandom.uuid)

    # Sign-in tokens: >7d expired pruned, <7d expired and active kept.
    old_token, = SignInToken.issue!(email: "a@example.com")
    old_token.update_column(:expires_at, now - 8.days)
    recent_expired, = SignInToken.issue!(email: "b@example.com")
    recent_expired.update_column(:expires_at, now - 2.days)
    fresh_token, = SignInToken.issue!(email: "c@example.com")

    # Solo games: >30d expired 0-set practice pruned (including stale open >30d expired first).
    old_expired_zero = SoloGame.create!(id: SecureRandom.uuid, player_id: "p1", seed: "1", status: "expired", started_at: now - 35.days, sets_found: 0)
    old_open_zero = SoloGame.create!(id: SecureRandom.uuid, player_id: "p1", seed: "2", status: "open", started_at: now - 35.days, sets_found: 0)
    recent_expired_zero = SoloGame.create!(id: SecureRandom.uuid, player_id: "p1", seed: "3", status: "expired", started_at: now - 10.days, sets_found: 0)
    old_expired_with_sets = SoloGame.create!(id: SecureRandom.uuid, player_id: "p1", seed: "4", status: "expired", started_at: now - 40.days, sets_found: 2)
    old_completed = SoloGame.create!(id: SecureRandom.uuid, player_id: "p1", seed: "5", status: "completed", started_at: now - 40.days, sets_found: 20)
    old_daily_zero = SoloGame.create!(id: SecureRandom.uuid, player_id: "p1", seed: "6", status: "expired", started_at: now - 40.days, sets_found: 0, daily_on: Date.new(2026, 10, 1))

    # Account sessions: >1y unused pruned (by last_seen_at or created_at fallback).
    stale_seen, = AccountSession.start!(account)
    stale_seen.update_column(:last_seen_at, now - 1.year - 1.day)
    stale_never_seen, = AccountSession.start!(account)
    stale_never_seen.update_columns(last_seen_at: nil, created_at: now - 1.year - 1.day)
    active_session, = AccountSession.start!(account)
    active_session.update_column(:last_seen_at, now - 10.days)

    Dir.mktmpdir("og-cleanup-") do |og_dir|
      old_png = File.join(og_dir, "daily-v7-old.png")
      new_png = File.join(og_dir, "daily-v7-new.png")
      keep_file = File.join(og_dir, ".keep")
      [old_png, new_png, keep_file].each { |f| File.write(f, "data") }
      old_mtime = (now - 31.days).to_time
      File.utime(old_mtime, old_mtime, old_png)
      File.utime(old_mtime, old_mtime, keep_file)

      counts = MaintenanceCleanup.run!(now: now, og_dir: og_dir)

      assert_equal({ sign_in_tokens: 1, solo_games: 2, account_sessions: 2, og_images: 1 }, counts)

      refute SignInToken.exists?(old_token.id)
      assert SignInToken.exists?(recent_expired.id)
      assert SignInToken.exists?(fresh_token.id)

      refute SoloGame.exists?(old_expired_zero.id)
      refute SoloGame.exists?(old_open_zero.id)
      assert SoloGame.exists?(recent_expired_zero.id)
      assert SoloGame.exists?(old_expired_with_sets.id)
      assert SoloGame.exists?(old_completed.id)
      assert SoloGame.exists?(old_daily_zero.id), "daily games are kept to preserve launch_date and seeds"

      refute AccountSession.exists?(stale_seen.id)
      refute AccountSession.exists?(stale_never_seen.id)
      assert AccountSession.exists?(active_session.id)

      refute File.exist?(old_png)
      assert File.exist?(new_png)
      assert File.exist?(keep_file), "non-PNG files are untouched"
    end
  end
end
