# frozen_string_literal: true

class CreatePersistenceTables < ActiveRecord::Migration[8.0]
  def change
    create_table :game_snapshots do |t|
      t.string :name, null: false, default: "default"
      t.integer :version, null: false, default: 1
      t.text :payload, null: false
      t.timestamps
    end
    add_index :game_snapshots, :name, unique: true

    create_table :solo_games, id: :string do |t|
      t.string :player_id, null: false
      t.string :seed, null: false
      t.integer :rules_version, null: false, default: 1
      t.string :status, null: false, default: "open"
      t.datetime :started_at, null: false
      t.datetime :completed_at
      t.timestamps
    end
    add_index :solo_games, :player_id
    add_index :solo_games, :status
    add_index :solo_games, :started_at

    create_table :solo_scores do |t|
      t.string :solo_game_id, null: false
      t.string :player_id, null: false
      t.string :display_name
      t.integer :elapsed_ms, null: false
      t.datetime :completed_at, null: false
      t.json :events, null: false, default: []
      t.timestamps
    end
    add_index :solo_scores, :solo_game_id, unique: true
    add_index :solo_scores, :completed_at
    add_index :solo_scores, :elapsed_ms
    add_index :solo_scores, [:player_id, :completed_at]
  end
end
