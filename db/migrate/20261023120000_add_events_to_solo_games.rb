class AddEventsToSoloGames < ActiveRecord::Migration[8.0]
  def change
    add_column :solo_games, :events, :json, default: [], null: false
  end
end
