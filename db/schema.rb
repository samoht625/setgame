# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.0].define(version: 2026_07_06_150000) do
  create_table "game_snapshots", force: :cascade do |t|
    t.string "name", default: "default", null: false
    t.integer "version", default: 1, null: false
    t.text "payload", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["name"], name: "index_game_snapshots_on_name", unique: true
  end

  create_table "solo_games", id: :string, force: :cascade do |t|
    t.string "player_id", null: false
    t.string "seed", null: false
    t.integer "rules_version", default: 1, null: false
    t.string "status", default: "open", null: false
    t.datetime "started_at", null: false
    t.datetime "completed_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["player_id"], name: "index_solo_games_on_player_id"
    t.index ["started_at"], name: "index_solo_games_on_started_at"
    t.index ["status"], name: "index_solo_games_on_status"
  end

  create_table "solo_scores", force: :cascade do |t|
    t.string "solo_game_id", null: false
    t.string "player_id", null: false
    t.string "display_name"
    t.integer "elapsed_ms", null: false
    t.datetime "completed_at", null: false
    t.json "events", default: [], null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["completed_at"], name: "index_solo_scores_on_completed_at"
    t.index ["elapsed_ms"], name: "index_solo_scores_on_elapsed_ms"
    t.index ["player_id", "completed_at"], name: "index_solo_scores_on_player_id_and_completed_at"
    t.index ["solo_game_id"], name: "index_solo_scores_on_solo_game_id", unique: true
  end
end
