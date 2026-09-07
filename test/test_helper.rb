# frozen_string_literal: true

ENV["RAILS_ENV"] ||= "test"
require_relative "../config/environment"
require "rails/test_help"

module ActiveSupport
  class TestCase
    # SQLite + WAL: keep tests in a single process to avoid lock contention.
    parallelize(workers: 1)
  end
end
