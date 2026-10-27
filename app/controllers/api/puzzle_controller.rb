# frozen_string_literal: true

module Api
  # The daily classic Puzzle: 12 cards, find all 6 sets. One try a day.
  class PuzzleController < BaseController
    def show
      render json: PuzzleStatus.for(current_player_id)
    end

    # Deals today's board, or hands back the player's unfinished run so a
    # reload (or a wiped browser) picks it up where it was, clock still running.
    def create
      puzzle = ClassicPuzzle.today
      run = puzzle.start_run(current_player_id)
      return render json: summary(puzzle).merge(error: "already_played"), status: :conflict if run.finished?

      render json: summary(puzzle).merge(
        game_id: run.id,
        cards: run.cards,
        started_at: run.started_at.iso8601(3),
        found: run.found
      ), status: run.previously_new_record? ? :created : :ok
    end

    def progress
      run = PuzzleRun.find_by(id: params[:id].to_s, player_id: current_player_id)
      return head :not_found unless run

      ClassicPuzzle.new(run.puzzle_on).record_progress!(run, params[:claims])
      head :no_content
    end

    def finish
      run = PuzzleRun.find_by(id: params[:id].to_s, player_id: current_player_id)
      return render json: { error: "not_found" }, status: :not_found unless run

      puzzle = ClassicPuzzle.new(run.puzzle_on)
      outcome = puzzle.finish!(
        run,
        elapsed_ms: params[:elapsed_ms],
        claims: params[:claims],
        misses: params[:misses],
        attempts: params[:attempts],
        display_name: params[:display_name]
      )
      unless %i[ok already_finished].include?(outcome)
        return render json: { error: outcome.to_s }, status: :unprocessable_entity
      end

      render json: { ok: true, result: serialize_result(puzzle, run.reload), streak: puzzle.streak_for(current_player_id) }
    end

    # Names the player's own finished run for today; the game id proves it's theirs.
    def name
      display_name = PlayerName.sanitize(params[:display_name])
      return render json: { error: "invalid_name" }, status: :unprocessable_entity unless display_name

      run = PuzzleRun.finished.find_by(id: params[:game_id].to_s, player_id: current_player_id, puzzle_on: ClassicPuzzle.today.date)
      return render json: { error: "not_found" }, status: :not_found unless run

      run.update!(display_name: display_name)
      render json: { ok: true, display_name: display_name }
    end

    private

    def summary(puzzle) = PuzzleStatus.summary(puzzle)
    def serialize_result(puzzle, run) = PuzzleStatus.result(puzzle, run)
  end
end
