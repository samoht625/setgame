# frozen_string_literal: true

# A finished Daily Deal or Puzzle result packed into a short signed token for
# share links (/daily?r=<token>, /puzzle?r=<token>), so link previews can show
# the time, rank, streak and grid without trusting whatever a URL claims.
#
# Marks are one letter per square of the share grid: g/y/r for a Daily Deal's
# fast/average/slow sets, h/m for a Puzzle's hits and misses. Tokens from
# before rank, streak and marks were added (number-elapsed-signature) still verify.
class DailyShare
  KINDS = %w[daily puzzle].freeze
  EMOJI = { "g" => "🟩", "y" => "🟨", "r" => "🟥", "h" => "✅", "m" => "❌" }.freeze

  Result = Data.define(:kind, :number, :elapsed_ms, :rank, :total, :streak, :marks) do
    def initialize(number:, elapsed_ms:, kind: "daily", rank: nil, total: nil, streak: nil, marks: "")
      super(kind:, number:, elapsed_ms:, rank:, total:, streak:, marks: marks.to_s)
    end

    def time
      seconds = elapsed_ms / 1000
      format("%d:%02d", seconds / 60, seconds % 60)
    end

    def title
      kind == "puzzle" ? "Set Puzzle ##{number}" : "Set Daily Deal ##{number}"
    end

    def ranked?
      rank.to_i.positive? && total.to_i >= rank.to_i
    end

    # "2nd of 5 · 3-day streak", without the streak below two days.
    def standing
      parts = []
      parts << "#{rank.to_i.ordinalize} of #{total}" if ranked?
      parts << "#{streak}-day streak" if streak.to_i >= 2
      parts.join(" · ")
    end

    def token
      extras = rank.nil? && total.nil? && streak.nil? ? {} : { rank:, total:, streak:, marks: }
      DailyShare.token(kind:, number:, elapsed_ms:, **extras)
    end
  end

  FORMAT = /\A(?<number>[0-9a-z]{1,6})-(?<elapsed>[0-9a-z]{1,8})(?:-(?<rank>[0-9a-z]{1,4})-(?<total>[0-9a-z]{1,4})-(?<streak>[0-9a-z]{1,4})-(?<marks>[gyrhm]{0,60}))?-(?<signature>[A-Za-z0-9_-]{12})\z/
  MAX_ELAPSED_MS = 24 * 60 * 60 * 1000

  class << self
    def token(number:, elapsed_ms:, kind: "daily", rank: nil, total: nil, streak: nil, marks: nil)
      payload = "#{number.to_i.to_s(36)}-#{elapsed_ms.to_i.to_s(36)}"
      unless rank.nil? && total.nil? && streak.nil? && marks.nil?
        cleaned = marks.to_s.gsub(/[^gyrhm]/, "").first(60)
        payload += "-#{rank.to_i.to_s(36)}-#{total.to_i.to_s(36)}-#{streak.to_i.to_s(36)}-#{cleaned}"
      end
      "#{payload}-#{signature(payload, kind)}"
    end

    def verify(token, kind: "daily")
      match = FORMAT.match(token.to_s)
      return unless match

      payload = token.to_s.delete_suffix("-#{match[:signature]}")
      return unless ActiveSupport::SecurityUtils.secure_compare(signature(payload, kind), match[:signature])

      extras = match[:rank] ? { rank: match[:rank].to_i(36), total: match[:total].to_i(36), streak: match[:streak].to_i(36), marks: match[:marks] } : {}
      result = Result.new(kind:, number: match[:number].to_i(36), elapsed_ms: match[:elapsed].to_i(36), **extras)
      result if result.number.positive? && result.elapsed_ms.between?(1, MAX_ELAPSED_MS)
    end

    private

    def signature(payload, kind)
      Base64.urlsafe_encode64(OpenSSL::HMAC.digest("SHA256", key(kind), payload).byteslice(0, 9))
    end

    # Daily tokens keep their original key so links shared before the Puzzle still verify.
    def key(kind)
      raise ArgumentError, "unknown share kind: #{kind}" unless KINDS.include?(kind)

      @keys ||= {}
      @keys[kind] ||= Rails.application.key_generator.generate_key(kind == "daily" ? "setgame/daily-share" : "setgame/#{kind}-share", 32)
    end
  end
end
