# frozen_string_literal: true

class SoloGame < ApplicationRecord
  self.primary_key = "id"

  RULES_VERSION = 1
  MAX_OPEN_PER_PLAYER = 5
  EXPIRES_AFTER = 7.days

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

  def open?
    status == "open"
  end

  def expired?
    status == "expired" || (open? && started_at < EXPIRES_AFTER.ago)
  end

  def mark_completed!
    update!(status: "completed", completed_at: Time.current)
  end
end
