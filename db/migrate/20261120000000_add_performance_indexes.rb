# frozen_string_literal: true

class AddPerformanceIndexes < ActiveRecord::Migration[8.0]
  def change
    add_index :solo_scores, [:player_id, :daily_on], where: "daily_on IS NOT NULL"
    add_index :solo_scores, [:daily_on, :elapsed_ms, :completed_at]
    add_index :solo_scores, [:completed_at, :elapsed_ms], where: "daily_on IS NULL"
    add_index :solo_scores, [:player_id, :elapsed_ms], where: "daily_on IS NULL"

    add_index :solo_games, [:status, :started_at]
    add_index :solo_games, [:player_id, :status, :started_at]

    add_index :puzzle_runs, [:puzzle_on, :elapsed_ms, :completed_at], where: "completed_at IS NOT NULL"
    add_index :puzzle_runs, [:player_id, :completed_at]
  end
end
