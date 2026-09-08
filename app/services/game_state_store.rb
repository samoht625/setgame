# frozen_string_literal: true

# Persists multiplayer GAME_ENGINE state to SQLite.
# Serialize under the engine mutex; write outside it.
class GameStateStore
  NAME = "default"

  class LoadError < StandardError; end

  def self.load
    ActiveRecord::Base.connection_pool.with_connection do
      snapshot = GameSnapshot.default
      return [nil, nil] unless snapshot

      unless snapshot.version == GameSnapshot::CURRENT_VERSION
        raise LoadError, "Unsupported snapshot version: #{snapshot.version}"
      end

      payload = snapshot.parsed_payload
      raise LoadError, "Invalid snapshot payload" unless payload.is_a?(Hash)

      [payload, snapshot.version]
    end
  end

  def self.save(payload_hash)
    Rails.application.executor.wrap do
      ActiveRecord::Base.connection_pool.with_connection do
        snapshot = GameSnapshot.find_or_initialize_by(name: NAME)
        snapshot.version = GameSnapshot::CURRENT_VERSION
        snapshot.payload = payload_hash.to_json
        snapshot.save!
      end
    end
  end
end
