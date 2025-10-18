# frozen_string_literal: true

class GameChannel < ApplicationCable::Channel
  def subscribed
    # Everyone subscribes to the same stream
    stream_from 'game'
    
    # Send initial state to the new subscriber
    transmit GAME_ENGINE.current_state
  end
  
  def unsubscribed
    # Clean up is handled in Connection#disconnect
  end
  
  def claim_set(data)
    card_ids = data['card_ids']
    player_id = connection.player_id
    
    result = GAME_ENGINE.claim_set(player_id, card_ids)
    
    if result[:success]
      # Broadcast new state to all clients
      ActionCable.server.broadcast('game', result[:new_state])
    else
      # Send error message back to the requesting client
      transmit({ error: result[:message] })
    end
  end
end

