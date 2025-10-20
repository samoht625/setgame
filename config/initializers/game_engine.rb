# frozen_string_literal: true

# Initialize global game engine instance
# We need to require the service explicitly since autoloading happens after initializers
require_relative '../../app/services/rules'
require_relative '../../app/services/game_engine'
GAME_ENGINE = GameEngine.new
GAME_ENGINE.broadcaster = ->(state) { ActionCable.server.broadcast('game', state) }

