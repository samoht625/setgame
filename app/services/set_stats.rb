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
    Rails.cache.fetch("set_stats/v1", expires_in: 5.minutes) { new.compute }
  end

  def self.kind(cards)
    attrs = cards.map { |c| Rules.card_attributes(c) }
    ATTRS.map { |a| attrs.map { |h| h[a.to_sym] }.uniq.length == 3 }
  end

  def compute
    finds = []  # [cards, gap_ms, mode]
    runs = { "solo" => [], "daily" => [] }
    droughts = []

    SoloScore.select(:events, :elapsed_ms, :daily_on).find_each do |s|
      mode = s.daily_on ? "daily" : "solo"
      runs[mode] << s.elapsed_ms
      add_claims(s.events, mode, finds, droughts)
    end
    unfinished_counted = 0
    SoloGame.where.not(status: "completed").select(:events, :sets_found, :daily_on).find_each do |g|
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

    games = SoloGame.where("sets_found > 0")
    hours = games.pluck(:started_at).map { |t| t.in_time_zone(ZONE) }
    {
      generated_at: Time.current,
      total_finds: finds.length,
      total_incl_unfinished: finds.length + unfinished_counted,
      players: games.distinct.count(:player_id),
      runs: SoloScore.count,
      distinct_found: counts.length,
      type_counts: (1..4).to_h { |n| [n, type_counts[n]] },
      median_by_diff: (1..4).to_h { |n| [n, median(by_diff[n])] },
      median_by_shared: ATTRS.to_h { |a| [a, median(by_shared[a])] },
      fastest: fastest,
      most_found: counts.sort_by { |c, n| [-n, c] }.first(10).map { |c, n| { cards: c, n: n } },
      rarest: counts.select { |_, n| n == counts.values.min }.keys.min,
      rarest_n: counts.values.min,
      once_count: counts.count { |_, n| n == 1 },
      fastest_find: first_set && { cards: first_set[0], ms: first_set[1] },
      drought: drought,
      busiest_day: hours.group_by(&:to_date).max_by { |_, v| v.length }&.then { |d, v| [d, v.length] },
      busiest_hour: hours.group_by(&:hour).max_by { |_, v| v.length }&.first,
      modes: runs.transform_values { |v| { runs: v.length, median_ms: median(v) } }
    }
  end

  private

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
