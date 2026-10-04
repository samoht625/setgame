# frozen_string_literal: true

require "test_helper"

class HomeControllerTest < ActionDispatch::IntegrationTest
  PREVIEW_BOTS = {
    "Slack" => "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
    "iMessage / Facebook" => "facebookexternalhit/1.1 Facebot Twitterbot/1.0",
    "X" => "Twitterbot/1.0",
    "Discord" => "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)",
    "WhatsApp" => "WhatsApp/2.23.20.0",
    "Google" => "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"
  }.freeze

  test "each page has its own title, description, canonical URL and share preview" do
    {
      "/" => ["Set — Play the card game online, free", "https://set.tido.site/"],
      "/m" => ["Set Multiplayer — Race friends to find sets", "https://set.tido.site/m"]
    }.each do |path, (title, url)|
      get path
      assert_response :success
      assert_select "html[lang=en]"
      assert_select "title", text: title
      assert_select "meta[name=description][content]"
      assert_select "link[rel=canonical][href=?]", url
      assert_select "meta[property='og:title'][content=?]", title
      assert_select "meta[property='og:url'][content=?]", url
      assert_select "meta[property='og:image'][content=?]", "https://set.tido.site/og-image.png"
      assert_select "meta[property='og:image:width'][content='1200']"
      assert_select "meta[property='og:image:height'][content='630']"
      assert_select "meta[name='twitter:card'][content='summary_large_image']"
      assert_select "link[rel=manifest][href='/manifest.json']"
      assert_select "link[rel=apple-touch-icon][href='/apple-touch-icon.png']"
      assert_select "footer", text: /Three cards are a set when each feature/
    end
  end

  test "link preview crawlers get the page instead of the unsupported-browser page" do
    PREVIEW_BOTS.each do |name, user_agent|
      get "/", headers: { "User-Agent" => user_agent }
      assert_response :success, "#{name} should be served the page"
      assert_select "meta[property='og:image']"
    end
  end

  test "crawl and install files point at the canonical domain" do
    robots = Rails.root.join("public/robots.txt").read
    assert_includes robots, "Sitemap: https://set.tido.site/sitemap.xml"

    sitemap = Nokogiri::XML(Rails.root.join("public/sitemap.xml").read)
    locations = sitemap.remove_namespaces!.xpath("//url/loc").map(&:text)
    assert_equal %w[https://set.tido.site/ https://set.tido.site/m], locations

    manifest = JSON.parse(Rails.root.join("public/manifest.json").read)
    assert_equal "/", manifest.fetch("start_url")
    assert_equal "standalone", manifest.fetch("display")
    sizes = manifest.fetch("icons").map { |icon| icon.fetch("sizes") }
    assert_includes sizes, "192x192"
    assert_includes sizes, "512x512"
    manifest.fetch("icons").each do |icon|
      assert Rails.root.join("public", icon.fetch("src").delete_prefix("/")).file?, "#{icon["src"]} should exist"
    end
    assert Rails.root.join("public/og-image.png").file?
    assert_not Rails.root.join("public/cards").exist?, "original card art must not be served"
  end
end
