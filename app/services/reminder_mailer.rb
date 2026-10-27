# frozen_string_literal: true

# The reminder email: one headline (the longest streak at risk, or which
# game is ready), a Play button that signs this browser in, and a one-tap
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

  # `streaks` stands in for the player's real ones in a test send, e.g. { "daily" => 4 }.
  def self.message(plan, base: ApplicationHelper::SITE_URL, streaks: nil)
    account = plan.account
    # The same streaks the games show: through yesterday until today's is played.
    streaks = {
      "daily" => DailyPuzzle.new(plan.deal_on).streak_for(account.player_id),
      "puzzle" => ClassicPuzzle.new(plan.deal_on).streak_for(account.player_id)
    }.merge(streaks.to_h)
    # About one unplayed game: the one with the longest streak at risk, else the Daily Deal if it's left.
    at_risk = plan.kinds.select { |kind| streaks[kind].positive? }.max_by { |kind| [streaks[kind], kind == "daily" ? 1 : 0] }
    game = at_risk || (plan.kinds.include?("daily") ? "daily" : "puzzle")
    headline = at_risk ? "Keep your #{streaks[at_risk]}-day streak" : "Today’s #{NAMES[game]} is ready"
    unsubscribe_url = "#{base}/reminders/unsubscribe?#{{ t: Reminder.unsubscribe_token(account) }.to_query}"
    assigns = {
      headline: headline,
      line: at_risk ? "Play today’s #{NAMES[game]}." : nil,
      play_url: "#{base}/play?#{{ t: Reminder.play_token(account, plan.deal_on), to: PATHS[game] }.to_query}",
      unsubscribe_url: unsubscribe_url
    }
    subject = headline
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
