# frozen_string_literal: true

# One signed-in browser. The browser's cookie carries a random token; only its
# SHA-256 digest is stored, so a database leak can't sign anyone in.
class AccountSession < ApplicationRecord
  LIFETIME = 1.year

  belongs_to :account

  def self.digest(token)
    OpenSSL::Digest::SHA256.hexdigest(token.to_s)
  end

  # Returns [session, raw_token].
  def self.start!(account, user_agent: nil)
    token = SecureRandom.urlsafe_base64(32)
    session = create!(account: account, token_digest: digest(token), user_agent: user_agent.to_s.first(255), last_seen_at: Time.current)
    [session, token]
  end

  def self.authenticate(token)
    return nil unless token.is_a?(String) && token.length.between?(20, 100)

    digest = digest(token)
    session = find_by(token_digest: digest)
    return nil unless session && ActiveSupport::SecurityUtils.secure_compare(session.token_digest, digest)
    return nil if session.last_seen_at && session.last_seen_at < LIFETIME.ago

    session.update_column(:last_seen_at, Time.current) if session.last_seen_at.nil? || session.last_seen_at < 1.day.ago
    session
  end
end
