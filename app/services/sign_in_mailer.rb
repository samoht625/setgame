# frozen_string_literal: true

# The sign-in email. Production keeps sign-in switched off until
# RESEND_API_KEY is set (see .enabled?).
module SignInMailer
  SUBJECT = "Sign in to Set"
  # Asked for from the reminder prompt: the link confirms the reminder (and signs in).
  CONFIRM_SUBJECT = "Confirm your Set reminder"

  def self.enabled?
    return false if ENV["SETGAME_SIGN_IN"] == "off"

    ResendMail.api_key.present? || !Rails.env.production?
  end

  def self.deliveries
    ResendMail.deliveries
  end

  # reminder: the link also turns on the reminder email at this time ("8:00 AM").
  def self.deliver(to:, url:, reminder: nil)
    assigns = { url: url, reminder: reminder }
    html = ApplicationController.render(template: "sign_in_mailer/sign_in", formats: [:html], layout: false, assigns: assigns)
    text = ApplicationController.render(template: "sign_in_mailer/sign_in", formats: [:text], layout: false, assigns: assigns)
    ResendMail.deliver(to: to, subject: reminder ? CONFIRM_SUBJECT : SUBJECT, html: html, text: text).ok?
  end
end
