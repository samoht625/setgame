# frozen_string_literal: true

module ApplicationCable
  class Connection < ActionCable::Connection::Base
    identified_by :player_id

    def connect
      uuid_pattern = /\A[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\z/i
      param_player_id = request.params['player_id']
      cookie_player_id = cookies.signed[:player_id]

      if param_player_id&.match?(uuid_pattern)
        self.player_id = param_player_id
        cookies.signed[:player_id] = { value: param_player_id, expires: 1.year.from_now }
      elsif cookie_player_id&.match?(uuid_pattern)
        self.player_id = cookie_player_id
        cookies.signed[:player_id] = { value: cookie_player_id, expires: 1.year.from_now }
      else
        self.player_id = SecureRandom.uuid
        cookies.signed[:player_id] = { value: self.player_id, expires: 1.year.from_now }
      end

      GAME_ENGINE.register_connection(self.player_id)
    end

    def disconnect
      GAME_ENGINE.unregister_connection(self.player_id)
    end
  end
end
