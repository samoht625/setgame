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

ActiveRecord::Schema[8.0].define(version: 2026_10_27_050000) do
  create_table "account_sessions", force: :cascade do |t|
    t.integer "account_id", null: false
    t.string "token_digest", null: false
    t.string "user_agent"
    t.datetime "last_seen_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["account_id"], name: "index_account_sessions_on_account_id"
    t.index ["token_digest"], name: "index_account_sessions_on_token_digest", unique: true
  end

  create_table "accounts", force: :cascade do |t|
    t.string "email", null: false
    t.string "player_id", null: false
    t.string "time_zone"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.boolean "reminder_enabled", default: false, null: false
    t.integer "reminder_minutes", default: 480, null: false
    t.datetime "reminder_on_since"
    t.index ["email"], name: "index_accounts_on_email", unique: true
    t.index ["player_id"], name: "index_accounts_on_player_id", unique: true
    t.index ["reminder_enabled"], name: "index_accounts_on_reminder_enabled"
  end

  create_table "game_snapshots", force: :cascade do |t|
    t.string "name", default: "default", null: false
    t.integer "version", default: 1, null: false
    t.text "payload", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["name"], name: "index_game_snapshots_on_name", unique: true
  end

  create_table "player_merges", force: :cascade do |t|
    t.integer "account_id", null: false
    t.string "from_player_id", null: false
    t.string "to_player_id", null: false
    t.json "dropped", default: {}, null: false
    t.datetime "created_at", null: false
    t.index ["account_id"], name: "index_player_merges_on_account_id"
    t.index ["from_player_id"], name: "index_player_merges_on_from_player_id"
  end

  create_table "puzzle_runs", id: :string, force: :cascade do |t|
    t.string "player_id", null: false
    t.date "puzzle_on", null: false
    t.json "cards", default: [], null: false
    t.datetime "started_at", null: false
    t.datetime "completed_at"
    t.integer "elapsed_ms"
    t.integer "misses", default: 0, null: false
    t.json "claims", default: [], null: false
    t.string "display_name"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.string "attempts"
    t.index ["player_id"], name: "index_puzzle_runs_on_player_id"
    t.index ["puzzle_on", "elapsed_ms"], name: "index_puzzle_runs_on_puzzle_on_and_elapsed_ms"
    t.index ["puzzle_on", "player_id"], name: "index_puzzle_runs_on_puzzle_on_and_player_id", unique: true
  end

  create_table "reminder_deliveries", force: :cascade do |t|
    t.integer "account_id", null: false
    t.date "local_on", null: false
    t.date "deal_on", null: false
    t.string "status", null: false
    t.string "kinds"
    t.string "resend_id"
    t.string "error"
    t.integer "attempts", default: 0, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["account_id", "deal_on"], name: "index_reminder_deliveries_on_account_id_and_deal_on", unique: true
    t.index ["account_id", "local_on"], name: "index_reminder_deliveries_on_account_id_and_local_on", unique: true
    t.index ["account_id"], name: "index_reminder_deliveries_on_account_id"
  end

  create_table "sign_in_tokens", force: :cascade do |t|
    t.string "email", null: false
    t.string "token_digest", null: false
    t.string "ip"
    t.string "return_to"
    t.string "time_zone"
    t.datetime "expires_at", null: false
    t.datetime "used_at"
    t.datetime "created_at", null: false
    t.integer "reminder_minutes"
    t.index ["email", "created_at"], name: "index_sign_in_tokens_on_email_and_created_at"
    t.index ["ip", "created_at"], name: "index_sign_in_tokens_on_ip_and_created_at"
    t.index ["token_digest"], name: "index_sign_in_tokens_on_token_digest", unique: true
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
    t.integer "sets_found", default: 0, null: false
    t.datetime "progress_at"
    t.date "daily_on"
    t.json "events", default: [], null: false
    t.index ["daily_on", "player_id"], name: "index_solo_games_on_daily_on_and_player_id", unique: true, where: "daily_on IS NOT NULL"
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
    t.date "daily_on"
    t.integer "misses"
    t.index ["completed_at"], name: "index_solo_scores_on_completed_at"
    t.index ["daily_on", "elapsed_ms"], name: "index_solo_scores_on_daily_on_and_elapsed_ms"
    t.index ["elapsed_ms"], name: "index_solo_scores_on_elapsed_ms"
    t.index ["player_id", "completed_at"], name: "index_solo_scores_on_player_id_and_completed_at"
    t.index ["solo_game_id"], name: "index_solo_scores_on_solo_game_id", unique: true
  end

  add_foreign_key "account_sessions", "accounts"
  add_foreign_key "player_merges", "accounts"
  add_foreign_key "reminder_deliveries", "accounts"
end
