# frozen_string_literal: true

# Folds an anonymous player's history into an account's player.
#
# Practice games and scores simply move over. The Daily Deal and the Puzzle
# allow one ranked try per person per day, so where both players have a run
# on the same day only one is kept:
#   1. a finished run beats an unfinished one;
#   2. between two finished runs, the one finished first (the first ranked
#      result) is kept;
#   3. between two unfinished runs, the one started first is kept.
# The other run is deleted (it was a second look at the same deal), so the
# leaderboard never shows the same person twice for a day. Streaks, personal
# bests and stats are computed from the rows, so they follow automatically.
module PlayerMerger
  def self.merge!(from:, account:)
    to = account.player_id
    return if from.blank? || from == to

    dropped = { "daily" => [], "puzzle" => [] }
    ApplicationRecord.transaction do
      SoloGame.where(player_id: from).where.not(daily_on: nil).includes(:solo_score).find_each do |game|
        other = SoloGame.includes(:solo_score).find_by(player_id: to, daily_on: game.daily_on)
        next unless other

        loser = [game, other].max_by { |g| daily_rank_key(g) }
        dropped["daily"] << { "date" => loser.daily_on.iso8601, "game_id" => loser.id, "elapsed_ms" => loser.solo_score&.elapsed_ms }
        loser.destroy!
      end

      PuzzleRun.where(player_id: from).find_each do |run|
        other = PuzzleRun.find_by(player_id: to, puzzle_on: run.puzzle_on)
        next unless other

        loser = [run, other].max_by { |r| puzzle_rank_key(r) }
        dropped["puzzle"] << { "date" => loser.puzzle_on.iso8601, "run_id" => loser.id, "elapsed_ms" => loser.elapsed_ms }
        loser.destroy!
      end

      now = Time.current
      SoloGame.where(player_id: from).update_all(player_id: to, updated_at: now)
      SoloScore.where(player_id: from).update_all(player_id: to, updated_at: now)
      PuzzleRun.where(player_id: from).update_all(player_id: to, updated_at: now)
      PlayerMerge.create!(account: account, from_player_id: from, to_player_id: to, dropped: dropped, created_at: now)
    end
    dropped
  end

  # Lower sorts first (is kept).
  def self.daily_rank_key(game)
    score = game.solo_score
    score ? [0, score.completed_at.to_f] : [1, game.started_at.to_f]
  end

  def self.puzzle_rank_key(run)
    run.completed_at ? [0, run.completed_at.to_f] : [1, run.started_at.to_f]
  end
end
