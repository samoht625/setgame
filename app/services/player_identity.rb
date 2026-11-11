# frozen_string_literal: true

# What the server remembers about a player id, for restoring a browser that
# lost its local storage.
module PlayerIdentity
  # The name on the player's most recent named score or puzzle run.
  def self.last_name(player_id)
    score = SoloScore.where(player_id: player_id).where.not(display_name: [nil, ""]).order(completed_at: :desc).pick(:display_name, :completed_at)
    run = PuzzleRun.where(player_id: player_id).where.not(display_name: [nil, ""]).order(completed_at: :desc).pick(:display_name, :completed_at)
    [score, run].compact.max_by { |(_, at)| at || Time.at(0) }&.first
  end
end
