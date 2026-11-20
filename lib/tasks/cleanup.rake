# frozen_string_literal: true

desc "Prune expired sign-in tokens, old 0-set expired solo games, stale sessions, and old OG cache PNGs"
task cleanup: :environment do
  counts = MaintenanceCleanup.run!
  puts "[Cleanup] #{counts.map { |k, v| "#{k}=#{v}" }.join(' ')}"
end
