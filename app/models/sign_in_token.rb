# frozen_string_literal: true

# A one-tap sign-in link: short-lived, single-use, stored only as a digest.
class SignInToken < ApplicationRecord
  LIFETIME = 30.minutes
  # Names the link the browser asked for, so opening it there signs in without a confirm step.
  REQUEST_COOKIE = :setgame_sign_in_request
  # Requests per hour; past this the request is refused without sending.
  PER_EMAIL_PER_HOUR = 5
  PER_IP_PER_HOUR = 20
  RETURN_PATHS = %w[/ /daily /puzzle /practice /m].freeze

  def self.digest(token)
    OpenSSL::Digest::SHA256.hexdigest(token.to_s)
  end

  def self.rate_limited?(email:, ip:)
    since = 1.hour.ago
    where(email: email).where("created_at > ?", since).count >= PER_EMAIL_PER_HOUR ||
      (ip.present? && where(ip: ip).where("created_at > ?", since).count >= PER_IP_PER_HOUR)
  end

  # Returns [record, raw_token].
  def self.issue!(email:, ip: nil, return_to: nil, time_zone: nil, reminder_minutes: nil)
    token = SecureRandom.urlsafe_base64(32)
    record = create!(
      email: email,
      token_digest: digest(token),
      ip: ip,
      return_to: RETURN_PATHS.include?(return_to) ? return_to : "/",
      time_zone: valid_time_zone(time_zone),
      reminder_minutes: reminder_minutes,
      expires_at: LIFETIME.from_now,
      created_at: Time.current
    )
    [record, token]
  end

  # Uses up the token and returns its record, or nil when it's unknown,
  # expired, or already used. A forwarded email or a link left in browser
  # history can't sign anyone in again.
  def self.redeem(token)
    return nil unless token.is_a?(String) && token.length.between?(20, 100)

    digest = digest(token)
    record = find_by(token_digest: digest)
    return nil unless record && ActiveSupport::SecurityUtils.secure_compare(record.token_digest, digest)
    return nil if record.expires_at <= Time.current
    return nil unless where(id: record.id, used_at: nil).update_all(used_at: Time.current) == 1

    record.reload
  end

  def usable?
    used_at.nil? && expires_at > Time.current
  end

  # The record for a token, expired or not, without using it; nil when unknown.
  def self.peek(token)
    return nil unless token.is_a?(String) && token.length.between?(20, 100)

    find_by(token_digest: digest(token))
  end

  def self.valid_time_zone(zone)
    zone = zone.to_s
    zone if zone.length <= 64 && zone.match?(%r{\A[A-Za-z_]+(/[A-Za-z0-9_+\-]+)*\z}) && TZInfo::Timezone.all_identifiers.include?(zone)
  end
end
