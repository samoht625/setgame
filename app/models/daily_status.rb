# frozen_string_literal: true

# Today's Daily Deal as one player sees it: the leaderboard and their own
# try. /api/daily serves it, and the page inlines it (see HomeController) so
# the first paint already shows the right card instead of a loading one.
module DailyStatus
  module_function

  def for(player_id)
    puzzle = DailyPuzzle.today
    score = puzzle.score_for(player_id)
    summary(puzzle).merge(
      total: puzzle.total,
      leaderboard: puzzle.leaderboard.map { |score| entry(score) },
      me: {
        attempted: puzzle.attempted?(player_id),
        streak: puzzle.streak_for(player_id),
        result: score && result(puzzle, score)
      }
    )
  end

  def summary(puzzle)
    { date: puzzle.date.iso8601, number: puzzle.number, next_at: puzzle.next_at.iso8601 }
  end

  def entry(score)
    {
      player_id: score.player_id,
      display_name: score.display_name,
      elapsed_ms: score.elapsed_ms,
      misses: score.misses,
      completed_at: score.completed_at.iso8601,
      replay: score.claims.present?
    }
  end

  def result(puzzle, score)
    rank = puzzle.rank_of(score)
    total = puzzle.total
    streak = puzzle.streak_for(score.player_id)
    marks = score.claims ? ShareGrid.daily_marks(score.claims) : ""
    {
      display_name: score.display_name,
      elapsed_ms: score.elapsed_ms,
      misses: score.misses,
      rank: rank,
      total: total,
      streak: streak,
      marks: marks,
      share_token: DailyShare.token(number: puzzle.number, elapsed_ms: score.elapsed_ms, rank: rank, total: total, streak: streak, marks: marks),
      replay: score.claims.present?
    }
  end
end
