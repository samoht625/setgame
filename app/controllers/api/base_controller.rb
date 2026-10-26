# frozen_string_literal: true

module Api
  class BaseController < ActionController::API
    include ActionController::Cookies
    include CurrentAccount

    UUID_PATTERN = PlayerResolver::UUID_PATTERN

    before_action :ensure_player_id!

    private

    # A signed-in browser plays as its account's player. Otherwise the
    # browser's id (X-Player-Id) is used when the browser proves it owns it:
    # the signed cookie names it, X-Player-Key matches it, or it's brand new.
    # Player ids are public on the leaderboards, so an id alone never reads or
    # plays as someone else. A browser that says it only just made its id up
    # (X-Player-New: 1) gets the cookie's player back instead. The id and its
    # key are echoed back in X-Player-Id and X-Player-Key.
    def ensure_player_id!
      @player_id = PlayerResolver.resolve(
        claimed: request.headers["X-Player-Id"],
        key: request.headers["X-Player-Key"],
        cookie: cookies.signed[:player_id],
        freshly_minted: request.headers["X-Player-New"] == "1",
        account: current_account
      )
      remember_player!(@player_id)
      expose_player!(@player_id)
    end

    def expose_player!(player_id)
      response.set_header("X-Player-Id", player_id)
      response.set_header("X-Player-Key", PlayerKey.for(player_id))
    end

    def current_player_id
      @player_id
    end
  end
end
