# frozen_string_literal: true

namespace :reminders do
  desc "Send due reminder emails (run every 5 minutes by setgame-reminders.timer)"
  task send: :environment do
    logger = ActiveSupport::Logger.new($stdout)
    counts = Reminder.run!(logger: logger)
    logger.info("[Reminder] run #{counts.empty? ? 'nothing due' : counts.map { |k, v| "#{k}=#{v}" }.join(' ')}")
  end

  desc "Send one reminder now, outside the schedule: rails reminders:test[email] or, to preview streaks, reminders:test[email,4,2] (Daily Deal, Puzzle)"
  task :test, [:email, :daily_streak, :puzzle_streak] => :environment do |_t, args|
    account = Account.find_by!(email: Account.normalize_email(args[:email]))
    streaks = { "daily" => args[:daily_streak], "puzzle" => args[:puzzle_streak] }.compact.transform_values(&:to_i)
    result = Reminder.send_test!(account, logger: ActiveSupport::Logger.new($stdout), streaks: streaks.presence)
    puts(result.ok? ? "accepted by Resend: id=#{result.id}" : "refused: status=#{result.status} #{result.error}")
  end
end
