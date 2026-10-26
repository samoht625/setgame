# frozen_string_literal: true

# Opt-in reminder emails.
#
# Send rule: once a day, at the account's chosen local time, look at the
# current deal day (Pacific, like the games). Finished both the Daily Deal
# and the Puzzle: skip. Finished one: the email is about the other. Neither:
# it's about the Daily Deal and mentions the Puzzle. At most one reminder per
# account per local day and per deal day; a run that's late (the NUC was down)
# still sends up to CATCH_UP after the chosen time, never later.
module Reminder
  # Half-hourly choices, minutes after local midnight.
  TIMES = (0...48).map { |i| i * 30 }.freeze
  DEFAULT_MINUTES = 480
  CATCH_UP = 3.hours
  # Resend allows a few requests a second; stay well under it.
  SEND_INTERVAL = 0.6

  Plan = Struct.new(:account, :local_on, :deal_on, :kinds, keyword_init: true)

  def self.label(minutes)
    hour, minute = minutes.to_i.divmod(60)
    format("%d:%02d %s", ((hour - 1) % 12) + 1, minute, hour < 12 ? "AM" : "PM")
  end

  def self.valid_minutes(value)
    minutes = Integer(value, exception: false)
    minutes if minutes && TIMES.include?(minutes)
  end

  # The account's reminder for `now`, or nil when it isn't due: not yet the
  # chosen time today, past the catch-up window, or already decided today.
  def self.due(account, now: Time.current)
    local = now.in_time_zone(account.zone)
    chosen = local.beginning_of_day + account.reminder_minutes.minutes
    return nil unless local >= chosen && local < chosen + CATCH_UP

    deal_on = DailyPuzzle.today(now).date
    existing = account.reminder_deliveries.where(local_on: local.to_date).or(account.reminder_deliveries.where(deal_on: deal_on))
    return nil if existing.where.not(status: "failed").exists? || existing.where("attempts >= ?", ReminderDelivery::MAX_ATTEMPTS).exists?

    Plan.new(account: account, local_on: local.to_date, deal_on: deal_on, kinds: remaining(account.player_id, deal_on))
  end

  # What's left to play on the deal day: %w[daily puzzle], one of them, or [].
  def self.remaining(player_id, deal_on)
    kinds = []
    kinds << "daily" unless SoloScore.exists?(player_id: player_id, daily_on: deal_on)
    kinds << "puzzle" unless PuzzleRun.finished.exists?(player_id: player_id, puzzle_on: deal_on)
    kinds
  end

  # Sends every due reminder. Safe to run as often as you like, and from
  # overlapping processes: a reminder is claimed by inserting its row before
  # anything is sent.
  def self.run!(now: Time.current, logger: Rails.logger, pause: SEND_INTERVAL)
    counts = Hash.new(0)
    Account.with_reminder.find_each do |account|
      plan = due(account, now: now)
      next unless plan

      outcome = deliver(plan, logger: logger)
      counts[outcome] += 1
      sleep(pause) if outcome == :sent && pause.positive?
    end
    counts
  end

  # Claims the day, then sends or skips. Returns :sent, :skipped, :failed or :taken.
  def self.deliver(plan, logger: Rails.logger)
    delivery = claim(plan)
    return :taken unless delivery

    if plan.kinds.empty?
      delivery.update!(status: "skipped", kinds: "")
      logger.info("[Reminder] skipped account=#{plan.account.id} deal=#{plan.deal_on} (both finished)")
      return :skipped
    end

    result = ReminderMailer.deliver(plan)
    if result.ok?
      delivery.update!(status: "sent", kinds: plan.kinds.join(","), resend_id: result.id, error: nil)
      logger.info("[Reminder] sent account=#{plan.account.id} deal=#{plan.deal_on} kinds=#{plan.kinds.join(',')} resend_id=#{result.id}")
      :sent
    else
      delivery.update!(status: "failed", kinds: plan.kinds.join(","), error: result.error.to_s.first(300))
      logger.warn("[Reminder] failed account=#{plan.account.id} deal=#{plan.deal_on} attempt=#{delivery.attempts}: #{result.error.to_s.first(200)}")
      :failed
    end
  end

  # A one-off send outside the schedule (testing): records nothing, so the
  # day's scheduled reminder still happens. Returns ResendMail::Result.
  def self.send_test!(account, now: Time.current, logger: Rails.logger)
    deal_on = DailyPuzzle.today(now).date
    kinds = remaining(account.player_id, deal_on).presence || %w[daily puzzle]
    plan = Plan.new(account: account, local_on: now.in_time_zone(account.zone).to_date, deal_on: deal_on, kinds: kinds)
    result = ReminderMailer.deliver(plan)
    logger.info("[Reminder] test send account=#{account.id} deal=#{deal_on} kinds=#{kinds.join(',')} ok=#{result.ok?} resend_id=#{result.id}")
    result
  end

  # The day's row, newly made or a failed one retried, marked sending. Nil
  # when another run already has it.
  def self.claim(plan)
    ReminderDelivery.create!(account: plan.account, local_on: plan.local_on, deal_on: plan.deal_on, status: "sending", attempts: 1)
  rescue ActiveRecord::RecordNotUnique
    retried = ReminderDelivery.where(account: plan.account, local_on: plan.local_on, deal_on: plan.deal_on, status: "failed")
      .where("attempts < ?", ReminderDelivery::MAX_ATTEMPTS)
      .update_all(["status = 'sending', attempts = attempts + 1, updated_at = ?", Time.current])
    retried == 1 ? ReminderDelivery.find_by!(account: plan.account, local_on: plan.local_on) : nil
  end

  # Signed links. Play signs the browser in for a couple of days; unsubscribe never expires.
  def self.play_token(account, deal_on)
    verifier(:play).generate([account.id, deal_on.iso8601], expires_in: 2.days)
  end

  def self.unsubscribe_token(account)
    verifier(:unsubscribe).generate(account.id)
  end

  def self.account_for(purpose, token)
    payload = verifier(purpose).verified(token.to_s)
    id = purpose == :play ? Array(payload).first : payload
    id && Account.find_by(id: id)
  rescue ActiveSupport::MessageVerifier::InvalidSignature, ArgumentError
    nil
  end

  def self.verifier(purpose)
    Rails.application.message_verifier("setgame reminder #{purpose}")
  end
end
