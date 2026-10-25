# frozen_string_literal: true

# Aggregate, anonymous stats over every found set: finished runs (solo_scores)
# plus unfinished games that saved their claims (solo_games.events).
class SetStats
  ATTRS = %w[number color shape shading].freeze
  CHANCE = { 1 => 10, 2 => 30, 3 => 40, 4 => 20 }.freeze
  TOTAL_SETS = 1080
  MIN_SAMPLE = 5
  ZONE = "America/Chicago"

  def self.cached
    Rails.cache.fetch("set_stats/v6", expires_in: 5.minutes) { new.compute }
  end

  def self.all_sets
    @all_sets ||= (1..81).to_a.combination(3).select { |a, b, c| Rules.is_set?(a, b, c) }.freeze
  end

  def self.kind(cards)
    attrs = cards.map { |c| Rules.card_attributes(c) }
    ATTRS.map { |a| attrs.map { |h| h[a.to_sym] }.uniq.length == 3 }
  end

  def compute
    finds = []  # [cards, gap_ms, mode]
    runs = { "solo" => [], "daily" => [] }
    droughts = []

    SoloScore.select(:id, :events, :elapsed_ms, :daily_on).find_each do |s|
      mode = s.daily_on ? "daily" : "solo"
      runs[mode] << s.elapsed_ms
      add_claims(s.events, mode, finds, droughts)
    end
    unfinished_counted = 0
    SoloGame.where.not(status: "completed").select(:id, :events, :sets_found, :daily_on).find_each do |g|
      claims = Array(g.events)
      if claims.any?
        add_claims(claims, g.daily_on ? "daily" : "solo", finds, droughts)
      else
        unfinished_counted += g.sets_found.to_i
      end
    end

    by_triple = Hash.new { |h, k| h[k] = [] }
    finds.each { |cards, gap, _| by_triple[cards] << gap }
    by_diff = Hash.new { |h, k| h[k] = [] }
    by_shared = Hash.new { |h, k| h[k] = [] }
    type_counts = Hash.new(0)
    finds.each do |cards, gap, _|
      k = self.class.kind(cards)
      n = k.count(true)
      type_counts[n] += 1
      by_diff[n] << gap
      ATTRS.each_with_index { |a, i| by_shared[a] << gap unless k[i] }
    end

    counts = by_triple.transform_values(&:length)
    fastest = by_triple.select { |_, g| g.length >= MIN_SAMPLE }
      .map { |c, g| { cards: c, median_ms: median(g), n: g.length } }
      .sort_by { |h| h[:median_ms] }.first(10)
    first_set = finds.min_by { |_, gap, _| gap }
    drought = droughts.max_by { |d| d[:ms] }

    games = SoloGame.where("sets_found > 0 OR status = 'completed'")
    hours = games.pluck(:started_at).map { |t| t.in_time_zone(ZONE) }
    {
      generated_at: Time.current,
      total_finds: finds.length,
      total_incl_unfinished: finds.length + unfinished_counted,
      players: (games.distinct.pluck(:player_id) | SoloScore.distinct.pluck(:player_id)).length,
      runs: SoloScore.count,
      distinct_found: counts.length,
      type_counts: (1..4).to_h { |n| [n, type_counts[n]] },
      median_all: median(finds.map { |_, gap, _| gap }),
      example_by_diff: (1..4).to_h { |n| [n, example(counts) { |k| k.count(true) == n }] },
      example_by_shared: ATTRS.each_with_index.to_h { |a, i| [a, example(counts) { |k| k.each_with_index.all? { |d, j| d == (j != i) } }] },
      median_by_diff: (1..4).to_h { |n| [n, median(by_diff[n])] },
      median_by_shared: ATTRS.to_h { |a| [a, median(by_shared[a])] },
      fastest: fastest,
      most_found: counts.sort_by { |c, n| [-n, c] }.first(10).map { |c, n| { cards: c, n: n } },
      spread: spread(counts),
      fastest_find: first_set && { cards: first_set[0], ms: first_set[1] },
      drought: drought,
      busiest_day: hours.group_by(&:to_date).max_by { |_, v| v.length }&.then { |d, v| [d, v.length] },
      busiest_hour: hours.group_by(&:hour).max_by { |_, v| v.length }&.first,
      most_games: most_games,
      modes: runs.transform_values { |v| { runs: v.length, median_ms: median(v) } }
    }
  end

  private

  # How often each of the 1,080 possible sets has been found (unfound = 0):
  # the extremes with one representative each, plus a histogram of counts.
  def spread(counts)
    all = self.class.all_sets.map { |c| [c, counts.fetch(c, 0)] }
    lo, hi = all.map(&:last).minmax
    pick = ->(n) { m = all.select { |_, v| v == n }; { cards: m.first[0], n: n, tied: m.length - 1 } }
    tally = all.map(&:last).tally
    { min: pick.(lo), max: pick.(hi), hist: (lo..hi).map { |n| [n, tally.fetch(n, 0)] },
      median: median(all.map(&:last)) }
  end

  # The most-found set of a kind, so each timing row shows a familiar example.
  def example(counts)
    counts.select { |cards, _| yield self.class.kind(cards) }.max_by { |cards, n| [n, cards.map(&:-@)] }&.first
  end

  # Named players by finished runs (solo + daily), grouped by the public name
  # (one person often plays on several devices). Unnamed runs of a device count
  # toward the name that device used.
  def most_games(limit = 10)
    rows = SoloScore.order(:completed_at).pluck(:player_id, :display_name, :daily_on)
    names = {}
    rows.each { |pid, name, _| names[pid] = name.strip if name.present? }
    tally = Hash.new { |h, k| h[k] = { name: k, solo: 0, daily: 0 } }
    rows.each do |pid, _, daily|
      next unless (name = names[pid])

      entry = tally[name.downcase]
      entry[:name] = name
      entry[daily ? :daily : :solo] += 1
    end
    tally.values.map { |h| h.merge(total: h[:solo] + h[:daily]) }
      .sort_by { |h| [-h[:total], h[:name].downcase] }.first(limit)
  end

  def add_claims(events, mode, finds, droughts)
    prev = 0
    Array(events).each do |e|
      cards = e["cards"]
      t = e["t_ms"]
      next unless e["type"] == "claim" && cards.is_a?(Array) && cards.length == 3 && t.is_a?(Integer)

      gap = t - prev
      prev = t
      next if gap.negative?

      finds << [cards.sort, gap, mode]
      droughts << { ms: gap, cards: cards.sort }
    end
  end

  def median(list)
    return nil if list.empty?

    s = list.sort
    s.length.odd? ? s[s.length / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
  end
end
