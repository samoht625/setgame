# frozen_string_literal: true

require "json"

# The blog post at /blog/spotting-sets: which kinds of set people spot fast
# and which they miss.
#
# Its chart and every figure in its text come from one saved copy of the
# /stats numbers (config/blog/spotting_sets.json, written by
# script/stats_snapshot.rb), so the two can't drift apart as people keep
# playing. /stats has the live numbers.
class SpottingSets
  # The post's headline: its h1, page title, link previews and the blog index.
  TITLE = "Spotting “all different” Sets takes 5x longer"
  SLUG = "spotting-sets"
  DESCRIPTION = "Set Daily times every set its players find. What that timing shows: each feature that differs across the three cards makes a set slower to spot, and sets where all four differ take five times as long as the easiest."
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

  def finds
    @snapshot.fetch(:sets_found)
  end

  def players
    @snapshot.fetch(:players)
  end

  # Percent of finds with 1 to 4 features all different, as What gets found reads them.
  def shares
    @snapshot.fetch(:shares).to_h { |differences, percent| [differences.to_s.to_i, percent] }
  end

  # The median time to find the kind of set the chart labels `label`.
  def median_ms(label)
    kinds.find { |kind| kind[:label] == label }&.fetch(:median_ms) || raise(KeyError, "no kind of set called #{label}")
  end

  # The fastest and slowest median among the kinds with this many features all different.
  def median_range_ms(differences)
    kinds.select { |kind| SetStats.kind(kind[:cards]).count(true) == differences }.map { |kind| kind[:median_ms] }.minmax
  end

  # How many times longer the slowest kind takes than the fastest.
  def slowdown
    fastest, slowest = kinds.map { |kind| kind[:median_ms] }.minmax
    (slowest.to_f / fastest).round
  end
end
