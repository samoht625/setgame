# frozen_string_literal: true

# When the reminder was last turned on or moved to a new time. A reminder
# never goes out for a time of day that had already passed by then, so
# turning it on (signing up, opting back in) doesn't send one straight away.
class AddReminderOnSinceToAccounts < ActiveRecord::Migration[8.0]
  def change
    add_column :accounts, :reminder_on_since, :datetime
  end
end
