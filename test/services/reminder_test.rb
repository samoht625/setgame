# frozen_string_literal: true

require "test_helper"
require "minitest/mock"

class ReminderTest < ActiveSupport::TestCase
  # 8:00 AM in Los Angeles on Oct 20 (15:00 UTC).
  LA_8AM = Time.utc(2026, 10, 20, 15)

  setup do
    ResendMail.deliveries.clear
    # Turned on well before the days these tests send on.
    @account = travel_to(LA_8AM - 30.days) do
      Account.create!(email: "rose@example.com", player_id: SecureRandom.uuid, time_zone: "America/Los_Angeles",
                      reminder_enabled: true, reminder_minutes: 480)
    end
  end

  test "labels and times" do
    assert_equal "8:00 AM", Reminder.label(480)
    assert_equal "12:30 PM", Reminder.label(750)
    assert_equal "12:00 AM", Reminder.label(0)
    assert_equal 48, Reminder::TIMES.length
    assert_nil Reminder.valid_minutes(485)
  end

  test "neither played: one email about the Daily Deal that mentions the Puzzle" do
    counts = Reminder.run!(now: LA_8AM, pause: 0)
    assert_equal({ sent: 1 }, counts.to_h.symbolize_keys)
    mail = ResendMail.deliveries.sole
    assert_equal "Set Daily Deal ##{DailyPuzzle.new(Date.new(2026, 10, 20)).number}", mail[:subject]
    assert_match "The Puzzle is waiting too.", mail[:text]
    assert_match %r{/play\?}, mail[:text]
    assert_match %r{\A<https://set\.tido\.site/reminders/unsubscribe\?t=.+>\z}, mail[:headers]["List-Unsubscribe"]
    assert_equal "List-Unsubscribe=One-Click", mail[:headers]["List-Unsubscribe-Post"]
    refute_match(/free/i, mail[:html])
    delivery = ReminderDelivery.sole
    assert_equal ["sent", Date.new(2026, 10, 20), Date.new(2026, 10, 20), "daily,puzzle"], [delivery.status, delivery.local_on, delivery.deal_on, delivery.kinds]
  end

  test "finished only the Daily Deal: the email is about the Puzzle, with its streak" do
    travel_to LA_8AM do
      finish_daily(Date.new(2026, 10, 20))
      finish_puzzle(Date.new(2026, 10, 18))
      finish_puzzle(Date.new(2026, 10, 19))
    end
    Reminder.run!(now: LA_8AM, pause: 0)
    mail = ResendMail.deliveries.sole
    assert_equal "Keep your 2-day Puzzle streak", mail[:subject]
    assert_match "Keep your 2-day streak\nPlay today’s Puzzle to keep it.", mail[:text]
    assert_match "Puzzle ##{ClassicPuzzle.new(Date.new(2026, 10, 20)).number} is still waiting.", mail[:text]
    refute_match "waiting too", mail[:text]
    assert_match "to=%2Fpuzzle", mail[:text]
  end

  test "finished only the Puzzle: the email is about the Daily Deal, with its streak" do
    travel_to LA_8AM do
      finish_puzzle(Date.new(2026, 10, 20))
      finish_daily(Date.new(2026, 10, 19))
    end
    Reminder.run!(now: LA_8AM, pause: 0)
    mail = ResendMail.deliveries.sole
    assert_equal "Keep your 1-day Daily Deal streak", mail[:subject]
    assert_match "Keep your 1-day streak", mail[:html]
    assert_match "Play today’s Daily Deal to keep it.", mail[:html]
  end

  test "finished both: skipped, and decided for the day" do
    travel_to LA_8AM do
      finish_daily(Date.new(2026, 10, 20))
      finish_puzzle(Date.new(2026, 10, 20))
    end
    assert_equal({ skipped: 1 }, Reminder.run!(now: LA_8AM, pause: 0).to_h.symbolize_keys)
    assert_empty ResendMail.deliveries
    assert_equal "skipped", ReminderDelivery.sole.status
    assert_empty Reminder.run!(now: LA_8AM + 30.minutes, pause: 0)
  end

  test "only at the chosen time, with a catch-up window" do
    assert_empty Reminder.run!(now: LA_8AM - 1.minute, pause: 0)
    assert_empty Reminder.run!(now: LA_8AM + Reminder::CATCH_UP, pause: 0), "too late to be useful"
    assert_equal 1, Reminder.run!(now: LA_8AM + 2.hours, pause: 0)[:sent], "the NUC was down at 8: still sent at 10"
  end

  test "never twice a day, across runs and restarts" do
    Reminder.run!(now: LA_8AM, pause: 0)
    Reminder.run!(now: LA_8AM + 5.minutes, pause: 0)
    Reminder.run!(now: LA_8AM + 2.hours, pause: 0)
    assert_equal 1, ResendMail.deliveries.length
    plan = Reminder.due(@account, now: LA_8AM)
    assert_nil plan

    # Two overlapping runs racing for the same day: only one claim wins.
    other = Reminder::Plan.new(account: @account, local_on: Date.new(2026, 10, 20), deal_on: Date.new(2026, 10, 20), kinds: %w[daily])
    assert_equal :taken, Reminder.deliver(other)
    assert_equal 1, ResendMail.deliveries.length

    # Next day, again.
    Reminder.run!(now: LA_8AM + 1.day, pause: 0)
    assert_equal 2, ResendMail.deliveries.length
  end

  test "a refused send is retried on the next runs, a few times at most" do
    failing = ResendMail::Result.new(ok: false, status: 429, error: "rate limited")
    ReminderMailer.stub(:deliver, failing) do
      Reminder.run!(now: LA_8AM, pause: 0)
      Reminder.run!(now: LA_8AM + 5.minutes, pause: 0)
    end
    assert_equal ["failed", 2], ReminderDelivery.sole.slice(:status, :attempts).values
    Reminder.run!(now: LA_8AM + 10.minutes, pause: 0)
    assert_equal ["sent", 3], ReminderDelivery.sole.slice(:status, :attempts).values
    assert_equal 1, ResendMail.deliveries.length

    ReminderDelivery.sole.update!(status: "failed")
    assert_empty Reminder.run!(now: LA_8AM + 15.minutes, pause: 0), "gives up after #{ReminderDelivery::MAX_ATTEMPTS} attempts"
  end

  test "time zones: 8 AM in Paris is still the previous Pacific deal day" do
    @account.update!(time_zone: "Europe/Paris")
    paris_8am = Time.utc(2026, 10, 21, 6) # 8:00 Paris (CEST) = 23:00 Oct 20 Pacific
    assert_empty Reminder.run!(now: paris_8am - 1.minute, pause: 0)
    Reminder.run!(now: paris_8am, pause: 0)
    delivery = ReminderDelivery.sole
    assert_equal [Date.new(2026, 10, 21), Date.new(2026, 10, 20)], [delivery.local_on, delivery.deal_on]
    assert_match "##{DailyPuzzle.new(Date.new(2026, 10, 20)).number}", ResendMail.deliveries.sole[:subject]

    # Tokyo at 8 AM is the afternoon before in Los Angeles.
    tokyo = travel_to(LA_8AM - 1.day) { Account.create!(email: "t@example.com", player_id: SecureRandom.uuid, time_zone: "Asia/Tokyo", reminder_enabled: true, reminder_minutes: 480) }
    plan = Reminder.due(tokyo, now: Time.utc(2026, 10, 20, 23))
    assert_equal [Date.new(2026, 10, 21), Date.new(2026, 10, 20)], [plan.local_on, plan.deal_on]

    # No zone saved: Pacific.
    @account.update!(time_zone: nil)
    assert_equal ActiveSupport::TimeZone["America/Los_Angeles"], @account.zone
  end

  test "streaks in both games, neither played today: both lead, in the subject and the body" do
    travel_to LA_8AM do
      finish_daily(Date.new(2026, 10, 18)); finish_daily(Date.new(2026, 10, 19))
      finish_puzzle(Date.new(2026, 10, 19))
    end
    Reminder.run!(now: LA_8AM, pause: 0)
    mail = ResendMail.deliveries.sole
    assert_equal "Keep your 2-day Daily Deal and 1-day Puzzle streaks", mail[:subject]
    assert_match "Keep your streaks\n2-day Daily Deal · 1-day Puzzle\nPlay both today to keep them.", mail[:text]
  end

  test "one game played today: its streak is safe, the other's leads" do
    travel_to LA_8AM do
      finish_daily(Date.new(2026, 10, 19)); finish_daily(Date.new(2026, 10, 20))
      finish_puzzle(Date.new(2026, 10, 19))
    end
    Reminder.run!(now: LA_8AM, pause: 0)
    mail = ResendMail.deliveries.sole
    assert_equal "Keep your 1-day Puzzle streak", mail[:subject]
    assert_match "Daily Deal streak: 2 days, done today.", mail[:text]
  end

  test "no streak: the plain subject and copy" do
    Reminder.run!(now: LA_8AM, pause: 0)
    mail = ResendMail.deliveries.sole
    assert_match(/\ASet Daily Deal #\d+\z/, mail[:subject])
    refute_match "streak", mail[:text]
  end

  test "the email says plainly how to turn it off, right under Play" do
    Reminder.run!(now: LA_8AM, pause: 0)
    mail = ResendMail.deliveries.sole
    unsubscribe = mail[:headers]["List-Unsubscribe"][1..-2]
    assert_includes mail[:html], %(Don’t want these? <a href="#{ERB::Util.html_escape(unsubscribe)}")
    assert_includes mail[:html], "Turn off daily emails</a>"
    assert_includes mail[:text], "Don't want these? Turn off daily emails: #{unsubscribe}"
    assert_operator mail[:html].index("Turn off daily emails"), :>, mail[:html].index(">Play</a>")
  end

  test "turned on after today's time: nothing until tomorrow's, no catch-up" do
    late = Account.create!(email: "late@example.com", player_id: SecureRandom.uuid, time_zone: "America/Los_Angeles")
    travel_to(LA_8AM + 1.hour) { late.update!(reminder_enabled: true, reminder_minutes: 480) }
    assert_nil Reminder.due(late, now: LA_8AM + 1.hour + 5.minutes)
    assert_nil Reminder.due(late, now: LA_8AM + 2.hours)
    assert_equal LA_8AM + 1.day, Reminder.next_at(late, now: LA_8AM + 1.hour)
    assert Reminder.due(late, now: LA_8AM + 1.day)

    # Moving the time later today still sends today.
    travel_to(LA_8AM + 1.hour) { late.update!(reminder_minutes: 20 * 60) }
    assert Reminder.due(late, now: LA_8AM + 12.hours)
    assert_equal LA_8AM + 12.hours, Reminder.next_at(late, now: LA_8AM + 1.hour)
  end

  test "accounts with the reminder off get nothing" do
    @account.update!(reminder_enabled: false)
    assert_empty Reminder.run!(now: LA_8AM, pause: 0)
  end

  test "a test send goes out without using up the day" do
    assert Reminder.send_test!(@account, now: LA_8AM - 2.hours).ok?
    assert_equal 1, ResendMail.deliveries.length
    assert_empty ReminderDelivery.all
    Reminder.run!(now: LA_8AM, pause: 0)
    assert_equal 2, ResendMail.deliveries.length
  end

  test "play and unsubscribe tokens are signed and scoped to their purpose" do
    play = Reminder.play_token(@account, Date.new(2026, 10, 20))
    unsub = Reminder.unsubscribe_token(@account)
    assert_equal @account, Reminder.account_for(:play, play)
    assert_equal @account, Reminder.account_for(:unsubscribe, unsub)
    assert_nil Reminder.account_for(:unsubscribe, play)
    assert_nil Reminder.account_for(:play, unsub)
    assert_nil Reminder.account_for(:play, "garbage")
    travel 3.days do
      assert_nil Reminder.account_for(:play, play), "play links expire"
      assert_equal @account, Reminder.account_for(:unsubscribe, unsub), "unsubscribe links don't"
    end
  end

  private

  def finish_daily(date)
    game = SoloGame.create!(id: SecureRandom.uuid, player_id: @account.player_id, seed: "1", status: "completed", started_at: Time.current, completed_at: Time.current, daily_on: date)
    SoloScore.create!(solo_game: game, player_id: @account.player_id, elapsed_ms: 90_000, completed_at: Time.current, daily_on: date)
  end

  def finish_puzzle(date)
    PuzzleRun.create!(id: SecureRandom.uuid, player_id: @account.player_id, puzzle_on: date, cards: ClassicPuzzle.new(date).cards,
                      started_at: Time.current, completed_at: Time.current, elapsed_ms: 40_000)
  end
end
