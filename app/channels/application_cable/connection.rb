# frozen_string_literal: true

module ApplicationCable
  class Connection < ActionCable::Connection::Base
    identified_by :player_id

    # Same rule as the API (see PlayerResolver): a signed-in browser plays as
    # its account's player, and an id from the URL needs the cookie or its key.
    def connect
      account = AccountSession.authenticate(cookies.signed[CurrentAccount::SESSION_COOKIE])&.account
      self.player_id = PlayerResolver.resolve(
        claimed: request.params["player_id"],
        key: request.params["key"],
        cookie: cookies.signed[:player_id],
        freshly_minted: request.params["new"] == "1",
        account: account
      )
      cookies.signed[:player_id] = { value: player_id, expires: 1.year.from_now, httponly: true, same_site: :lax, secure: Rails.env.production? }

      GAME_ENGINE.register_connection(self.player_id)
    end

    def disconnect
      GAME_ENGINE.unregister_connection(self.player_id)
    end
  end
end
