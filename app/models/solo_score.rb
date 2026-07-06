# frozen_string_literal: true

class SoloScore < ApplicationRecord
  belongs_to :solo_game

  validates :player_id, presence: true
  validates :elapsed_ms, presence: true, numericality: { only_integer: true, greater_than: 0 }
  validates :completed_at, presence: true
  validates :solo_game_id, uniqueness: true

  PERIODS = %w[daily weekly monthly].freeze

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

  def self.leaderboard(period:, limit: 20)
    where(completed_at: period_range(period))
      .order(:elapsed_ms, :completed_at)
      .limit(limit)
  end

  def self.personal_best(player_id:, period:)
    where(player_id: player_id, completed_at: period_range(period))
      .order(:elapsed_ms, :completed_at)
      .first
  end

  def self.personal_bests(player_id:)
    {
      daily: personal_best(player_id: player_id, period: "daily"),
      weekly: personal_best(player_id: player_id, period: "weekly"),
      monthly: personal_best(player_id: player_id, period: "monthly"),
      all_time: where(player_id: player_id).order(:elapsed_ms, :created_at).first
    }
  end
end
