# frozen_string_literal: true

require "json"

# The blog post at /blog/spotting-sets: which kinds of set people spot fast
# and which they miss.
#
# Its charts and every figure in its text come from one saved copy of the
# /stats numbers (config/blog/spotting_sets.json, written by
# script/stats_snapshot.rb), so the two can't drift apart as people keep
# playing. /stats has the live numbers.
class SpottingSets
  # The post's headline: its h1, page title, link previews and the blog index.
  TITLE = "Why “all different” Sets take 5x longer"
  SLUG = "spotting-sets"
  DESCRIPTION = "In Set Daily’s Daily Deal and Practice games, each differing feature multiplies search time, sharing color alone beats sharing shape and number, and all-different sets take five times as long."
  PUBLISHED_ON = Date.new(2026, 11, 22)
  SNAPSHOT = Rails.root.join("config/blog/spotting_sets.json")
  SHADINGS = %w[solid striped open].freeze

  def self.current
    @current ||= new(JSON.parse(SNAPSHOT.read, symbolize_names: true))
  end

  # The 15 kinds of set as the How fast chart reads them, fastest first.
  attr_reader :kinds

  def initialize(snapshot)
    @snapshot = snapshot
    @kinds = snapshot.fetch(:kinds)
  end

  # When the numbers were copied from /stats, on the dailies' clock, so the
  # day the post gives is that day's Puzzle's whatever offset it was saved with.
  def taken_at
    Time.iso8601(@snapshot.fetch(:taken_at)).in_time_zone(DailyPuzzle::TIME_ZONE)
  end

  # Every set found, timed or not: the Sets found tile.
  def finds
    @snapshot.fetch(:sets_found)
  end

  # The finds the How fast chart times. A find made more than
  # SetStats::IDLE_MS after the one before it, or in an unfinished game that
  # kept only a count, is found but not timed.
  def timed_finds
    kinds.sum { |kind| kind[:n] }
  end

  def untimed_finds
    finds - timed_finds
  end

  def players
    @snapshot.fetch(:players)
  end

  def games
    @snapshot.fetch(:games_finished)
  end

  # The games finished by each of the players /stats lists by name, most first.
  def most_games
    @snapshot.fetch(:most_games)
  end

  # Percent of finds with 1 to 4 features all different, as What gets found reads them.
  def shares
    @snapshot.fetch(:shares).to_h { |differences, percent| [differences.to_s.to_i, percent] }
  end

  # How often each of the possible sets has been found: { min:, max:, median: }.
  def finds_per_set
    @snapshot.fetch(:finds_per_set)
  end

  # The ten sets with the lowest median time, as Quickest to spot lists them: [{ cards:, median_ms:, n: }].
  def quickest
    @snapshot.fetch(:quickest)
  end

  # The ten sets found the fewest times, as Least found lists them: [{ cards:, n: }].
  def least_found
    @snapshot.fetch(:least_found)
  end

  # The one fastest find: { cards:, ms: }.
  def fastest_find
    @snapshot.fetch(:fastest_find)
  end

  # The row of the chart labelled `label`.
  def kind(label)
    kinds.find { |kind| kind[:label] == label } || raise(KeyError, "no kind of set called #{label}")
  end

  # The median time to find the kind of set the chart labels `label`.
  def median_ms(label)
    kind(label).fetch(:median_ms)
  end

  # The fastest and slowest median among the kinds with this many features all different.
  def median_range_ms(differences)
    kinds.select { |kind| differing(kind[:cards]).length == differences }.map { |kind| kind[:median_ms] }.minmax
  end

  # How many times longer the slowest kind takes than the fastest.
  def slowdown
    fastest, slowest = kinds.map { |kind| kind[:median_ms] }.minmax
    (slowest.to_f / fastest).round
  end

  # The features that are all different across these three cards, by name.
  def differing(cards)
    SetStats::ATTRS.zip(SetStats.kind(cards)).filter_map { |name, differs| name if differs }
  end

  # How many possible sets belong to one specific kind with this many differing features.
  def possible_sets_for_kind(differences)
    27 * (2**(differences - 1))
  end

  # How many possible sets in the 1,080-set deck have this many features all different.
  def possible_sets_by_diff(differences)
    SetStats::TOTAL_SETS * SetStats::CHANCE.fetch(differences) / 100
  end

  # Average timed finds per possible set among all kinds with this many differing features.
  def avg_finds_per_set_by_diff(differences)
    total = kinds.select { |k| differing(k[:cards]).length == differences }.sum { |k| k[:n] }
    total.to_f / possible_sets_by_diff(differences)
  end

  # Ratio of observed timed-find share to theoretical deck share for the kind labelled `label`.
  def relative_rate(label)
    row = kind(label)
    observed = row[:n].to_f / timed_finds
    expected = possible_sets_for_kind(differing(row[:cards]).length).to_f / SetStats::TOTAL_SETS
    observed / expected
  end

  # Uniform shading counts among the quickest sets (each set in quickest differs in one feature).
  def quickest_shadings
    counts = SHADINGS.to_h { |name| [name, 0] }
    quickest.each do |set|
      values = set[:cards].map { |id| Rules.card_attributes(id)[:shading] }.uniq
      counts[SHADINGS[values.first]] += 1 if values.length == 1
    end
    counts
  end

  # Log-linear multiplicative fit across all 15 kinds:
  # median_ms ~ base_ms * prod(multiplier[feature] ** differs[feature]).
  def multiplicative_fit
    @multiplicative_fit ||= begin
      rows = kinds.map do |k|
        diff = differing(k[:cards])
        x = [1.0] + SetStats::ATTRS.map { |attr| diff.include?(attr) ? 1.0 : 0.0 }
        [x, Math.log(k[:median_ms].to_f), k[:median_ms].to_f]
      end

      size = 5
      xtx = Array.new(size) { |i| Array.new(size) { |j| rows.sum { |x, _, _| x[i] * x[j] } } }
      xty = Array.new(size) { |i| rows.sum { |x, y, _| x[i] * y } }
      beta = solve_linear_system(xtx, xty)

      actual = rows.map(&:last)
      mean = actual.sum / actual.length
      predicted = rows.map { |x, _, _| Math.exp(x.each_with_index.sum { |v, j| v * beta[j] }) }
      ss_res = actual.zip(predicted).sum { |a, p| (a - p)**2 }
      ss_tot = actual.sum { |a| (a - mean)**2 }

      {
        base_ms: Math.exp(beta[0]),
        multipliers: SetStats::ATTRS.each_with_index.to_h { |attr, i| [attr, Math.exp(beta[i + 1])] },
        r_squared: ss_tot.zero? ? 1.0 : 1.0 - (ss_res / ss_tot)
      }
    end
  end

  private

  def solve_linear_system(matrix, rhs)
    n = rhs.length
    aug = matrix.each_with_index.map { |row, i| row + [rhs[i]] }
    n.times do |i|
      pivot = (i...n).max_by { |r| aug[r][i].abs }
      aug[i], aug[pivot] = aug[pivot], aug[i]
      ((i + 1)...n).each do |r|
        factor = aug[r][i] / aug[i][i]
        (i..n).each { |c| aug[r][c] -= factor * aug[i][c] }
      end
    end
    solution = Array.new(n, 0.0)
    (n - 1).downto(0) do |i|
      sum = ((i + 1)...n).sum { |c| aug[i][c] * solution[c] }
      solution[i] = (aug[i][n] - sum) / aug[i][i]
    end
    solution
  end
end
