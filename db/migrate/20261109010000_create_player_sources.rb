# frozen_string_literal: true

# Where each new player first came from (a ?ref= tag, a shared result, a
# referring site or nothing), recorded once with their first game, so
# retention can be read per source (script/retention).
class CreatePlayerSources < ActiveRecord::Migration[8.0]
  def change
    create_table :player_sources do |t|
      t.string :player_id, null: false
      t.string :source, null: false
      t.string :landing
      t.datetime :created_at, null: false
      t.index :player_id, unique: true
      t.index :source
    end
  end
end
