# frozen_string_literal: true

module ApplicationCable
  class Connection < ActionCable::Connection::Base
    identified_by :player_id
    
    def connect
      # Try to get player_id from query params or signed cookie
      param_player_id = request.params['player_id']
      cookie_player_id = cookies.signed[:player_id]
      
      # Validate UUID format
      uuid_pattern = /\A[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\z/i
      
      if param_player_id && param_player_id.match?(uuid_pattern)
        # Prefer explicit param when valid
        self.player_id = param_player_id
        cookies.signed[:player_id] = { value: param_player_id, expires: 1.year.from_now }
      elsif cookie_player_id && cookie_player_id.match?(uuid_pattern)
        # Fallback to previously issued signed cookie
        self.player_id = cookie_player_id
        cookies.signed[:player_id] = { value: cookie_player_id, expires: 1.year.from_now }
      else
        # Generate new UUID if invalid or missing
        self.player_id = SecureRandom.uuid
        cookies.signed[:player_id] = { value: self.player_id, expires: 1.year.from_now }
      end
      
      # Register this connection (tracks active connections)
      GAME_ENGINE.register_connection(self.player_id)
    end
    
    def disconnect
      # Unregister this connection (will remove player if last connection)
      GAME_ENGINE.unregister_connection(self.player_id)
    end
  end
end

