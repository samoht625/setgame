# frozen_string_literal: true

# Initialize global game engine instance
require_relative '../../app/services/rules'
require_relative '../../app/services/game_engine'
require_relative '../../app/services/game_state_store'

GAME_ENGINE = GameEngine.new(auto_start: false)
GAME_ENGINE.broadcaster = ->(state) { ActionCable.server.broadcast('game', state) }

begin
  payload, _version = GameStateStore.load
  if payload
    GAME_ENGINE.restore_from!(payload)
    Rails.logger.info "[GameEngine] Restored multiplayer state from database"
  else
    GAME_ENGINE.start_new_round
    Rails.logger.info "[GameEngine] Started fresh multiplayer round"
  end
rescue StandardError => e
  Rails.logger.warn "[GameEngine] Snapshot restore failed (#{e.class}: #{e.message}); starting fresh"
  GAME_ENGINE.start_new_round
end
