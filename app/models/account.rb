# frozen_string_literal: true

# An email that can sign browsers in. It owns one canonical player id, which
# every signed-in browser plays as.
class Account < ApplicationRecord
  EMAIL_PATTERN = /\A[^@\s]+@[^@\s]+\.[^@\s]+\z/
  MAX_EMAIL_LENGTH = 254

  has_many :account_sessions, dependent: :destroy
  has_many :player_merges, dependent: :delete_all
  has_many :reminder_deliveries, dependent: :delete_all

  validates :reminder_minutes, inclusion: { in: Reminder::TIMES }

  validates :email, presence: true, uniqueness: true
  validates :player_id, presence: true, uniqueness: true

  # Lowercased and trimmed, or nil when it doesn't look like an address.
  def self.normalize_email(raw)
    email = raw.to_s.strip.downcase
    email if email.length <= MAX_EMAIL_LENGTH && email.match?(EMAIL_PATTERN)
  end

  scope :with_reminder, -> { where(reminder_enabled: true) }

  before_save :restart_reminder_clock, if: -> { reminder_enabled? && (will_save_change_to_reminder_enabled? || will_save_change_to_reminder_minutes?) }

  def zone
    ActiveSupport::TimeZone[time_zone.to_s] || ActiveSupport::TimeZone[DailyPuzzle::TIME_ZONE]
  end

  def self.owns_player?(player_id)
    exists?(player_id: player_id)
  end

  private

  def restart_reminder_clock
    self.reminder_on_since = Time.current
  end
end
