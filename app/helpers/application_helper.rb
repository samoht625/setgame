module ApplicationHelper
  SITE_URL = "https://set.tido.site"
  DEFAULT_TITLE = "Set — Play the card game online, free"
  DEFAULT_DESCRIPTION = "Find sets against the clock. Play the classic Set card game free in your browser: " \
                        "timed solo games with leaderboards and live multiplayer with friends. " \
                        "No signup, works on phone and desktop."
  DEFAULT_IMAGE_ALT = "Set: find the set, beat the clock. Three Set cards fanned out, forming a set."

  def page_title
    content_for(:title).presence || DEFAULT_TITLE
  end

  def page_description
    content_for(:description).presence || DEFAULT_DESCRIPTION
  end

  def canonical_url
    "#{SITE_URL}#{request.path}"
  end

  # Link previews may describe a shared result instead of the page itself.
  def social_title
    content_for(:social_title).presence || page_title
  end

  def social_description
    content_for(:social_description).presence || page_description
  end

  def social_url
    content_for(:social_url).presence || canonical_url
  end

  def social_image_url
    content_for(:social_image).presence || "#{SITE_URL}/og-image.png"
  end

  def social_image_alt
    content_for(:social_image_alt).presence || DEFAULT_IMAGE_ALT
  end
end
