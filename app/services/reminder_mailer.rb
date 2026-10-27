# frozen_string_literal: true

# The reminder email: one headline (the streak at risk, or which game is
# ready), a Play button that signs this browser in, and a one-tap
# way to turn it off. Nothing else.
module ReminderMailer
  def self.deliver(plan, streaks: nil)
    deliver_message(message(plan, streaks: streaks), plan.account.email)
  end

  def self.deliver_message(msg, to)
    ResendMail.deliver(to: to, subject: msg[:subject], html: msg[:html], text: msg[:text], headers: msg[:headers])
  end

  NAMES = { "daily" => "Daily Deal", "puzzle" => "Puzzle" }.freeze
  PATHS = { "daily" => "/", "puzzle" => "/puzzle" }.freeze

  def self.finished_runs(player_id, kind)
    kind == "daily" ? SoloScore.where(player_id: player_id).where.not(daily_on: nil).count : PuzzleRun.finished.where(player_id: player_id).count
  end

  # `streaks` stands in for the player's real ones in a test send, e.g. { "daily" => 4 }.
  def self.message(plan, base: ApplicationHelper::SITE_URL, streaks: nil)
    account = plan.account
    # The same streaks the games show: through yesterday until today's is played.
    streaks = {
      "daily" => DailyPuzzle.new(plan.deal_on).streak_for(account.player_id),
      "puzzle" => ClassicPuzzle.new(plan.deal_on).streak_for(account.player_id)
    }.merge(streaks.to_h)
    # About one unplayed game: the one this player has finished more (Daily Deal on a tie); its streak, if any.
    game = plan.kinds.max_by { |kind| [finished_runs(account.player_id, kind), kind == "daily" ? 1 : 0] } || "daily"
    streak = streaks[game]
    number = game == "daily" ? DailyPuzzle.new(plan.deal_on).number : ClassicPuzzle.new(plan.deal_on).number
    headline = streak.positive? ? "Keep your #{streak}-day streak" : "Today’s #{NAMES[game]} is ready"
    unsubscribe_url = "#{base}/reminders/unsubscribe?#{{ t: Reminder.unsubscribe_token(account) }.to_query}"
    assigns = {
      headline: headline,
      line: streak.positive? ? "Play today’s #{NAMES[game]}." : nil,
      play_url: "#{base}/play?#{{ t: Reminder.play_token(account, plan.deal_on), to: PATHS[game] }.to_query}",
      unsubscribe_url: unsubscribe_url
    }
    # The day's number makes every subject new, so mail apps never thread days together.
    subject = ["Set #{NAMES[game]} ##{number}", (streak.positive? ? "#{streak}-day streak" : nil)].compact.join(" · ")
    {
      subject: subject,
      html: ApplicationController.render(template: "reminder_mailer/reminder", formats: [:html], layout: false, assigns: assigns),
      text: ApplicationController.render(template: "reminder_mailer/reminder", formats: [:text], layout: false, assigns: assigns),
      headers: {
        "List-Unsubscribe" => "<#{unsubscribe_url}>",
        "List-Unsubscribe-Post" => "List-Unsubscribe=One-Click"
      }
    }
  end
end
