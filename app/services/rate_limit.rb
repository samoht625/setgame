# frozen_string_literal: true

# Per-client request counters in fixed windows, kept in this process's
# memory: the app runs as a single Puma process. Generous enough for a
# classroom sharing one IP; meant to stop scripts, not players.
module RateLimit
  def self.exceeded?(name, client, to:, within:)
    count = store.increment("#{name}:#{client}", 1, expires_in: within)
    count.to_i > to
  end

  def self.reset!
    store.clear
  end

  def self.store
    @store ||= ActiveSupport::Cache::MemoryStore.new(size: 16.megabytes)
  end
end
