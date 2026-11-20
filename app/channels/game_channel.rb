# frozen_string_literal: true

class GameChannel < ApplicationCable::Channel
  CLAIM_LIMIT = { to: 20, within: 10.seconds }.freeze
  UPDATE_NAME_LIMIT = { to: 10, within: 1.minute }.freeze
  HEARTBEAT_LIMIT = { to: 6, within: 10.seconds }.freeze
  CANCEL_RESET_LIMIT = { to: 6, within: 1.minute }.freeze
  TWO_CARD_CACHE_TTL = 30.seconds

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
    if rate_limited?("cable-claim", **CLAIM_LIMIT)
      return transmit({ error: "Too many requests, please wait a moment" })
    end

    card_ids = data['card_ids']
    player_id = connection.player_id

    Rails.logger.info "[GameChannel] claim_set: player=#{player_id}, cards=#{card_ids.inspect.truncate(60)}"

    result = GAME_ENGINE.claim_set(player_id, card_ids, two_card: two_card_choice(player_id))

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
    if rate_limited?("cable-name", **UPDATE_NAME_LIMIT)
      return transmit({ error: "Too many name changes, please wait a moment" })
    end

    player_id = connection.player_id
    new_name = data['name']

    result = GAME_ENGINE.update_name(player_id, new_name)

    if result[:success]
      ActionCable.server.broadcast('game', result[:new_state]) unless result[:unchanged]
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
    if rate_limited?("cable-cancel-reset", **CANCEL_RESET_LIMIT)
      return transmit({ error: "Too many requests, please wait a moment", action: 'reset' })
    end

    result = GAME_ENGINE.cancel_reset(connection.player_id)

    if result[:success]
      ActionCable.server.broadcast('game', result[:new_state])
    else
      transmit({ error: result[:message], action: 'reset' })
    end
  end

  def heartbeat(_data)
    return if rate_limited?("cable-heartbeat", **HEARTBEAT_LIMIT)

    GAME_ENGINE.heartbeat(connection.player_id)
  end

  private

  def rate_limit_key
    @rate_limit_key ||= "#{connection.player_id}:#{SecureRandom.hex(4)}"
  end

  def rate_limited?(name, to:, within:)
    RateLimit.exceeded?(name, rate_limit_key, to: to, within: within)
  end

  def two_card_choice(player_id)
    now = Process.clock_gettime(Process::CLOCK_MONOTONIC)
    version = PlayerSetting.cache_version
    if defined?(@two_card_cached_at) &&
        @two_card_version == version &&
        (now - @two_card_cached_at) < TWO_CARD_CACHE_TTL
      return @two_card_choice
    end

    @two_card_choice = PlayerSetting.two_card_choice(player_id)
    @two_card_version = version
    @two_card_cached_at = now
    @two_card_choice
  end
end
