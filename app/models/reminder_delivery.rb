# frozen_string_literal: true

# One reminder decision per account per local day (and per deal day): the
# unique indexes are what make sending idempotent.
class ReminderDelivery < ApplicationRecord
  STATUSES = %w[sending sent skipped failed].freeze
  MAX_ATTEMPTS = 3

  belongs_to :account
  validates :status, inclusion: { in: STATUSES }
end
