# frozen_string_literal: true

module Api
  class BaseController < ActionController::API
    include ActionController::Cookies
    include CurrentAccount

    UUID_PATTERN = PlayerResolver::UUID_PATTERN
    WRITES_PER_MINUTE = 600
    CREATES_PER_MINUTE = 60

    before_action :verify_same_origin!, :limit_writes!, unless: -> { request.get? || request.head? }
    before_action :ensure_player_id!

    private

    # The API is cookie-authenticated and has no CSRF token. SameSite=Lax
    # keeps other sites out, but not other hosts on the same site (any
    # *.tido.site page), which can still submit a form here. Browsers send
    # Origin on every POST, PATCH and DELETE, so a write from anywhere but
    # this site's own pages is refused.
    def verify_same_origin!
      origin = request.headers["Origin"]
      return if origin.nil? || origin == request.base_url

      render json: { error: "forbidden_origin" }, status: :forbidden
    end

    def limit_writes!
      ip = request.remote_ip
      limited = RateLimit.exceeded?("api-writes", ip, to: WRITES_PER_MINUTE, within: 1.minute) ||
        (action_name == "create" && RateLimit.exceeded?("api-creates", ip, to: CREATES_PER_MINUTE, within: 1.minute))
      render json: { error: "rate_limited" }, status: :too_many_requests if limited
    end

    # A signed-in browser plays as its account's player. Otherwise the
    # browser's id (X-Player-Id) is used when the browser proves it owns it:
    # the signed cookie names it or X-Player-Key matches it. Player ids are
    # public on the leaderboards, so an id alone never reads or plays as
    # someone else. A browser that says it only just made its id up
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

    # Called when a game starts; only a browser that saw the player's first visit sends a source.
    def record_player_source
      source = request.headers["X-Player-Source"]
      PlayerSource.record(current_player_id, source, request.headers["X-Player-Landing"]) if source.present?
    end
  end
end
