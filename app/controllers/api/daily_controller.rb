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

    # Each player gets one try at the day's deal; once it's started there is
    # nothing more to deal until tomorrow.
    def create
      puzzle = DailyPuzzle.today
      game = puzzle.start_ranked_game(current_player_id)
      return render json: summary(puzzle).merge(error: "already_played"), status: :conflict unless game

      render json: summary(puzzle).merge(
        seed: puzzle.seed,
        rules_version: SoloGame::RULES_VERSION,
        game_id: game.id
      ), status: :created
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
