# frozen_string_literal: true

ENV["RAILS_ENV"] ||= "test"
require_relative "../config/environment"
require "rails/test_help"

module ActiveSupport
  class TestCase
    # SQLite + WAL: keep tests in a single process to avoid lock contention.
    parallelize(workers: 1)

    # Plays the whole deal with the server-side simulator, claiming the first
    # available set each turn, and returns the claim events a client would send.
    def play_to_completion(seed)
      sim = SoloReplay::Simulator.new(seed)
      events = []
      t_ms = 0
      100.times do
        break if sim.finished?

        set = sim.board.combination(3).find { |a, b, c| Rules.is_set?(a, b, c) }
        flunk "no set found on board during replay" unless set

        t_ms += 1_500
        set.sort!
        sim.apply_claim!(set)
        events << { type: "claim", cards: set, t_ms: t_ms }
      end
      assert sim.finished?, "simulated game should reach round_over"
      events
    end
  end
end
