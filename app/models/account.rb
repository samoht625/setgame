# frozen_string_literal: true

# An email that can sign browsers in. It owns one canonical player id, which
# every signed-in browser plays as.
class Account < ApplicationRecord
  EMAIL_PATTERN = /\A[^@\s]+@[^@\s]+\.[^@\s]+\z/
  MAX_EMAIL_LENGTH = 254

  has_many :account_sessions, dependent: :destroy
  has_many :player_merges, dependent: :delete_all

  validates :email, presence: true, uniqueness: true
  validates :player_id, presence: true, uniqueness: true

  # Lowercased and trimmed, or nil when it doesn't look like an address.
  def self.normalize_email(raw)
    email = raw.to_s.strip.downcase
    email if email.length <= MAX_EMAIL_LENGTH && email.match?(EMAIL_PATTERN)
  end

  def self.owns_player?(player_id)
    exists?(player_id: player_id)
  end
end
