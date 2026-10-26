# frozen_string_literal: true

# The reminder email: which deal is waiting, the streak at stake, one Play
# button that signs this browser in, and a one-click unsubscribe.
module ReminderMailer
  def self.deliver(plan)
    deliver_message(message(plan), plan.account.email)
  end

  def self.deliver_message(msg, to)
    ResendMail.deliver(to: to, subject: msg[:subject], html: msg[:html], text: msg[:text], headers: msg[:headers])
  end

  def self.message(plan, base: ApplicationHelper::SITE_URL)
    account = plan.account
    daily = DailyPuzzle.new(plan.deal_on)
    puzzle = ClassicPuzzle.new(plan.deal_on)
    lead = plan.kinds.include?("daily") ? "daily" : "puzzle"
    streak = lead == "daily" ? daily.streak_for(account.player_id) : puzzle.streak_for(account.player_id)
    title = lead == "daily" ? "Set Daily Deal ##{daily.number}" : "Set Puzzle ##{puzzle.number}"
    path = lead == "daily" ? "/" : "/puzzle"
    unsubscribe_url = "#{base}/reminders/unsubscribe?#{{ t: Reminder.unsubscribe_token(account) }.to_query}"
    assigns = {
      headline: lead == "daily" ? "Daily Deal ##{daily.number} is ready." : "Puzzle ##{puzzle.number} is still waiting.",
      also: plan.kinds == %w[daily puzzle] ? "The Puzzle is waiting too." : nil,
      streak: streak.positive? ? "Keep your #{streak}-day streak." : nil,
      play_url: "#{base}/play?#{{ t: Reminder.play_token(account, plan.deal_on), to: path }.to_query}",
      unsubscribe_url: unsubscribe_url,
      time_label: Reminder.label(account.reminder_minutes)
    }
    {
      subject: title,
      html: ApplicationController.render(template: "reminder_mailer/reminder", formats: [:html], layout: false, assigns: assigns),
      text: ApplicationController.render(template: "reminder_mailer/reminder", formats: [:text], layout: false, assigns: assigns),
      headers: {
        "List-Unsubscribe" => "<#{unsubscribe_url}>",
        "List-Unsubscribe-Post" => "List-Unsubscribe=One-Click"
      }
    }
  end
end
