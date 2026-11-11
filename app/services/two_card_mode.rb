# frozen_string_literal: true

# Experiment: players with these display names pick two cards and the game
# picks the third. When that card isn't on the board the pair counts as a
# miss. Names match ignoring case and extra spaces; add or remove one here.
module TwoCardMode
  PLAYER_NAMES = %w[Rose Yaniv Tido].freeze

  THIRD_CARD_MISSING = "The third card isn't on the board"

  def self.enabled_for?(name)
    key = normalize(name)
    !key.empty? && PLAYER_NAMES.any? { |allowed| normalize(allowed) == key }
  end

  def self.normalize(name)
    name.to_s.strip.squeeze(" ").downcase
  end
end
