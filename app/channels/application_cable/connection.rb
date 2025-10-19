# frozen_string_literal: true

module ApplicationCable
  class Connection < ActionCable::Connection::Base
    identified_by :player_id
    
    def connect
      # Assign a unique ephemeral ID to each connection
      self.player_id = SecureRandom.uuid
    # Register player to ensure a default name exists
    GAME_ENGINE.register_player(player_id)
    end
    
    def disconnect
      # Clean up player score on disconnect
    GAME_ENGINE.scores.delete(player_id)
    GAME_ENGINE.unregister_player(player_id)
    end
  end
end

