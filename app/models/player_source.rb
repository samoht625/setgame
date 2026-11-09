# frozen_string_literal: true

# A player's first-touch source, sent by the browser that first saw them
# (X-Player-Source, X-Player-Landing; see app/javascript/lib/source.ts).
# The first one recorded for a player is kept.
class PlayerSource < ApplicationRecord
  SOURCE = /\A[a-z0-9][a-z0-9._:-]{0,47}\z/
  LANDING = %r{\A/[a-z/]{0,31}\z}

  def self.record(player_id, source, landing)
    source = source.to_s.strip.downcase
    return unless player_id.present? && SOURCE.match?(source)

    landing = landing.to_s
    insert({ player_id:, source:, landing: LANDING.match?(landing) ? landing : nil, created_at: Time.current }, unique_by: :player_id)
  end
end
