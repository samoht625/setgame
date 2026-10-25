# frozen_string_literal: true

class AddAttemptsToPuzzleRuns < ActiveRecord::Migration[8.0]
  def change
    add_column :puzzle_runs, :attempts, :string
  end
end
