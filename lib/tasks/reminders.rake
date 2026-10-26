# frozen_string_literal: true

namespace :reminders do
  desc "Send due reminder emails (run every 5 minutes by setgame-reminders.timer)"
  task send: :environment do
    logger = ActiveSupport::Logger.new($stdout)
    counts = Reminder.run!(logger: logger)
    logger.info("[Reminder] run #{counts.empty? ? 'nothing due' : counts.map { |k, v| "#{k}=#{v}" }.join(' ')}")
  end

  desc "Send one reminder now, outside the schedule: rails reminders:test[email]"
  task :test, [:email] => :environment do |_t, args|
    account = Account.find_by!(email: Account.normalize_email(args[:email]))
    result = Reminder.send_test!(account, logger: ActiveSupport::Logger.new($stdout))
    puts(result.ok? ? "accepted by Resend: id=#{result.id}" : "refused: status=#{result.status} #{result.error}")
  end
end
