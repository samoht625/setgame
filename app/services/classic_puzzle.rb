# frozen_string_literal: true

# The daily classic Set puzzle: 12 cards holding exactly 6 sets, find them all.
# Everyone gets the same board each day. Days roll over at midnight Pacific,
# like the Daily Deal, and are numbered from launch.
class ClassicPuzzle
  TIME_ZONE = DailyPuzzle::TIME_ZONE
  LAUNCH_DATE = Date.new(2026, 10, 25)
  CARD_COUNT = 12
  SET_COUNT = 6
  LEADERBOARD_SIZE = 20
  # Clock slack between the browser's timer (started once the cards paint)
  # and the server's start time.
  CLOCK_SLACK_MS = 10_000

  attr_reader :date

  def self.today(now = Time.current)
    new(now.in_time_zone(TIME_ZONE).to_date)
  end

  def self.seed_key
    @seed_key ||= Rails.application.key_generator.generate_key("setgame classic puzzle seed", 32)
  end

  # Every set among the cards, each as its sorted card ids.
  def self.sets_in(cards)
    cards = cards.to_a
    found = []
    cards.combination(2) do |a, b|
      third = Rules.third_card(a, b)
      next unless third && third > a && third > b && cards.include?(third)

      found << [a, b, third].sort
    end
    found.uniq.sort
  end

  # Deterministic for a seed: deal 12 random cards until exactly 6 sets show.
  def self.generate(seed)
    rng = Random.new(seed)
    deck = (1..81).to_a
    100_000.times do
      board = deck.sample(CARD_COUNT, random: rng)
      return board if sets_in(board).length == SET_COUNT
    end
    raise "no #{SET_COUNT}-set board found for seed #{seed}"
  end

  def initialize(date)
    @date = date
  end

  def number
    [(date - LAUNCH_DATE).to_i + 1, 1].max
  end

  def next_at
    (date + 1).in_time_zone(TIME_ZONE)
  end

  # Once anyone has played, the stored board wins, so rotating the app secret
  # mid-day can't hand later players different cards.
  def cards
    @cards ||= PuzzleRun.where(puzzle_on: date).pick(:cards).presence || self.class.generate(derived_seed)
  end

  def sets
    @sets ||= self.class.sets_in(cards)
  end

  def set?(triple)
    sets.include?(Array(triple).map(&:to_i).sort)
  end

  def run_for(player_id)
    PuzzleRun.find_by(player_id: player_id, puzzle_on: date)
  end

  # The player's run for the day, started now if they haven't one yet.
  def start_run(player_id)
    run_for(player_id) || PuzzleRun.create!(
      id: SecureRandom.uuid,
      player_id: player_id,
      puzzle_on: date,
      cards: cards,
      started_at: Time.current
    )
  rescue ActiveRecord::RecordNotUnique
    run_for(player_id)
  end

  # Keeps the found sets that are real, new and in time order.
  def valid_claims(raw)
    seen = []
    last_t = -1
    Array(raw).first(SET_COUNT * 2).filter_map do |claim|
      claim = claim.to_unsafe_h if claim.respond_to?(:to_unsafe_h)
      next unless claim.is_a?(Hash)

      triple = Array(claim["cards"] || claim[:cards]).map { |c| Integer(c, exception: false) }
      t_ms = Integer(claim["t_ms"] || claim[:t_ms], exception: false)
      next unless triple.length == 3 && triple.all? && t_ms && t_ms >= last_t

      triple.sort!
      next if seen.include?(triple) || !set?(triple)

      seen << triple
      last_t = t_ms
      { "cards" => triple, "t_ms" => t_ms }
    end
  end

  def record_progress!(run, raw_claims)
    return if run.finished?

    claims = valid_claims(raw_claims)
    run.update!(claims: claims) if claims.length > run.found.length
  end

  # Verifies a finished run: all six sets found, a time no shorter than the last
  # find and no longer than the server has seen the run open.
  def finish!(run, elapsed_ms:, claims:, misses:, display_name:, attempts: nil)
    return :already_finished if run.finished?

    claims = valid_claims(claims)
    return :incomplete unless claims.length == SET_COUNT

    elapsed = Integer(elapsed_ms, exception: false)
    max_ms = ((Time.current - run.started_at) * 1000).to_i + CLOCK_SLACK_MS
    return :invalid_time unless elapsed && elapsed.positive? && elapsed >= claims.last["t_ms"] && elapsed <= max_ms

    misses = Integer(misses, exception: false).to_i.clamp(0, 9_999)
    # Hits and misses in order ("hmhh…"), kept only when it agrees with the run.
    attempts = attempts.to_s
    attempts = nil unless attempts.match?(/\A[hm]{0,60}\z/) && attempts.count("h") == SET_COUNT && attempts.count("m") == misses
    run.update!(
      claims: claims,
      elapsed_ms: elapsed,
      misses: misses,
      attempts: attempts,
      completed_at: Time.current,
      display_name: PlayerName.sanitize(display_name) || run.display_name
    )
    :ok
  end

  def leaderboard(limit: LEADERBOARD_SIZE)
    finished_runs.order(:elapsed_ms, :completed_at).limit(limit)
  end

  def total
    finished_runs.count
  end

  def rank_of(run)
    finished_runs.where("elapsed_ms < ? OR (elapsed_ms = ? AND completed_at < ?)", run.elapsed_ms, run.elapsed_ms, run.completed_at).count + 1
  end

  def streak_for(player_id)
    DailyPuzzle.streak(PuzzleRun.finished.where(player_id: player_id).pluck(:puzzle_on), today: date)
  end

  private

  def finished_runs
    PuzzleRun.finished.where(puzzle_on: date)
  end

  def derived_seed
    OpenSSL::HMAC.digest("SHA256", self.class.seed_key, "puzzle:#{date.iso8601}").unpack1("N")
  end
end
