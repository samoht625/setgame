# frozen_string_literal: true

# The reminder email: any streak at stake first, which deal is waiting, one
# Play button that signs this browser in, and a one-tap way to turn it off.
module ReminderMailer
  def self.deliver(plan, streaks: nil)
    deliver_message(message(plan, streaks: streaks), plan.account.email)
  end

  def self.deliver_message(msg, to)
    ResendMail.deliver(to: to, subject: msg[:subject], html: msg[:html], text: msg[:text], headers: msg[:headers])
  end

  NAMES = { "daily" => "Daily Deal", "puzzle" => "Puzzle" }.freeze

  # `streaks` stands in for the player's real ones in a test send, e.g. { "daily" => 4 }.
  def self.message(plan, base: ApplicationHelper::SITE_URL, streaks: nil)
    account = plan.account
    daily = DailyPuzzle.new(plan.deal_on)
    puzzle = ClassicPuzzle.new(plan.deal_on)
    lead = plan.kinds.include?("daily") ? "daily" : "puzzle"
    # The same streaks the games show: through yesterday until today's is played.
    streaks = { "daily" => daily.streak_for(account.player_id), "puzzle" => puzzle.streak_for(account.player_id) }.merge(streaks.to_h)
    at_stake = plan.kinds.select { |kind| streaks[kind].positive? }
    safe = (%w[daily puzzle] - plan.kinds).select { |kind| streaks[kind].positive? }
    title = lead == "daily" ? "Set Daily Deal ##{daily.number}" : "Set Puzzle ##{puzzle.number}"
    path = lead == "daily" ? "/" : "/puzzle"
    unsubscribe_url = "#{base}/reminders/unsubscribe?#{{ t: Reminder.unsubscribe_token(account) }.to_query}"
    assigns = {
      headline: lead == "daily" ? "Daily Deal ##{daily.number} is ready." : "Puzzle ##{puzzle.number} is still waiting.",
      also: plan.kinds == %w[daily puzzle] ? "The Puzzle is waiting too." : nil,
      streak_title: case at_stake.length
                    when 0 then nil
                    when 1 then "Keep your #{streaks[at_stake[0]]}-day streak"
                    else "Keep your streaks"
                    end,
      streak_games: at_stake.length > 1 ? at_stake.map { |kind| "#{streaks[kind]}-day #{NAMES[kind]}" }.join(" · ") : nil,
      streak_note: case at_stake.length
                   when 0 then nil
                   when 1 then "Play today’s #{NAMES[at_stake[0]]} to keep it."
                   else "Play both today to keep them."
                   end,
      safe: safe.map { |kind| "#{NAMES[kind]} streak: #{streaks[kind]} days, done today." }.first,
      play_url: "#{base}/play?#{{ t: Reminder.play_token(account, plan.deal_on), to: path }.to_query}",
      unsubscribe_url: unsubscribe_url,
      time_label: Reminder.label(account.reminder_minutes)
    }
    subject = case at_stake.length
              when 0 then title
              when 1 then "Keep your #{streaks[at_stake[0]]}-day #{NAMES[at_stake[0]]} streak"
              else "Keep your #{streaks['daily']}-day Daily Deal and #{streaks['puzzle']}-day Puzzle streaks"
              end
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
