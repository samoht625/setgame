# frozen_string_literal: true

class SoloScore < ApplicationRecord
  belongs_to :solo_game

  validates :player_id, presence: true
  validates :elapsed_ms, presence: true, numericality: { only_integer: true, greater_than: 0 }
  validates :completed_at, presence: true
  validates :solo_game_id, uniqueness: true

  PERIODS = %w[daily weekly monthly].freeze
  SUMMARY_COLUMNS = %i[id player_id display_name elapsed_ms completed_at].freeze

  def self.period_range(period)
    now = Time.zone.now
    case period.to_s
    when "daily"
      now.beginning_of_day..now.end_of_day
    when "weekly"
      now.beginning_of_week(:monday)..now.end_of_week(:sunday)
    when "monthly"
      now.beginning_of_month..now.end_of_month
    else
      raise ArgumentError, "unknown period: #{period}"
    end
  end

  # Daily-deal times have their own board: everyone played the same deal.
  scope :regular, -> { where(daily_on: nil) }

  def self.leaderboard(period:, limit: 20)
    regular
      .select(*SUMMARY_COLUMNS)
      .where(completed_at: period_range(period))
      .order(:elapsed_ms, :completed_at)
      .limit(limit)
  end

  def self.daily_leaderboard(date:, limit:)
    select(*SUMMARY_COLUMNS, :misses, :events)
      .where(daily_on: date)
      .order(:elapsed_ms, :completed_at)
      .limit(limit)
  end

  def self.personal_best(player_id:, period:)
    regular
      .select(*SUMMARY_COLUMNS)
      .where(player_id: player_id, completed_at: period_range(period))
      .order(:elapsed_ms, :completed_at)
      .first
  end

  def self.personal_bests(player_id:)
    {
      daily: personal_best(player_id: player_id, period: "daily"),
      weekly: personal_best(player_id: player_id, period: "weekly"),
      monthly: personal_best(player_id: player_id, period: "monthly"),
      all_time: regular.select(*SUMMARY_COLUMNS).where(player_id: player_id).order(:elapsed_ms, :created_at).first
    }
  end

  # The run's claims as the server verified them: each set's cards and when it
  # was found on the run's clock. Nil when the row has no usable timeline.
  def claims
    list = Array(events).map do |event|
      cards = event["cards"]
      t_ms = event["t_ms"]
      return nil unless event["type"] == "claim" && cards.is_a?(Array) && cards.length == 3 && t_ms.is_a?(Integer)

      { cards: cards, t_ms: t_ms }
    end
    list.presence
  end
end
