# frozen_string_literal: true

# Aggregate, anonymous stats over every found set: finished runs (solo_scores)
# plus unfinished games that saved their claims (solo_games.events).
class SetStats
  ATTRS = %w[number color shape shading].freeze
  CHANCE = { 1 => 10, 2 => 30, 3 => 40, 4 => 20 }.freeze
  TOTAL_SETS = 1080
  MIN_SAMPLE = 5
  # Days and hours are counted where the dailies roll over, so a day here is
  # the same day as that day's Puzzle and Daily Deal.
  ZONE = DailyPuzzle::TIME_ZONE
  # A gap this long between finds is a tab left open, not someone looking:
  # it still counts as a find, but not toward any timing.
  IDLE_MS = 5 * 60 * 1000
  CHART_DAYS = 90

  CACHE_KEY = "set_stats/v12"
  CACHE_FOR = 5.minutes

  # Precomputed [number, color, shape, shading] for card ids 1..81 (indexed by id - 1).
  CARD_ATTRS = Array.new(81) do |i|
    [i % 3, (i / 3) % 3, (i / 9) % 3, (i / 27) % 3].freeze
  end.freeze
  private_constant :CARD_ATTRS

  # At most CACHE_FOR old, and never a day behind: the per-day chart ends on
  # today, so numbers worked out before midnight are worked out again after it.
  def self.cached
    stats = Rails.cache.fetch(CACHE_KEY, expires_in: CACHE_FOR, race_condition_ttl: 30.seconds) { new.compute }
    return stats if stats[:activity_by_day].last[:date] == DailyPuzzle.today.date

    new.compute.tap { |fresh| Rails.cache.write(CACHE_KEY, fresh, expires_in: CACHE_FOR) }
  end

  def self.all_sets
    @all_sets ||= (1..81).to_a.combination(3).select { |a, b, c| Rules.is_set?(a, b, c) }.freeze
  end

  def self.kind(cards)
    a = CARD_ATTRS[cards[0] - 1]
    b = CARD_ATTRS[cards[1] - 1]
    c = CARD_ATTRS[cards[2] - 1]
    [
      a[0] != b[0] && b[0] != c[0] && a[0] != c[0],
      a[1] != b[1] && b[1] != c[1] && a[1] != c[1],
      a[2] != b[2] && b[2] != c[2] && a[2] != c[2],
      a[3] != b[3] && b[3] != c[3] && a[3] != c[3]
    ]
  end

  def compute
    finds = []  # [cards, gap_ms, mode]
    runs = { "solo" => [], "daily" => [] }

    SoloScore.select(:id, :events, :elapsed_ms, :daily_on).find_each do |s|
      mode = s.daily_on ? "daily" : "solo"
      runs[mode] << s.elapsed_ms
      add_claims(s.events, mode, finds)
    end
    unfinished_counted = 0
    SoloGame.where.not(status: "completed").select(:id, :events, :sets_found, :daily_on).find_each do |g|
      claims = Array(g.events)
      if claims.any?
        add_claims(claims, g.daily_on ? "daily" : "solo", finds)
      else
        unfinished_counted += g.sets_found.to_i
      end
    end

    counts = Hash.new(0)
    by_triple = Hash.new { |h, k| h[k] = [] }
    type_counts = Hash.new(0)
    by_kind = Hash.new { |h, k| h[k] = [] }
    first_set = nil

    finds.each do |cards, gap, _|
      counts[cards] += 1
      k = self.class.kind(cards)
      type_counts[k.count(true)] += 1
      next if gap > IDLE_MS

      by_triple[cards] << gap
      by_kind[k] << gap
      first_set = [cards, gap] if first_set.nil? || gap < first_set[1]
    end

    fastest = by_triple.select { |_, g| g.length >= MIN_SAMPLE }
      .map { |c, g| { cards: c, median_ms: median(g), n: g.length } }
      .sort_by { |h| h[:median_ms] }.first(10)

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
      kinds: kinds(by_kind, counts.keys),
      fastest: fastest,
      most_found: counts.sort_by { |c, n| [-n, c] }.first(10).map { |c, n| { cards: c, n: n } },
      spread: spread(counts),
      fastest_find: first_set && { cards: first_set[0], ms: first_set[1] },
      busiest_day: hours.group_by(&:to_date).max_by { |_, v| v.length }&.then { |d, v| [d, v.length] },
      busiest_hour: hours.group_by(&:hour).max_by { |_, v| v.length }&.first,
      most_games: most_games,
      activity_by_day: activity_by_day,
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
      median: median(all.map(&:last)),
      least: all.sort_by { |c, n| [n, c] }.first(10).map { |c, n| { cards: c, n: n } } }
  end

  # The 15 kinds of set (which of the four attributes are all different),
  # easiest first: median and middle 50% of find times, plus one random
  # found set of that kind to draw.
  def kinds(by_kind, found)
    examples = found.group_by { |c| self.class.kind(c) }
    by_kind.map do |k, gaps|
      s = gaps.sort
      { label: kind_label(k), n: s.length, median_ms: quantile(s, 0.5), p25_ms: quantile(s, 0.25),
        p75_ms: quantile(s, 0.75), cards: examples.fetch(k, []).sample }
    end.sort_by { |h| h[:median_ms] }
  end

  def kind_label(k)
    diff = ATTRS.select.with_index { |_, i| k[i] }
    case diff.length
    when 4 then "all four"
    when 3 then "all but #{(ATTRS - diff).first}"
    else diff.join(" + ")
    end
  end

  # Linear interpolation between closest ranks (same as numpy/pandas).
  def quantile(sorted, q)
    pos = (sorted.length - 1) * q
    lo = sorted[pos.floor]
    lo + (sorted[pos.ceil] - lo) * (pos - pos.floor)
  end

  # Named players by finished runs (solo + daily), grouped by the public name
  # (one person often plays on several devices). Unnamed runs of a device count
  # toward the name that device used. Each also gets their fastest Daily Deal
  # and fastest finished Puzzle (a device with no named run goes by the name on
  # its Puzzle run).
  def most_games(limit = 10)
    score_rows = ApplicationRecord.connection.select_rows(<<~SQL)
      WITH latest_names AS (
        SELECT player_id, TRIM(display_name) AS name,
               ROW_NUMBER() OVER (PARTITION BY player_id ORDER BY completed_at DESC, id DESC) AS rn
        FROM solo_scores
        WHERE display_name IS NOT NULL AND TRIM(display_name) != ''
      )
      SELECT
        s.player_id,
        ln.name,
        SUM(CASE WHEN s.daily_on IS NULL THEN 1 ELSE 0 END) AS solo_count,
        SUM(CASE WHEN s.daily_on IS NOT NULL THEN 1 ELSE 0 END) AS daily_count,
        MIN(CASE WHEN s.daily_on IS NOT NULL THEN s.elapsed_ms END) AS best_daily_ms
      FROM solo_scores s
      INNER JOIN latest_names ln ON ln.player_id = s.player_id AND ln.rn = 1
      GROUP BY s.player_id, ln.name
      ORDER BY MAX(s.completed_at) ASC
    SQL

    names = {}
    tally = Hash.new { |h, k| h[k] = { name: k, solo: 0, daily: 0, best_daily_ms: nil, best_puzzle_ms: nil } }
    score_rows.each do |pid, raw_name, solo_count, daily_count, best_daily_ms|
      name = raw_name.to_s.strip
      next if name.empty?

      names[pid] = name
      entry = tally[name.downcase]
      entry[:name] = name
      entry[:solo] += solo_count.to_i
      entry[:daily] += daily_count.to_i
      entry[:best_daily_ms] = [entry[:best_daily_ms], best_daily_ms.to_i].compact.min if best_daily_ms
    end
    return [] if tally.empty?

    PuzzleRun.finished.where.not(elapsed_ms: nil)
      .group(:player_id, :display_name)
      .pluck(:player_id, :display_name, Arel.sql("MIN(elapsed_ms)"))
      .each do |pid, name, ms|
        key = (names[pid] || name.presence)&.strip&.downcase
        next unless key && tally.key?(key)

        tally[key][:best_puzzle_ms] = [tally[key][:best_puzzle_ms], ms].compact.min
      end
    tally.values.map { |h| h.merge(total: h[:solo] + h[:daily]) }
      .sort_by { |h| [-h[:total], h[:name].downcase] }.first(limit)
  end

  # Finished runs and distinct players (as the players tile counts them) for
  # each of the last CHART_DAYS days, oldest first, with empty days kept so the
  # bars stay evenly spaced in time.
  def activity_by_day
    today = DailyPuzzle.today.date
    start = today - (CHART_DAYS - 1)
    from = start.in_time_zone(ZONE)
    games = Hash.new(0)
    players = Hash.new { |h, k| h[k] = Set.new }
    SoloScore.where(completed_at: from..).pluck(:completed_at, :player_id).each do |t, pid|
      day = t.in_time_zone(ZONE).to_date
      games[day] += 1
      players[day] << pid
    end
    SoloGame.where(started_at: from..).where("sets_found > 0 OR status = 'completed'").pluck(:started_at, :player_id).each do |t, pid|
      players[t.in_time_zone(ZONE).to_date] << pid
    end
    (start..today).map { |d| { date: d, games: games[d], players: players.fetch(d, Set.new).size } }
  end

  def add_claims(events, mode, finds)
    prev = 0
    Array(events).each do |e|
      cards = e["cards"]
      t = e["t_ms"]
      next unless e["type"] == "claim" && cards.is_a?(Array) && cards.length == 3 && t.is_a?(Integer)

      gap = t - prev
      prev = t
      next if gap.negative?

      finds << [cards.sort, gap, mode]
    end
  end

  def median(list)
    return nil if list.empty?

    s = list.sort
    s.length.odd? ? s[s.length / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
  end
end
