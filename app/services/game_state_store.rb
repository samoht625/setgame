# frozen_string_literal: true

# Persists multiplayer GAME_ENGINE state to SQLite.
# Serialize under the engine mutex; write outside it.
class GameStateStore
  NAME = "default"

  def self.load
    snapshot = GameSnapshot.default
    return [nil, nil] unless snapshot
    return [nil, nil] unless snapshot.version == GameSnapshot::CURRENT_VERSION

    payload = snapshot.parsed_payload
    return [nil, nil] unless payload.is_a?(Hash)

    [payload, snapshot.version]
  rescue StandardError => e
    Rails.logger.warn("[GameStateStore] load failed: #{e.class}: #{e.message}")
    [nil, nil]
  end

  def self.save(payload_hash)
    ActiveRecord::Base.connection_pool.with_connection do
      snapshot = GameSnapshot.find_or_initialize_by(name: NAME)
      snapshot.version = GameSnapshot::CURRENT_VERSION
      snapshot.payload = payload_hash.to_json
      snapshot.save!
    end
  rescue StandardError => e
    Rails.logger.warn("[GameStateStore] save failed: #{e.class}: #{e.message}")
  end
end
