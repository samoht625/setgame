module ApplicationHelper
  SITE_URL = "https://set.tido.site"
  DEFAULT_TITLE = "Set"

  PRERENDERED = Rails.root.join("app/assets/builds/prerendered.json")

  # The game's header as HTML, rendered from the same React component at
  # build time (script/prerender.tsx), so it paints with the page instead of
  # popping in when the script runs. React replaces it with the live one in
  # the same frame. Empty when the build hasn't made it (e.g. tests).
  def prerendered(name)
    @@prerendered = nil unless Rails.env.production?
    @@prerendered ||= PRERENDERED.exist? ? JSON.parse(PRERENDERED.read) : {}
    (@@prerendered[name.to_s] || "").html_safe
  end

  PRERENDERED = Rails.root.join("app/assets/builds/prerendered.json")

  # The game's header as HTML, rendered from the same React component at
  # build time (script/prerender.tsx), so it paints with the page instead of
  # popping in when the script runs. React replaces it with the live one in
  # the same frame. Empty when the build hasn't made it (e.g. tests).
  def prerendered(name)
    @@prerendered = nil unless Rails.env.production?
    @@prerendered ||= PRERENDERED.exist? ? JSON.parse(PRERENDERED.read) : {}
    (@@prerendered[name.to_s] || "").html_safe
  end

  def page_title
    content_for(:title).presence || DEFAULT_TITLE
  end

  def page_description
    content_for(:description).presence || page_title
  end

  def canonical_url
    content_for(:canonical).presence || "#{SITE_URL}#{request.path}"
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
    content_for(:social_image_alt).presence || DEFAULT_TITLE
  end
end
