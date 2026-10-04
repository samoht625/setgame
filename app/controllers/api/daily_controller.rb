# frozen_string_literal: true

module Api
  class DailyController < BaseController
    def show
      puzzle = DailyPuzzle.today
      score = puzzle.score_for(current_player_id)

      render json: summary(puzzle).merge(
        total: puzzle.total,
        leaderboard: puzzle.leaderboard.map { |entry| serialize_entry(entry) },
        me: {
          attempted: puzzle.attempted?(current_player_id),
          streak: puzzle.streak_for(current_player_id),
          result: score && serialize_result(puzzle, score)
        }
      )
    end

    # The first start of the day is the ranked attempt; every later one is an
    # unranked practice deal of the same cards.
    def create
      puzzle = DailyPuzzle.today
      game = puzzle.start_ranked_game(current_player_id)

      render json: summary(puzzle).merge(
        seed: puzzle.seed,
        rules_version: SoloGame::RULES_VERSION,
        ranked: game.present?,
        game_id: game&.id
      ), status: game ? :created : :ok
    end

    private

    def summary(puzzle)
      { date: puzzle.date.iso8601, number: puzzle.number, next_at: puzzle.next_at.iso8601 }
    end

    def serialize_entry(score)
      {
        player_id: score.player_id,
        display_name: score.display_name,
        elapsed_ms: score.elapsed_ms,
        misses: score.misses,
        completed_at: score.completed_at.iso8601
      }
    end

    def serialize_result(puzzle, score)
      {
        elapsed_ms: score.elapsed_ms,
        misses: score.misses,
        rank: puzzle.rank_of(score),
        total: puzzle.total,
        share_token: DailyShare.token(number: puzzle.number, elapsed_ms: score.elapsed_ms)
      }
    end
  end
end
