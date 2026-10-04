module ApplicationHelper
  SITE_URL = "https://set.tido.site"
  DEFAULT_TITLE = "Set — Play the card game online, free"
  DEFAULT_DESCRIPTION = "Find sets against the clock. Play the classic Set card game free in your browser: " \
                        "timed solo games with leaderboards and live multiplayer with friends. " \
                        "No signup, works on phone and desktop."

  def page_title
    content_for(:title).presence || DEFAULT_TITLE
  end

  def page_description
    content_for(:description).presence || DEFAULT_DESCRIPTION
  end

  def canonical_url
    "#{SITE_URL}#{request.path}"
  end

  def social_image_url
    "#{SITE_URL}/og-image.png"
  end
end
