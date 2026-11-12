# frozen_string_literal: true

# A player's own settings, kept by player id so they follow a signed-in
# player to every browser and work the same for an anonymous one.
class PlayerSetting < ApplicationRecord
  # true or false once the player has switched two-card mode themselves; nil until then.
  def self.two_card_choice(player_id)
    where(player_id: player_id).pick(:two_card_mode)
  end

  def self.choose_two_card!(player_id, enabled)
    upsert({ player_id: player_id, two_card_mode: enabled }, unique_by: :player_id)
  end
end
