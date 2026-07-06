# frozen_string_literal: true

module Api
  class BaseController < ActionController::API
    include ActionController::Cookies

    before_action :ensure_player_id!

    private

    UUID_PATTERN = /\A[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\z/i

    def ensure_player_id!
      header_id = request.headers["X-Player-Id"].to_s
      cookie_id = cookies.signed[:player_id]

      if header_id.match?(UUID_PATTERN)
        @player_id = header_id
        cookies.signed[:player_id] = { value: header_id, expires: 1.year.from_now }
      elsif cookie_id.to_s.match?(UUID_PATTERN)
        @player_id = cookie_id
      else
        @player_id = SecureRandom.uuid
        cookies.signed[:player_id] = { value: @player_id, expires: 1.year.from_now }
      end
    end

    def current_player_id
      @player_id
    end
  end
end
