# frozen_string_literal: true

# Today's Puzzle as one player sees it: the leaderboard and their own run.
# /api/puzzle serves it, and the page inlines it (see HomeController).
module PuzzleStatus
  module_function

  def for(player_id)
    puzzle = ClassicPuzzle.today
    run = puzzle.run_for(player_id)
    total = puzzle.total
    streak = puzzle.streak_for(player_id)
    summary(puzzle).merge(
      total: total,
      leaderboard: puzzle.leaderboard.map { |entry_run| entry(entry_run) },
      me: {
        attempted: run.present?,
        streak: streak,
        result: run&.finished? ? result(puzzle, run, total: total, streak: streak) : nil
      }
    )
  end

  def summary(puzzle)
    { date: puzzle.date.iso8601, number: puzzle.number, next_at: puzzle.next_at.iso8601 }
  end

  def entry(run)
    {
      player_id: run.player_id,
      display_name: run.display_name,
      elapsed_ms: run.elapsed_ms,
      misses: run.misses,
      completed_at: run.completed_at.iso8601,
      replay: false
    }
  end

  def result(puzzle, run, total: puzzle.total, streak: puzzle.streak_for(run.player_id))
    rank = puzzle.rank_of(run)
    marks = run.marks
    {
      display_name: run.display_name,
      elapsed_ms: run.elapsed_ms,
      misses: run.misses,
      rank: rank,
      total: total,
      streak: streak,
      marks: marks,
      share_token: DailyShare.token(kind: "puzzle", number: puzzle.number, elapsed_ms: run.elapsed_ms, rank: rank, total: total, streak: streak, marks: marks),
      replay: false
    }
  end
end
