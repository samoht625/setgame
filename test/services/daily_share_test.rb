# frozen_string_literal: true

require "test_helper"

class DailyShareTest < ActiveSupport::TestCase
  test "a token round-trips the deal number and time" do
    token = DailyShare.token(number: 12, elapsed_ms: 161_400)
    assert_match(/\A[0-9a-z]+-[0-9a-z]+-[\w-]{12}\z/, token)

    result = DailyShare.verify(token)
    assert_equal [12, 161_400, "2:41"], [result.number, result.elapsed_ms, result.time]
    assert_equal token, result.token
  end

  test "edited or malformed tokens are rejected" do
    number, _elapsed, signature = DailyShare.token(number: 12, elapsed_ms: 161_400).split("-", 3)
    assert_nil DailyShare.verify("#{number}-1-#{signature}")
    assert_nil DailyShare.verify("#{number}-#{1.to_s(36)}")
    assert_nil DailyShare.verify(nil)
    assert_nil DailyShare.verify("../../etc/passwd")
    assert_nil DailyShare.verify(DailyShare.token(number: 12, elapsed_ms: 0))
  end
end
