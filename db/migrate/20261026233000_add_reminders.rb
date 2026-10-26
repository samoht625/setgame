# frozen_string_literal: true

# Opt-in reminder emails: at a chosen local time, a nudge when the day's
# Daily Deal or Puzzle is still unplayed. One row per account per day records
# each decision, so a restart or overlapping run can never send twice.
class AddReminders < ActiveRecord::Migration[8.0]
  def change
    add_column :accounts, :reminder_enabled, :boolean, default: false, null: false
    # Minutes after local midnight (480 = 8:00 AM).
    add_column :accounts, :reminder_minutes, :integer, default: 480, null: false
    add_index :accounts, :reminder_enabled

    # A sign-in link asked for from the result card also turns the reminder on
    # once it's opened (proving the address).
    add_column :sign_in_tokens, :reminder_minutes, :integer

    create_table :reminder_deliveries do |t|
      t.references :account, null: false, foreign_key: true
      # The account's local calendar day, and the Pacific deal day it was about.
      t.date :local_on, null: false
      t.date :deal_on, null: false
      # sending, sent, skipped, failed
      t.string :status, null: false
      t.string :kinds
      t.string :resend_id
      t.string :error
      t.integer :attempts, default: 0, null: false
      t.timestamps
    end
    add_index :reminder_deliveries, [:account_id, :local_on], unique: true
    add_index :reminder_deliveries, [:account_id, :deal_on], unique: true
  end
end
