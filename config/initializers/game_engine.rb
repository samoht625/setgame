# frozen_string_literal: true

# Initialize global game engine instance
require_relative '../../app/services/rules'
require_relative '../../app/services/game_engine'
require_relative '../../app/services/game_state_store'

Rails.application.config.after_initialize do
  snapshot_store = GameStateStore

  begin
    payload, _version = snapshot_store.load
  rescue StandardError => e
    Rails.logger.error "[GameEngine] Snapshot load failed (#{e.class}: #{e.message}); persistence disabled until restart"
    snapshot_store = nil
  end

  engine = GameEngine.new(auto_start: false, snapshot_store: snapshot_store, logger: Rails.logger)
  engine.broadcaster = ->(state) { ActionCable.server.broadcast('game', state) }

  if payload
    engine.restore_from!(payload)
    Rails.logger.info "[GameEngine] Restored multiplayer state from database"
  else
    engine.start_new_round
    Rails.logger.info "[GameEngine] Started #{snapshot_store ? 'fresh' : 'temporary, unsaved'} multiplayer round"
  end

  Object.const_set(:GAME_ENGINE, engine)
end
