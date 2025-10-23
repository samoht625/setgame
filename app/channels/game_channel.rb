# frozen_string_literal: true

class GameChannel < ApplicationCable::Channel
  def subscribed
    Rails.logger.info "[GameChannel] Client subscribed, player_id: #{connection.player_id}"
    
    # Everyone subscribes to the same stream
    stream_from 'game'
    
    Rails.logger.info "[GameChannel] Streaming from 'game'"
    
    # Send initial state to the new subscriber
    initial_state = GAME_ENGINE.current_state
    Rails.logger.info "[GameChannel] Transmitting initial state: #{initial_state.inspect}"
    transmit initial_state

    # Send the connecting client's own player_id (not broadcast)
    debug_meta = {
      your_id: connection.player_id,
      debug: {
        id_source: (connection.respond_to?(:id_source) ? connection.id_source : nil),
        request_meta: (connection.respond_to?(:request_meta) ? connection.request_meta : nil)
      }
    }
    transmit(debug_meta)
  end
  
  def unsubscribed
    Rails.logger.info "[GameChannel] Client unsubscribed, player_id: #{connection.player_id}"
    # Clean up is handled in Connection#disconnect
  end
  
  def claim_set(data)
    Rails.logger.info "[GameChannel] claim_set called with data: #{data.inspect}"
    Rails.logger.info "[GameChannel] player_id: #{connection.player_id}"
    
    card_ids = data['card_ids']
    player_id = connection.player_id
    
    Rails.logger.info "[GameChannel] Processing claim: player=#{player_id}, cards=#{card_ids.inspect}"
    
    result = GAME_ENGINE.claim_set(player_id, card_ids)
    
    Rails.logger.info "[GameChannel] Result: success=#{result[:success]}, message=#{result[:message]}"
    
    if result[:success]
      Rails.logger.info "[GameChannel] Broadcasting new state to all clients"
      # Broadcast new state to all clients
      ActionCable.server.broadcast('game', result[:new_state])
      # Send success confirmation to the claiming client
      transmit({ success: true }.merge(result[:new_state]))
    else
      Rails.logger.info "[GameChannel] Sending error to client: #{result[:message]}"
      # Send error message back to the requesting client
      transmit({ error: result[:message] })
    end
  end

  def update_name(data)
    Rails.logger.info "[GameChannel] update_name called with data: #{data.inspect}"
    player_id = connection.player_id
    new_name = data['name']

    result = GAME_ENGINE.update_name(player_id, new_name)

    if result[:success]
      Rails.logger.info "[GameChannel] Broadcasting updated names to all clients"
      ActionCable.server.broadcast('game', result[:new_state])
    else
      Rails.logger.info "[GameChannel] Sending name update error to client: #{result[:message]}"
      transmit({ error: result[:message] })
    end
  end

  def heartbeat(_data)
    GAME_ENGINE.heartbeat(connection.player_id)
    # Emit an inline heartbeat log for diagnostics (no secrets)
    begin
      Rails.logger.info "[GameChannel] Heartbeat from #{connection.player_id}"
    rescue => _
    end
  end
end

