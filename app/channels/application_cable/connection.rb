# frozen_string_literal: true

module ApplicationCable
  class Connection < ActionCable::Connection::Base
    identified_by :player_id
    
    def connect
      # Assign a unique ephemeral ID to each connection
      self.player_id = SecureRandom.uuid
    end
    
    def disconnect
      # Clean up player score on disconnect
      GAME_ENGINE.scores.delete(player_id)
    end
  end
end

