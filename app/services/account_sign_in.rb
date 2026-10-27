# frozen_string_literal: true

# Signs a browser into the account for an email, creating it on first use
# (with the daily reminder on).
#
# The first sign-in makes the browser's current (anonymous) player the
# account's player, so its history is the account's. Signing in later on
# another browser merges that browser's anonymous player into the account's
# (PlayerMerger). A player that already belongs to an account, or a browser
# that is signed in to another account, is never merged: the browser simply
# switches to this account.
module AccountSignIn
  def self.call(email:, browser_player_id:, signed_in_account: nil, time_zone: nil)
    ApplicationRecord.transaction do
      account = Account.find_by(email: email)
      mergeable = PlayerResolver.uuid?(browser_player_id) && signed_in_account.nil? && !Account.owns_player?(browser_player_id)

      if account.nil?
        # New accounts get the daily reminder at the default time; it's one tap to turn off.
        account = Account.create!(email: email, player_id: mergeable ? browser_player_id : SecureRandom.uuid, time_zone: time_zone,
                                  reminder_enabled: true, reminder_minutes: Reminder::DEFAULT_MINUTES)
      else
        PlayerMerger.merge!(from: browser_player_id, account: account) if mergeable && browser_player_id != account.player_id
        account.update!(time_zone: time_zone) if account.time_zone.blank? && time_zone.present?
      end
      account
    end
  rescue ActiveRecord::RecordNotUnique
    retry
  end
end
