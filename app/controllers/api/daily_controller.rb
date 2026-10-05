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

    # Puts a name on the player's own score for today, e.g. after finishing as
    # Anonymous. Player ids are public on the leaderboard, so the id alone isn't
    # proof of ownership: the request must also name the game the score came
    # from, which only the browser that played it was ever told.
    def name
      display_name = PlayerName.sanitize(params[:display_name])
      return render json: { error: "invalid_name" }, status: :unprocessable_entity unless display_name

      puzzle = DailyPuzzle.today
      score = SoloScore.find_by(
        solo_game_id: params[:game_id].to_s,
        player_id: current_player_id,
        daily_on: puzzle.date
      )
      return render json: { error: "not_found" }, status: :not_found unless score

      score.update!(display_name: display_name)
      render json: { ok: true, display_name: display_name }
    end

    # The player's run next to another finisher's from that day's leaderboard,
    # claim by claim. The claims solve the deal, so only players who have
    # finished it themselves get them, and only for runs already on the board.
    def compare
      puzzle = compare_puzzle
      return render json: { error: "invalid_date" }, status: :bad_request unless puzzle

      mine = puzzle.score_for(current_player_id)
      return render json: { error: "not_finished" }, status: :forbidden unless mine

      other_id = params[:player_id].to_s
      theirs = puzzle.leaderboard.find { |score| score.player_id == other_id } unless other_id == current_player_id
      unless theirs&.claims && mine.claims
        return render json: { error: "not_found" }, status: :not_found
      end

      render json: summary(puzzle).merge(
        seed: puzzle.seed,
        me: serialize_run(puzzle, mine),
        them: serialize_run(puzzle, theirs)
      )
    end

    private

    def summary(puzzle)
      { date: puzzle.date.iso8601, number: puzzle.number, next_at: puzzle.next_at.iso8601 }
    end

    # Today unless a date is asked for, so a card loaded before midnight still
    # compares against the day it shows. Never a day that hasn't started.
    def compare_puzzle
      today = DailyPuzzle.today
      return today if params[:date].blank?

      date = Date.iso8601(params[:date].to_s)
      DailyPuzzle.new(date) if date <= today.date
    rescue Date::Error
      nil
    end

    def serialize_entry(score)
      {
        player_id: score.player_id,
        display_name: score.display_name,
        elapsed_ms: score.elapsed_ms,
        misses: score.misses,
        completed_at: score.completed_at.iso8601,
        replay: score.claims.present?
      }
    end

    def serialize_result(puzzle, score)
      {
        display_name: score.display_name,
        elapsed_ms: score.elapsed_ms,
        misses: score.misses,
        rank: puzzle.rank_of(score),
        total: puzzle.total,
        share_token: DailyShare.token(number: puzzle.number, elapsed_ms: score.elapsed_ms),
        replay: score.claims.present?
      }
    end

    def serialize_run(puzzle, score)
      {
        display_name: score.display_name,
        elapsed_ms: score.elapsed_ms,
        rank: puzzle.rank_of(score),
        claims: score.claims
      }
    end
  end
end
