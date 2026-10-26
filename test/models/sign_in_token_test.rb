# frozen_string_literal: true

require "test_helper"

class SignInTokenTest < ActiveSupport::TestCase
  test "a token is stored only as a digest and works once" do
    record, token = SignInToken.issue!(email: "rose@example.com", ip: "1.2.3.4", return_to: "/puzzle")
    refute_equal token, record.token_digest
    refute SignInToken.exists?(token_digest: token)
    assert_equal "/puzzle", record.return_to

    assert_equal record, SignInToken.consume(token)
    assert_nil SignInToken.consume(token), "single use"
  end

  test "an expired or unknown token signs nobody in" do
    _record, token = SignInToken.issue!(email: "rose@example.com")
    travel SignInToken::LIFETIME + 1.second do
      assert_nil SignInToken.consume(token)
    end
    assert_nil SignInToken.consume("x" * 43)
    assert_nil SignInToken.consume(nil)
  end

  test "a return path off the list goes home" do
    record, = SignInToken.issue!(email: "rose@example.com", return_to: "https://evil.example/")
    assert_equal "/", record.return_to
  end

  test "requests are limited per email and per ip" do
    SignInToken::PER_EMAIL_PER_HOUR.times { SignInToken.issue!(email: "a@example.com", ip: "9.9.9.#{rand(255)}") }
    assert SignInToken.rate_limited?(email: "a@example.com", ip: "8.8.8.8")
    refute SignInToken.rate_limited?(email: "b@example.com", ip: "8.8.8.8")

    SignInToken::PER_IP_PER_HOUR.times { |i| SignInToken.issue!(email: "u#{i}@example.com", ip: "7.7.7.7") }
    assert SignInToken.rate_limited?(email: "new@example.com", ip: "7.7.7.7")
    travel 61.minutes do
      refute SignInToken.rate_limited?(email: "new@example.com", ip: "7.7.7.7")
    end
  end

  test "only real time zones are kept" do
    assert_equal "America/Los_Angeles", SignInToken.valid_time_zone("America/Los_Angeles")
    assert_nil SignInToken.valid_time_zone("Mars/Olympus")
    assert_nil SignInToken.valid_time_zone("../../etc")
  end
end
