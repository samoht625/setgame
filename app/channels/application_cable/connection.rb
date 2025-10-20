# frozen_string_literal: true

module ApplicationCable
  class Connection < ActionCable::Connection::Base
    identified_by :player_id
    
    def connect
      # Try to get player_id from query params or cookie
      player_id = request.params['player_id']
      
      # Validate UUID format
      uuid_pattern = /\A[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\z/i
      
      if player_id && player_id.match?(uuid_pattern)
        self.player_id = player_id
        # Set cookie as fallback for future connections
        cookies.signed[:player_id] = { value: player_id, expires: 1.year.from_now }
      else
        # Generate new UUID if invalid or missing
        self.player_id = SecureRandom.uuid
        cookies.signed[:player_id] = { value: self.player_id, expires: 1.year.from_now }
      end
      
      # Register this connection (tracks active connections)
      GAME_ENGINE.register_connection(player_id)
    end
    
    def disconnect
      # Unregister this connection (will remove player if last connection)
      GAME_ENGINE.unregister_connection(player_id)
    end
  end
end

