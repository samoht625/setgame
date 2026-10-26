# frozen_string_literal: true

# Optional email sign-in. An account owns one canonical player id; every
# score, game and puzzle run stays keyed by player_id, so leaderboards, streaks
# and stats keep working unchanged. Signing in on a new browser merges that
# browser's anonymous player into the account's (see PlayerMerger).
class CreateAccounts < ActiveRecord::Migration[8.0]
  def change
    create_table :accounts do |t|
      t.string :email, null: false
      t.string :player_id, null: false
      # The browser's IANA zone at sign-up; the reminder email (next phase) is
      # sent at a chosen local time, only on days the player hasn't finished.
      t.string :time_zone
      t.timestamps
    end
    add_index :accounts, :email, unique: true
    add_index :accounts, :player_id, unique: true

    # One-tap sign-in links: only a SHA-256 digest of the token is stored.
    create_table :sign_in_tokens do |t|
      t.string :email, null: false
      t.string :token_digest, null: false
      t.string :ip
      t.string :return_to
      t.string :time_zone
      t.datetime :expires_at, null: false
      t.datetime :used_at
      t.datetime :created_at, null: false
    end
    add_index :sign_in_tokens, :token_digest, unique: true
    add_index :sign_in_tokens, [:email, :created_at]
    add_index :sign_in_tokens, [:ip, :created_at]

    # A signed-in browser. The cookie holds a random token; the row its digest.
    create_table :account_sessions do |t|
      t.references :account, null: false, foreign_key: true
      t.string :token_digest, null: false
      t.string :user_agent
      t.datetime :last_seen_at
      t.timestamps
    end
    add_index :account_sessions, :token_digest, unique: true

    # Audit trail of anonymous players folded into an account, with the
    # same-day duplicates that were dropped.
    create_table :player_merges do |t|
      t.references :account, null: false, foreign_key: true
      t.string :from_player_id, null: false
      t.string :to_player_id, null: false
      t.json :dropped, default: {}, null: false
      t.datetime :created_at, null: false
    end
    add_index :player_merges, :from_player_id
  end
end
