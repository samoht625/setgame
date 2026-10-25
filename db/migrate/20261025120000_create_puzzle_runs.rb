# frozen_string_literal: true

# One row per player per day for the classic Puzzle: 12 cards, find all 6 sets.
class CreatePuzzleRuns < ActiveRecord::Migration[8.0]
  def change
    create_table :puzzle_runs, id: :string do |t|
      t.string :player_id, null: false
      t.date :puzzle_on, null: false
      # The day's 12 cards as dealt to this run, so a later run always gets the same board.
      t.json :cards, default: [], null: false
      t.datetime :started_at, null: false
      t.datetime :completed_at
      t.integer :elapsed_ms
      t.integer :misses, default: 0, null: false
      # Sets found so far ({cards, t_ms}), verified against the day's sets.
      t.json :claims, default: [], null: false
      t.string :display_name
      t.timestamps
    end
    add_index :puzzle_runs, [:puzzle_on, :player_id], unique: true
    add_index :puzzle_runs, [:puzzle_on, :elapsed_ms]
    add_index :puzzle_runs, :player_id
  end
end
