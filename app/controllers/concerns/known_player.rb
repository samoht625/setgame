# frozen_string_literal: true

# Pages that render the app's header (the games and /stats) hand the client
# who this browser plays as.
module KnownPlayer
  extend ActiveSupport::Concern

  private

  # The player this browser's cookie names. The page hands it (and its key)
  # to the client so a browser whose storage was wiped (in-app browsers,
  # private tabs that keep cookies) gets its identity back instead of a new
  # one. A browser without one gets a new player here, on its first page:
  # the server mints every player id, since a client-chosen id can't be told
  # apart from someone else's public one. A signed-in browser gets its
  # account's player and email instead, and every browser it's signed in on
  # plays as that one player.
  def load_known_player
    @sign_in_enabled = SignInMailer.enabled?
    account = current_account
    id = account ? account.player_id : cookies.signed[:player_id].to_s
    unless PlayerResolver.uuid?(id) && (account || !Account.owns_player?(id))
      id = SecureRandom.uuid
      remember_player!(id)
      @known_player_new = true
    end

    @account_email = account&.email
    @reminder = account && (account.reminder_enabled ? account.reminder_minutes.to_s : "off:#{account.reminder_minutes}")
    @known_player_id = id
    @known_player_key = PlayerKey.for(id)
    @known_player_name = @known_player_new ? nil : PlayerIdentity.last_name(id)
  end
end
