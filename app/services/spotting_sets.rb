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
  TITLE = "Spotting “all different” Sets takes 5x longer"
  SLUG = "spotting-sets"
  DESCRIPTION = "Timing from Set Daily’s Daily Deal and Practice games: each feature that differs across the three cards makes a set slower to spot, and sets where all four differ take five times as long as the easiest."
  PUBLISHED_ON = Date.new(2026, 11, 16)
  SNAPSHOT = Rails.root.join("config/blog/spotting_sets.json")

  def self.current
    @current ||= new(JSON.parse(SNAPSHOT.read, symbolize_names: true))
  end

  # The 15 kinds of set as the How fast chart reads them, fastest first.
  attr_reader :kinds

  def initialize(snapshot)
    @snapshot = snapshot
    @kinds = snapshot.fetch(:kinds)
  end

  # When the numbers were copied from /stats.
  def taken_at
    Time.iso8601(@snapshot.fetch(:taken_at))
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
end
