class ApplicationController < ActionController::Base
  # Link-preview fetchers that can claim an old Safari. Apple Messages sends
  # "Version/9.0.1 Safari/601.2.4 facebookexternalhit/1.1 Facebot Twitterbot/1.0",
  # which the gate would otherwise turn away, leaving the link without a preview.
  LINK_PREVIEW_BOTS = /facebookexternalhit|Facebot|Twitterbot|Applebot|Slackbot|Discordbot|WhatsApp|TelegramBot|LinkedInBot/i

  # Tailwind CSS v4's floor (cascade layers, @property, color-mix). Older browsers
  # can't render the board. Browsers not listed here, and crawlers, are allowed.
  allow_browser versions: { safari: 16.4, chrome: 111, firefox: 128, opera: 97, ie: false }, unless: :link_preview_bot?

  private

  def link_preview_bot?
    request.user_agent.to_s.match?(LINK_PREVIEW_BOTS)
  end
end
