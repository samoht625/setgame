# frozen_string_literal: true

class SoloScore < ApplicationRecord
  belongs_to :solo_game

  validates :player_id, presence: true
  validates :elapsed_ms, presence: true, numericality: { only_integer: true, greater_than: 0 }
  validates :completed_at, presence: true
  validates :solo_game_id, uniqueness: true

  PERIODS = %w[daily weekly monthly].freeze
  SUMMARY_COLUMNS = %i[id player_id display_name elapsed_ms completed_at].freeze
  HAS_REPLAY_SQL = Arel.sql(
    "CASE WHEN json_valid(events) AND json_type(events) = 'array' AND json_array_length(events) > 0 " \
    "AND json_extract(events, '$[0].type') = 'claim' AND json_type(events, '$[0].t_ms') = 'integer' " \
    "THEN 1 ELSE 0 END AS has_replay"
  )

  # Today, this week (from Monday) and this month, by the dailies' clock: a
  # practice day starts and ends when the Puzzle's and the Daily Deal's does.
  def self.period_range(period, now = Time.current)
    now = now.in_time_zone(DailyPuzzle::TIME_ZONE)
    case period.to_s
    when "daily"
      now.beginning_of_day..now.end_of_day
    when "weekly"
      now.beginning_of_week(:monday)..now.end_of_week(:monday)
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
    select(*SUMMARY_COLUMNS, :misses, HAS_REPLAY_SQL)
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

  def replay?
    if has_attribute?(:has_replay)
      ActiveModel::Type::Boolean.new.cast(read_attribute(:has_replay))
    else
      claims.present?
    end
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
