# frozen_string_literal: true

# What a player has chosen for themselves. Two-card mode is null until the
# player switches it, so the default (TwoCardMode) still applies to them.
class CreatePlayerSettings < ActiveRecord::Migration[8.0]
  def change
    create_table :player_settings do |t|
      t.string :player_id, null: false
      t.boolean :two_card_mode
      t.timestamps
      t.index :player_id, unique: true
    end
  end
end
