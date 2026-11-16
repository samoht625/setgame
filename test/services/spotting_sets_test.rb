# frozen_string_literal: true

require "test_helper"

class SpottingSetsTest < ActiveSupport::TestCase
  # The saved numbers as they are on disk, read without SpottingSets.
  SAVED = JSON.parse(Rails.root.join("config/blog/spotting_sets.json").read)

  def kind(label, cards, median_ms)
    { label: label, cards: cards, n: 10, p25_ms: median_ms / 2, median_ms: median_ms, p75_ms: median_ms * 2 }
  end

  test "the saved numbers are a whole copy of the stats page's: every kind of set once, with a set of that kind to draw" do
    kinds = SAVED.fetch("kinds")

    every_kind = [true, false].repeated_permutation(4).reject(&:none?)
    assert_equal every_kind.sort_by(&:to_s), kinds.map { |k| SetStats.kind(k.fetch("cards")) }.sort_by(&:to_s), "all 15 kinds, each once"
    kinds.each do |k|
      label, cards = k.values_at("label", "cards")
      assert Rules.is_set?(*cards.sort), "#{label}: #{cards} is a set"
      assert_equal SetStats.new.send(:kind_label, SetStats.kind(cards)), label, "the example is the kind its row says"
      assert_operator k.fetch("n"), :>, 0
      assert_operator k.fetch("p25_ms"), :<=, k.fetch("median_ms"), label
      assert_operator k.fetch("median_ms"), :<=, k.fetch("p75_ms"), label
      assert k.values_at("p25_ms", "median_ms", "p75_ms").all? { |ms| ms.is_a?(Integer) && ms.positive? }, label
    end
    assert_equal kinds.map { |k| k.fetch("median_ms") }.sort, kinds.map { |k| k.fetch("median_ms") }, "fastest first, as the chart lists them"

    assert_operator kinds.sum { |k| k.fetch("n") }, :<=, SAVED.fetch("sets_found"), "timed finds are among the sets found"
    assert_operator SAVED.fetch("players"), :>, 0
    assert_equal %w[1 2 3 4], SAVED.fetch("shares").keys
    assert_in_delta 100, SAVED.fetch("shares").values.sum, 0.2, "the shares are of all finds, each rounded to a tenth"
    assert_equal "https://setdaily.app/stats", SAVED.fetch("source")
  end

  test "the saved lists are the stats page's: ten sets quickest to spot, ten least found, and the fastest find" do
    quickest, least, per_set = SAVED.values_at("quickest", "least_found", "finds_per_set")

    [quickest, least].each do |list|
      assert_equal 10, list.length
      assert_equal 10, list.map { |set| set.fetch("cards").sort }.uniq.length, "ten different sets"
      list.each { |set| assert Rules.is_set?(*set.fetch("cards").sort), "#{set.fetch('cards')} is a set" }
    end
    assert_equal quickest.map { |set| set.fetch("median_ms") }.sort, quickest.map { |set| set.fetch("median_ms") }, "quickest first"
    quickest.each do |set|
      assert_equal 0, set.fetch("median_ms") % 100, "the page prints these to a tenth of a second, and that is all that is kept"
      assert_operator set.fetch("n"), :>=, SetStats::MIN_SAMPLE
    end
    assert_equal least.map { |set| set.fetch("n") }.sort, least.map { |set| set.fetch("n") }, "least found first"
    assert_equal per_set.fetch("min"), least.first.fetch("n")
    assert_operator per_set.fetch("min"), :<=, per_set.fetch("median")
    assert_operator per_set.fetch("median"), :<=, per_set.fetch("max")
    assert_operator least.last.fetch("n"), :<, per_set.fetch("median")

    fastest = SAVED.fetch("fastest_find")
    assert Rules.is_set?(*fastest.fetch("cards").sort)
    assert_operator fastest.fetch("ms"), :<=, quickest.first.fetch("median_ms"), "no set's median beats the one fastest find"
    assert_operator fastest.fetch("ms"), :<=, SAVED.fetch("kinds").map { |k| k.fetch("p25_ms") }.min
  end

  test "the saved list of who finished the most games keeps the counts and no names" do
    most = SAVED.fetch("most_games")

    assert_equal 10, most.length
    assert most.all?(Integer), "games finished, nothing else"
    assert_equal most.sort.reverse, most
    assert_operator most.sum, :<=, SAVED.fetch("games_finished")
    refute_match(/[A-Za-z]{3,}/, SAVED.except("source", "kinds", "taken_at").to_json.gsub(/"[a-z_0-9]+":/, ""), "no player is named anywhere in the saved numbers")
  end

  test "it says when the numbers were taken" do
    assert_equal "2026-11-15T23:09:00-08:00", SAVED.fetch("taken_at")
    taken = SpottingSets.current.taken_at
    assert_equal [2026, 11, 15, 23, 9], [taken.year, taken.month, taken.day, taken.hour, taken.min], "in Pacific time, as it was taken"
    assert_equal "2026-11-15T23:09:00-08:00", taken.iso8601
  end

  test "the day the numbers were taken is the dailies' day, whatever offset it was saved with" do
    saved = JSON.parse(SAVED.to_json, symbolize_names: true)
    # The same moment, written the way a server on UTC would: the 16th there, 11:09 PM on the 15th Pacific.
    in_utc = SpottingSets.new(saved.merge(taken_at: "2026-11-16T07:09:00Z"))

    assert_equal SpottingSets.current.taken_at, in_utc.taken_at
    assert_equal Date.new(2026, 11, 15), in_utc.taken_at.to_date
    assert_equal "2026-11-15T23:09:00-08:00", in_utc.taken_at.iso8601
    assert_equal Date.new(2026, 11, 16), SpottingSets.new(saved.merge(taken_at: "2026-11-16T08:09:00Z")).taken_at.to_date, "an hour later, past midnight Pacific"
    Time.use_zone("Asia/Tokyo") { assert_equal Date.new(2026, 11, 15), SpottingSets.current.taken_at.to_date }
  end

  test "the post reads the saved numbers as they are" do
    post = SpottingSets.current

    assert_equal SAVED.fetch("sets_found"), post.finds
    assert_equal SAVED.fetch("players"), post.players
    assert_equal SAVED.fetch("kinds").map { |k| k.transform_keys(&:to_sym) }, post.kinds, "in the shape SetStats gives the chart"
    assert_equal({ 1 => 13.4, 2 => 34.0, 3 => 38.1, 4 => 14.4 }, post.shares)
    assert_equal SAVED.fetch("games_finished"), post.games
    assert_equal SAVED.fetch("most_games"), post.most_games
    assert_equal SAVED.fetch("finds_per_set").transform_keys(&:to_sym), post.finds_per_set
    assert_equal SAVED.fetch("quickest").map { |set| set.transform_keys(&:to_sym) }, post.quickest
    assert_equal SAVED.fetch("least_found").map { |set| set.transform_keys(&:to_sym) }, post.least_found
    assert_equal SAVED.fetch("fastest_find").transform_keys(&:to_sym), post.fastest_find
    assert_same post, SpottingSets.current, "read once"
  end

  test "the finds with a time are the chart's, and the rest of the sets found have none" do
    post = SpottingSets.current
    timed = SAVED.fetch("kinds").sum { |k| k.fetch("n") }

    assert_equal 35_335, timed
    assert_equal timed, post.timed_finds
    assert_equal SAVED.fetch("sets_found") - timed, post.untimed_finds
    assert_equal 624, post.untimed_finds
    assert_equal post.finds, post.timed_finds + post.untimed_finds
  end

  test "the figures the text quotes are worked out from the kinds" do
    post = SpottingSets.new(
      sets_found: 100, players: 7, taken_at: "2026-01-02T03:04:00-08:00", shares: { "1": 25.0, "2": 25.0, "3": 25.0, "4": 25.0 },
      kinds: [kind("shape", [31, 40, 49], 2000), kind("number", [1, 2, 3], 2600), kind("number + shape", [36, 43, 53], 4400),
              kind("all but color", [8, 54, 70], 7000), kind("all but shape", [25, 48, 77], 9100), kind("all four", [23, 28, 72], 13_100)]
    )

    assert_equal [2000, 2600], post.median_range_ms(1)
    assert_equal [4400, 4400], post.median_range_ms(2)
    assert_equal [7000, 9100], post.median_range_ms(3)
    assert_equal [13_100, 13_100], post.median_range_ms(4)
    assert_equal 2600, post.median_ms("number")
    assert_equal 9100, post.median_ms("all but shape")
    assert_raises(KeyError) { post.median_ms("all but shading") }
    assert_equal 7, post.slowdown, "13.1s over 2.0s, to the nearest whole"
    assert_equal 4400, post.kind("number + shape").fetch(:p75_ms) / 2
    assert_equal 60, post.timed_finds, "ten finds of each of six kinds"
    assert_equal 40, post.untimed_finds
    assert_equal %w[shape], post.differing([31, 40, 49])
    assert_equal %w[number shape shading], post.differing([8, 54, 70])
    assert_equal %w[number color shape shading], post.differing([23, 28, 72])
  end

  test "the headline's multiple is the saved numbers'" do
    post = SpottingSets.current

    assert_equal 5, post.slowdown
    assert_includes SpottingSets::TITLE, "#{post.slowdown}x"
    assert_includes SpottingSets::DESCRIPTION, "#{BlogHelper::NUMBER_WORDS[post.slowdown]} times as long"
    assert_equal post.kinds.last, post.kinds.find { |k| k[:label] == "all four" }, "and the slowest kind is the one it names"
  end

  test "the headline uses curly quotes throughout, which need no escaping anywhere it is written" do
    refute_match(/["'<>&]/, SpottingSets::TITLE)
    assert_equal SpottingSets::TITLE.count("“"), SpottingSets::TITLE.count("”"), "every opening quote is closed"
  end
end
