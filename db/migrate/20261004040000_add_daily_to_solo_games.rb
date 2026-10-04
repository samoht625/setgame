# frozen_string_literal: true

class AddDailyToSoloGames < ActiveRecord::Migration[8.0]
  def change
    # A ranked daily game is a solo game dealt from the day's seed. The unique
    # index is what enforces one ranked attempt per player per day.
    add_column :solo_games, :daily_on, :date
    add_index :solo_games, [:daily_on, :player_id], unique: true, where: "daily_on IS NOT NULL"

    add_column :solo_scores, :daily_on, :date
    add_column :solo_scores, :misses, :integer
    add_index :solo_scores, [:daily_on, :elapsed_ms]
  end
end
