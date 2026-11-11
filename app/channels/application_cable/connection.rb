# frozen_string_literal: true

module ApplicationCable
  class Connection < ActionCable::Connection::Base
    CONNECTS_PER_MINUTE = 60
    OPEN_PER_IP = 30

    identified_by :player_id

    @open_by_ip = Hash.new(0)
    @open_lock = Mutex.new

    class << self
      # Reserves one of the IP's open connections; false when it has them all.
      def reserve(ip)
        @open_lock.synchronize do
          return false if @open_by_ip[ip] >= OPEN_PER_IP

          @open_by_ip[ip] += 1
          true
        end
      end

      def release(ip)
        @open_lock.synchronize do
          @open_by_ip[ip] -= 1
          @open_by_ip.delete(ip) if @open_by_ip[ip] <= 0
        end
      end
    end

    # Same rule as the API (see PlayerResolver): a signed-in browser plays as
    # its account's player, and an id from the URL needs the cookie or its key.
    # Every connection joins the shared table, so one client can't open them
    # without limit.
    def connect
      ip = request.remote_ip
      reject_unauthorized_connection if RateLimit.exceeded?("cable-connects", ip, to: CONNECTS_PER_MINUTE, within: 1.minute)
      reject_unauthorized_connection unless self.class.reserve(ip)
      @reserved_ip = ip

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
      GAME_ENGINE.unregister_connection(self.player_id) if player_id
      self.class.release(@reserved_ip) if @reserved_ip
    end
  end
end
