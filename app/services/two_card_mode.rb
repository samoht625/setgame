# frozen_string_literal: true

# Two-card mode: the player picks two cards and the game picks the third.
# When that card isn't on the board the pair counts as a miss.
#
# It's a setting every player can switch (PlayerSetting). Until they do,
# it's on for the display names below, matched ignoring case and extra
# spaces, and off for everyone else. two_card_mode.ts has the same names.
module TwoCardMode
  DEFAULT_ON_NAMES = %w[Tido Rose Yaniv].freeze

  THIRD_CARD_MISSING = "The third card isn't on the board"

  # `choice` is the player's own setting: true, false, or nil when they haven't chosen.
  def self.enabled?(choice:, name:)
    choice.nil? ? default_on?(name) : choice
  end

  def self.default_on?(name)
    key = normalize(name)
    !key.empty? && DEFAULT_ON_NAMES.any? { |default| normalize(default) == key }
  end

  def self.normalize(name)
    name.to_s.strip.squeeze(" ").downcase
  end
end
