# frozen_string_literal: true

# One shared solo deal per day. Days roll over at midnight Pacific time and are
# numbered from launch: "Set Daily #1" is the first day anyone played one.
class DailyPuzzle
  TIME_ZONE = "America/Los_Angeles"
  LEADERBOARD_SIZE = 20

  attr_reader :date

  def self.today(now = Time.current)
    new(now.in_time_zone(TIME_ZONE).to_date)
  end

  # Consecutive completed days ending today, or ending yesterday while today's
  # daily is still unplayed (the streak is alive until a day is missed).
  def self.streak(dates, today:)
    played = dates.to_set
    day = played.include?(today) ? today : today - 1
    count = 0
    while played.include?(day)
      count += 1
      day -= 1
    end
    count
  end

  def self.seed_key
    @seed_key ||= Rails.application.key_generator.generate_key("setgame daily seed", 32)
  end

  def initialize(date)
    @date = date
  end

  # Deterministic per date, but derived from the app's secret so tomorrow's
  # deal can't be computed from the public source code. Once someone has
  # played, the stored seed wins, so rotating the secret mid-day can't hand
  # later players a different deal.
  def seed
    @seed ||= SoloGame.where(daily_on: date).pick(:seed)&.to_i || derived_seed
  end

  def number
    @number ||= begin
      launch = SoloGame.where.not(daily_on: nil).minimum(:daily_on) || date
      (date - [launch, date].min).to_i + 1
    end
  end

  def next_at
    (date + 1).in_time_zone(TIME_ZONE)
  end

  def attempted?(player_id)
    SoloGame.exists?(player_id: player_id, daily_on: date)
  end

  # Returns the player's ranked game, or nil when today's attempt is used up.
  def start_ranked_game(player_id)
    return nil if attempted?(player_id)

    SoloGame.create!(
      id: SecureRandom.uuid,
      player_id: player_id,
      seed: seed.to_s,
      rules_version: SoloGame::RULES_VERSION,
      status: "open",
      started_at: Time.current,
      daily_on: date
    )
  rescue ActiveRecord::RecordNotUnique
    nil
  end

  def leaderboard(limit: LEADERBOARD_SIZE)
    SoloScore.daily_leaderboard(date: date, limit: limit)
  end

  def total
    SoloScore.where(daily_on: date).count
  end

  def score_for(player_id)
    SoloScore.find_by(player_id: player_id, daily_on: date)
  end

  def rank_of(score)
    SoloScore.where(daily_on: date)
      .where("elapsed_ms < :ms OR (elapsed_ms = :ms AND completed_at < :at)", ms: score.elapsed_ms, at: score.completed_at)
      .count + 1
  end

  def streak_for(player_id)
    self.class.streak(SoloScore.where(player_id: player_id).where.not(daily_on: nil).pluck(:daily_on), today: date)
  end

  private

  def derived_seed
    OpenSSL::HMAC.digest("SHA256", self.class.seed_key, "daily:#{date.iso8601}").unpack1("N")
  end
end
