# frozen_string_literal: true

class SoloGame < ApplicationRecord
  self.primary_key = "id"

  RULES_VERSION = 1
  MAX_OPEN_PER_PLAYER = 5
  EXPIRES_AFTER = 7.days
  # 81 cards make at most 27 disjoint sets.
  MAX_SETS = 27

  has_one :solo_score, dependent: :destroy

  validates :player_id, presence: true
  validates :seed, presence: true
  validates :status, inclusion: { in: %w[open completed expired] }

  scope :open_games, -> { where(status: "open") }

  def self.expire_stale!
    open_games.where("started_at < ?", EXPIRES_AFTER.ago).update_all(
      status: "expired",
      updated_at: Time.current
    )
  end

  # Starting a new game abandons the player's oldest open games so the open
  # count stays under MAX_OPEN_PER_PLAYER. Abandoned games (restarts, idle
  # resets, rejected submits) must never lock a player out of the leaderboard.
  # Ranked daily games are left alone: each is the player's only ranked
  # attempt that day and has its own one-per-day limit.
  def self.abandon_excess_open!(player_id:, keep:)
    excess_ids = open_games
      .where(player_id: player_id, daily_on: nil)
      .order(started_at: :desc)
      .offset(keep)
      .pluck(:id)
    return if excess_ids.empty?

    where(id: excess_ids).update_all(status: "expired", updated_at: Time.current)
  end

  def open?
    status == "open"
  end

  def expired?
    status == "expired" || (open? && started_at < EXPIRES_AFTER.ago)
  end

  # Client-reported progress of an unfinished game, kept for funnel analysis.
  # It only ever grows, and finished games keep their verified count.
  def self.record_progress!(id:, player_id:, sets_found:)
    sets = sets_found.to_i.clamp(0, MAX_SETS)
    now = Time.current
    where(id: id, player_id: player_id)
      .where.not(status: "completed")
      .where("sets_found < ?", sets)
      .update_all(sets_found: sets, progress_at: now, updated_at: now)
  end

  def mark_completed!(sets_found:)
    now = Time.current
    update!(status: "completed", completed_at: now, sets_found: sets_found, progress_at: now)
  end
end
