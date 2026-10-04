# frozen_string_literal: true

# The name a player shows on leaderboards: 1–20 letters, digits, spaces,
# underscores or hyphens. Anything else (HTML, emoji, punctuation) is refused.
module PlayerName
  MAX_LENGTH = 20
  PATTERN = /\A[\p{L}\p{Nd} _\-]+\z/u

  # The cleaned name, or nil when it's blank or not allowed.
  def self.sanitize(raw)
    name = raw.to_s.strip.squeeze(" ")
    return nil if name.empty? || name.length > MAX_LENGTH
    return nil unless name.match?(PATTERN)

    name
  end
end
