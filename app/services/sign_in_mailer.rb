# frozen_string_literal: true

require "net/http"

# Sends the sign-in email through Resend (https://resend.com). Without
# RESEND_API_KEY, development logs the link instead and production keeps
# sign-in switched off (see .enabled?). Tests collect emails in .deliveries.
module SignInMailer
  RESEND_URL = URI("https://api.resend.com/emails")
  SUBJECT = "Sign in to Set"

  mattr_accessor :deliveries, default: []

  def self.enabled?
    return false if ENV["SETGAME_SIGN_IN"] == "off"

    api_key.present? || !Rails.env.production?
  end

  def self.api_key
    ENV["RESEND_API_KEY"].presence
  end

  def self.from
    ENV["SETGAME_MAIL_FROM"].presence || "Set <deal@set.tido.site>"
  end

  def self.deliver(to:, url:)
    html = ApplicationController.render(template: "sign_in_mailer/sign_in", formats: [:html], layout: false, assigns: { url: url })
    text = ApplicationController.render(template: "sign_in_mailer/sign_in", formats: [:text], layout: false, assigns: { url: url })
    message = { from: from, to: [to], subject: SUBJECT, html: html, text: text }

    if Rails.env.test?
      deliveries << message
      true
    elsif api_key
      send_with_resend(message)
    else
      Rails.logger.info("[SignInMailer] No RESEND_API_KEY; sign-in link for #{to}: #{url}")
      true
    end
  end

  def self.send_with_resend(message)
    request = Net::HTTP::Post.new(RESEND_URL)
    request["Authorization"] = "Bearer #{api_key}"
    request["Content-Type"] = "application/json"
    request.body = message.to_json
    response = Net::HTTP.start(RESEND_URL.host, RESEND_URL.port, use_ssl: true, open_timeout: 5, read_timeout: 10) do |http|
      http.request(request)
    end
    return true if response.is_a?(Net::HTTPSuccess)

    Rails.logger.error("[SignInMailer] Resend refused the email (#{response.code}): #{response.body.to_s.first(300)}")
    false
  rescue StandardError => e
    Rails.logger.error("[SignInMailer] Resend request failed: #{e.class}: #{e.message}")
    false
  end
end
