# frozen_string_literal: true

# One closed day of a daily game as its archive page shows it: the board, the
# solution, the final leaderboard, and what one player did that day.
#
# This is the only place a past day's solution (or a Daily Deal's seed) is
# put together for a page, and it can only be built for a day that
# DailyArchive holds, i.e. one that has closed.
class ArchivedDay
  LEADERBOARD_SIZE = DailyPuzzle::LEADERBOARD_SIZE

  Entry = Struct.new(:rank, :display_name, :elapsed_ms)

  attr_reader :day

  delegate :kind, :number, :date, :name, :title, :path, to: :day

  # The archived day a URL names (kind and number), or nil.
  def self.find(kind, param, now = Time.current)
    return unless DailyArchive::KINDS.include?(kind.to_s)

    archive = DailyArchive.for(kind, now)
    day = archive.find(param.to_s)
    day && new(day, archive: archive, now: now)
  end

  def initialize(day, archive:, now: Time.current)
    raise ArgumentError, "#{day.title} has not closed" unless archive.include?(day.date) && DailyPuzzle.closed?(day.date, now)

    @day = day
    @archive = archive
    @now = now
  end

  def puzzle?
    kind == "puzzle"
  end

  # The Puzzle's 12 cards, or the cards the Daily Deal opens with.
  def board
    @board ||= puzzle? ? game.cards : SoloReplay::Simulator.new(seed).board
  end

  # Every set among the board's cards: the Puzzle's whole solution, and the
  # sets the Daily Deal starts with.
  def sets
    @sets ||= ClassicPuzzle.sets_in(board)
  end

  # The Daily Deal's seed, which deals the whole game. Public once the day has closed.
  def seed
    game.seed unless puzzle?
  end

  # The top of the day's final leaderboard, with what the live leaderboard
  # shows of each player: their rank, the name they chose and their time.
  def leaderboard
    @leaderboard ||= game.leaderboard(limit: LEADERBOARD_SIZE).each_with_index.map do |row, index|
      Entry.new(index + 1, row.display_name.presence, row.elapsed_ms)
    end
  end

  def total
    @total ||= game.total
  end

  def best_ms
    leaderboard.first&.elapsed_ms
  end

  # What the page's script needs to deal this day again as practice.
  def play_data
    data = { kind: kind, number: number, date: date.iso8601, total: total, times: leaderboard.map(&:elapsed_ms) }
    puzzle? ? data.merge(cards: board) : data.merge(seed: seed)
  end

  # The player's own ranked result from the day itself, or nil when they
  # didn't finish it then.
  def result_for(player_id)
    record = puzzle? ? game.run_for(player_id) : game.score_for(player_id)
    return unless record && (!puzzle? || record.finished?)

    marks = puzzle? ? record.marks : (record.claims ? ShareGrid.daily_marks(record.claims) : "")
    { elapsed_ms: record.elapsed_ms, misses: record.misses, rank: game.rank_of(record), total: total, marks: marks }
  end

  # The same game's neighbouring days in the archive.
  def previous_day
    @archive.day(number - 1)
  end

  def next_day
    @archive.day(number + 1)
  end

  # The other daily's archived day on the same date.
  def sibling
    return @sibling if defined?(@sibling)

    @sibling = DailyArchive.for(puzzle? ? "daily" : "puzzle", @now).on(date)
  end

  private

  def game
    @game ||= puzzle? ? ClassicPuzzle.new(date) : DailyPuzzle.new(date)
  end
end
