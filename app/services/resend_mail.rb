# frozen_string_literal: true

require "net/http"

# Sends email through Resend (https://resend.com) with RESEND_API_KEY.
# Without a key, development logs the message instead; tests collect
# messages in .deliveries. Returns a Result with Resend's id on success.
module ResendMail
  URL = URI("https://api.resend.com/emails")
  Result = Struct.new(:ok, :id, :status, :error, keyword_init: true) do
    def ok? = ok
    # Resend's rate limit or a server/network error: worth retrying later.
    def retryable? = !ok && (status.nil? || status == 429 || status >= 500)
  end

  mattr_accessor :deliveries, default: []

  def self.api_key
    ENV["RESEND_API_KEY"].presence
  end

  def self.from
    ENV["SETGAME_MAIL_FROM"].presence || "Set <deal@set.tido.site>"
  end

  def self.deliver(to:, subject:, html:, text:, headers: {})
    message = { from: from, to: [to], subject: subject, html: html, text: text }
    message[:headers] = headers if headers.present?

    if Rails.env.test?
      deliveries << message
      Result.new(ok: true, id: "test-#{deliveries.length}")
    elsif api_key
      post(message)
    else
      Rails.logger.info("[ResendMail] No RESEND_API_KEY; would send #{subject.inspect} to #{to}:\n#{text}")
      Result.new(ok: true, id: "logged")
    end
  end

  def self.post(message)
    request = Net::HTTP::Post.new(URL)
    request["Authorization"] = "Bearer #{api_key}"
    request["Content-Type"] = "application/json"
    request.body = message.to_json
    response = Net::HTTP.start(URL.host, URL.port, use_ssl: true, open_timeout: 5, read_timeout: 10) { |http| http.request(request) }
    if response.is_a?(Net::HTTPSuccess)
      Result.new(ok: true, id: (JSON.parse(response.body)["id"] rescue nil), status: response.code.to_i)
    else
      Rails.logger.error("[ResendMail] Resend refused #{message[:subject].inspect} (#{response.code}): #{response.body.to_s.first(300)}")
      Result.new(ok: false, status: response.code.to_i, error: response.body.to_s.first(300))
    end
  rescue StandardError => e
    Rails.logger.error("[ResendMail] Resend request failed: #{e.class}: #{e.message}")
    Result.new(ok: false, error: "#{e.class}: #{e.message}".first(300))
  end
end
