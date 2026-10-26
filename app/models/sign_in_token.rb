# frozen_string_literal: true

# A one-tap sign-in link: short-lived, single-use, stored only as a digest.
class SignInToken < ApplicationRecord
  LIFETIME = 20.minutes
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
  def self.issue!(email:, ip: nil, return_to: nil, time_zone: nil)
    token = SecureRandom.urlsafe_base64(32)
    record = create!(
      email: email,
      token_digest: digest(token),
      ip: ip,
      return_to: RETURN_PATHS.include?(return_to) ? return_to : "/",
      time_zone: valid_time_zone(time_zone),
      expires_at: LIFETIME.from_now,
      created_at: Time.current
    )
    [record, token]
  end

  # The token's record, marked used, or nil when it's unknown, expired or
  # already used. Marking it used is atomic, so a link works exactly once.
  def self.consume(token)
    return nil unless token.is_a?(String) && token.length.between?(20, 100)

    digest = digest(token)
    record = find_by(token_digest: digest)
    return nil unless record && ActiveSupport::SecurityUtils.secure_compare(record.token_digest, digest)
    return nil if record.used_at || record.expires_at <= Time.current

    claimed = where(id: record.id, used_at: nil).where("expires_at > ?", Time.current).update_all(used_at: Time.current)
    claimed == 1 ? record.reload : nil
  end

  def self.valid_time_zone(zone)
    zone = zone.to_s
    zone if zone.length <= 64 && zone.match?(%r{\A[A-Za-z_]+(/[A-Za-z0-9_+\-]+)*\z}) && TZInfo::Timezone.all_identifiers.include?(zone)
  end
end
