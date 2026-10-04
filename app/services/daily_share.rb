# frozen_string_literal: true

# A finished daily result packed into a short signed token for share links
# (/daily?r=<token>), so link previews can show the time without trusting
# whatever a URL claims.
class DailyShare
  Result = Data.define(:number, :elapsed_ms) do
    def time
      seconds = elapsed_ms / 1000
      format("%d:%02d", seconds / 60, seconds % 60)
    end

    def token
      DailyShare.token(number:, elapsed_ms:)
    end
  end

  FORMAT = /\A(?<number>[0-9a-z]{1,6})-(?<elapsed>[0-9a-z]{1,8})-(?<signature>[A-Za-z0-9_-]{12})\z/
  MAX_ELAPSED_MS = 24 * 60 * 60 * 1000

  class << self
    def token(number:, elapsed_ms:)
      payload = "#{number.to_i.to_s(36)}-#{elapsed_ms.to_i.to_s(36)}"
      "#{payload}-#{signature(payload)}"
    end

    def verify(token)
      match = FORMAT.match(token.to_s)
      return unless match

      expected = signature("#{match[:number]}-#{match[:elapsed]}")
      return unless ActiveSupport::SecurityUtils.secure_compare(expected, match[:signature])

      result = Result.new(number: match[:number].to_i(36), elapsed_ms: match[:elapsed].to_i(36))
      result if result.number.positive? && result.elapsed_ms.between?(1, MAX_ELAPSED_MS)
    end

    private

    def signature(payload)
      Base64.urlsafe_encode64(OpenSSL::HMAC.digest("SHA256", key, payload).byteslice(0, 9))
    end

    def key
      @key ||= Rails.application.key_generator.generate_key("setgame/daily-share", 32)
    end
  end
end
