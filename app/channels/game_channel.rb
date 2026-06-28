# frozen_string_literal: true

class GameChannel < ApplicationCable::Channel
  def subscribed
    Rails.logger.info "[GameChannel] Client subscribed, player_id: #{connection.player_id}"

    # Everyone subscribes to the same stream
    stream_from 'game'

    # Send initial state to the new subscriber
    transmit GAME_ENGINE.current_state
    transmit({ your_id: connection.player_id })
  end

  def unsubscribed
    Rails.logger.info "[GameChannel] Client unsubscribed, player_id: #{connection.player_id}"
    # Clean up is handled in Connection#disconnect
  end

  def claim_set(data)
    card_ids = data['card_ids']
    player_id = connection.player_id

    Rails.logger.info "[GameChannel] claim_set: player=#{player_id}, cards=#{card_ids.inspect}"

    result = GAME_ENGINE.claim_set(player_id, card_ids)

    if result[:success]
      # Broadcast new state to all clients
      ActionCable.server.broadcast('game', result[:new_state])
      # Send success confirmation to the claiming client
      transmit({ success: true }.merge(result[:new_state]))
    else
      # Send error message back to the requesting client
      transmit({ error: result[:message] })
    end
  end

  def update_name(data)
    player_id = connection.player_id
    new_name = data['name']

    result = GAME_ENGINE.update_name(player_id, new_name)

    if result[:success]
      ActionCable.server.broadcast('game', result[:new_state])
    else
      transmit({ error: result[:message] })
    end
  end

  def request_reset(_data)
    result = GAME_ENGINE.request_reset(connection.player_id)

    if result[:success]
      ActionCable.server.broadcast('game', result[:new_state])
    else
      transmit({ error: result[:message], action: 'reset' })
    end
  end

  def cancel_reset(_data)
    result = GAME_ENGINE.cancel_reset(connection.player_id)

    if result[:success]
      ActionCable.server.broadcast('game', result[:new_state])
    else
      transmit({ error: result[:message], action: 'reset' })
    end
  end

  def heartbeat(_data)
    GAME_ENGINE.heartbeat(connection.player_id)
  end
end
