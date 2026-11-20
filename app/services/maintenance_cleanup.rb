# frozen_string_literal: true

# Periodic pruning of expired tokens, abandoned 0-set practice games, stale
# sessions, and old generated OG share images (invoked by `bin/rails cleanup`).
module MaintenanceCleanup
  SIGN_IN_TOKEN_RETENTION = 7.days
  EXPIRED_SOLO_GAME_RETENTION = 30.days
  OG_IMAGE_RETENTION = 30.days

  module_function

  def run!(now: Time.current, og_dir: OgImage::CACHE_DIR)
    SoloGame.expire_stale!(force: true)
    {
      sign_in_tokens: prune_sign_in_tokens(now: now),
      solo_games: prune_solo_games(now: now),
      account_sessions: prune_account_sessions(now: now),
      og_images: prune_og_images(now: now, og_dir: og_dir)
    }
  end

  def prune_sign_in_tokens(now: Time.current)
    SignInToken.where("expires_at < ?", now - SIGN_IN_TOKEN_RETENTION).delete_all
  end

  # Keeps daily games (daily_on IS NOT NULL) so DailyPuzzle.launch_date and
  # stored daily seeds never shift, and keeps games with sets_found > 0 for /stats.
  def prune_solo_games(now: Time.current)
    SoloGame
      .where(daily_on: nil, status: "expired", sets_found: 0)
      .where("started_at < ?", now - EXPIRED_SOLO_GAME_RETENTION)
      .where.not(id: SoloScore.select(:solo_game_id))
      .delete_all
  end

  def prune_account_sessions(now: Time.current)
    AccountSession.where("COALESCE(last_seen_at, created_at) < ?", now - AccountSession::LIFETIME).delete_all
  end

  def prune_og_images(now: Time.current, og_dir: OgImage::CACHE_DIR)
    return 0 unless Dir.exist?(og_dir)

    cutoff = now - OG_IMAGE_RETENTION
    deleted = 0
    Dir.glob(File.join(og_dir.to_s, "*.png")).each do |path|
      next unless File.file?(path) && File.mtime(path) < cutoff

      File.delete(path)
      deleted += 1
    rescue Errno::ENOENT
      next
    end
    deleted
  end
end
