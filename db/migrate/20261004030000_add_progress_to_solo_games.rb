# frozen_string_literal: true

class AddProgressToSoloGames < ActiveRecord::Migration[8.0]
  def change
    add_column :solo_games, :sets_found, :integer, null: false, default: 0
    add_column :solo_games, :progress_at, :datetime
  end
end
