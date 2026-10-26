# frozen_string_literal: true

# Proof that a browser owns a player id. Player ids are public (they're on
# every leaderboard), so an id alone never identifies its owner: the browser
# must also hold the signed player cookie, or this key, which the server only
# ever hands to the owner and which can't be derived from the id.
module PlayerKey
  def self.for(player_id)
    OpenSSL::HMAC.hexdigest("SHA256", secret, "player:#{player_id}")[0, 40]
  end

  def self.valid?(player_id, key)
    key.is_a?(String) && key.length == 40 && ActiveSupport::SecurityUtils.secure_compare(self.for(player_id), key)
  end

  def self.secret
    @secret ||= Rails.application.key_generator.generate_key("setgame player key", 32)
  end
end
