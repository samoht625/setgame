# frozen_string_literal: true

module Api
  class SoloGamesController < BaseController
    def create
      SoloGame.expire_stale!

      # Make room instead of rejecting: abandoned games (restart, idle reset,
      # failed submit) previously stayed "open" for 7 days, and once a player
      # had MAX_OPEN_PER_PLAYER of them every new game was refused — the client
      # then fell back to an ineligible local game and finished runs silently
      # never reached the leaderboard.
      SoloGame.abandon_excess_open!(
        player_id: current_player_id,
        keep: SoloGame::MAX_OPEN_PER_PLAYER - 1
      )

      game = SoloGame.create!(
        id: SecureRandom.uuid,
        player_id: current_player_id,
        seed: SecureRandom.random_number(2**32).to_s,
        rules_version: SoloGame::RULES_VERSION,
        status: "open",
        started_at: Time.current
      )

      render json: {
        game_id: game.id,
        seed: game.seed.to_i,
        rules_version: game.rules_version
      }, status: :created
    end
  end
end
