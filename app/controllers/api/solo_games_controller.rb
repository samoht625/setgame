# frozen_string_literal: true

module Api
  class SoloGamesController < BaseController
    def create
      SoloGame.expire_stale!

      open_count = SoloGame.open_games.where(player_id: current_player_id).count
      if open_count >= SoloGame::MAX_OPEN_PER_PLAYER
        return render json: { error: "too_many_open_games" }, status: :too_many_requests
      end

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
