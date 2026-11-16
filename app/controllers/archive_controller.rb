# frozen_string_literal: true

# The archive: a page for every closed day of the Daily Deal (/daily/:number)
# and the Puzzle (/puzzle/:number), and the index that lists them (/archive).
# The pages are the same for everyone and readable without JavaScript: the
# board, the day's final leaderboard and the solution.
class ArchiveController < ApplicationController
  include CurrentAccount
  include KnownPlayer

  def index
    @index = DailyArchive::Index.new(DailyArchive.all)
    @page = @index.page_number(params[:page])
    return not_found unless @page

    @rows = @index.rows(@page)
    @stats = day_stats(@rows.map(&:date))
    load_known_player
  end

  def daily
    show_day("daily")
  end

  def puzzle
    show_day("puzzle")
  end

  private

  # Only a closed day has a page. Today's number goes to the live game; a day
  # that hasn't closed yet, a future day or anything else is not found.
  def show_day(kind)
    @day = ArchivedDay.find(kind, params[:number])
    unless @day
      live = kind == "puzzle" ? ClassicPuzzle.today : DailyPuzzle.today
      return redirect_to(kind == "puzzle" ? root_path : daily_path) if params[:number].to_s == live.number.to_s

      return not_found
    end

    load_known_player
    render :day
  end

  def not_found
    render file: Rails.public_path.join("404.html"), status: :not_found, layout: false
  end

  # How many players finished each of these days, and the best time, per game.
  def day_stats(dates)
    return { "daily" => {}, "puzzle" => {} } if dates.empty?

    scores = SoloScore.where(daily_on: dates).group(:daily_on)
    runs = PuzzleRun.finished.where(puzzle_on: dates).group(:puzzle_on)
    {
      "daily" => merge_stats(scores.count, scores.minimum(:elapsed_ms)),
      "puzzle" => merge_stats(runs.count, runs.minimum(:elapsed_ms))
    }
  end

  def merge_stats(counts, bests)
    counts.to_h { |date, count| [date.to_date, { count: count, best_ms: bests[date] }] }
  end
end
