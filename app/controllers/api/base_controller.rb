# frozen_string_literal: true

module Api
  class BaseController < ActionController::API
    include ActionController::Cookies

    UUID_PATTERN = /\A[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\z/i

    before_action :ensure_player_id!

    private

    # The browser's id (X-Player-Id) wins, except when the browser says it only
    # just made that id up (X-Player-New: 1) and the cookie already names a
    # player: then the cookie's player is restored instead of being replaced by
    # a stranger. The id in use is echoed back in X-Player-Id.
    def ensure_player_id!
      header_id = request.headers["X-Player-Id"].to_s
      cookie_id = cookies.signed[:player_id].to_s
      header_ok = header_id.match?(UUID_PATTERN)
      cookie_ok = cookie_id.match?(UUID_PATTERN)
      freshly_minted = request.headers["X-Player-New"] == "1"

      if header_ok && !(freshly_minted && cookie_ok && cookie_id != header_id)
        @player_id = header_id
        cookies.signed[:player_id] = { value: header_id, expires: 1.year.from_now }
      elsif cookie_ok
        @player_id = cookie_id
      else
        @player_id = SecureRandom.uuid
        cookies.signed[:player_id] = { value: @player_id, expires: 1.year.from_now }
      end
      response.set_header("X-Player-Id", @player_id)
    end

    def current_player_id
      @player_id
    end
  end
end
