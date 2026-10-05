# frozen_string_literal: true

require "test_helper"
require "minitest/mock"

class HomeControllerTest < ActionDispatch::IntegrationTest
  PREVIEW_BOTS = {
    "Slack" => "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
    "iMessage / Facebook" => "facebookexternalhit/1.1 Facebot Twitterbot/1.0",
    "iMessage (with Safari 9)" => "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_1) AppleWebKit/601.2.4 (KHTML, like Gecko) " \
                                  "Version/9.0.1 Safari/601.2.4 facebookexternalhit/1.1 Facebot Twitterbot/1.0",
    "Applebot" => "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.1.1 Safari/605.1.15 (Applebot/0.1; +http://www.apple.com/go/applebot)",
    "X" => "Twitterbot/1.0",
    "Discord" => "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)",
    "WhatsApp" => "WhatsApp/2.23.20.0",
    "Google" => "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"
  }.freeze

  test "each page has its own title, description, canonical URL and share preview" do
    {
      "/" => ["Set — Play the card game online, free", "https://set.tido.site/"],
      "/daily" => ["Set Daily — Today’s deal, same for everyone", "https://set.tido.site/daily"],
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
      # The rules live in the How to play dialog, still in the page for search engines.
      assert_select "dialog#how-to-play", text: /Three cards are a set when each feature/
      assert_select "footer", false
      assert_no_match(/not affiliated with Set Enterprises/, response.body)
    end
  end

  test "link preview crawlers get the page instead of the unsupported-browser page" do
    PREVIEW_BOTS.each do |name, user_agent|
      get "/", headers: { "User-Agent" => user_agent }
      assert_response :success, "#{name} should be served the page"
      assert_select "meta[property='og:image']"
    end
  end

  test "Apple Messages link previews get the page even though they claim Safari 9" do
    messages = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_1) AppleWebKit/601.2.4 (KHTML, like Gecko) " \
               "Version/9.0.1 Safari/601.2.4 facebookexternalhit/1.1 Facebot Twitterbot/1.0"
    token = DailyShare.token(number: 12, elapsed_ms: 161_400)

    %w[/ /daily].each do |path|
      get path, headers: { "User-Agent" => messages }
      assert_response :success, "#{path} should be served to Messages"
      assert_select "meta[property='og:title'][content]"
      assert_select "meta[property='og:image'][content=?]", "https://set.tido.site/og-image.png"
    end

    get "/daily", params: { r: token }, headers: { "User-Agent" => messages }
    assert_response :success
    assert_select "meta[property='og:title'][content=?]", "I completed Set Daily #12 in 2:41"
    assert_select "meta[property='og:image'][content=?]", "https://set.tido.site/og/daily/#{token}.png"

    # The same old Safari without a preview bot's name is still turned away.
    get "/", headers: { "User-Agent" => messages.delete_suffix(" facebookexternalhit/1.1 Facebot Twitterbot/1.0") }
    assert_response :not_acceptable
  end

  test "a shared daily link previews the result but still opens today's deal" do
    token = DailyShare.token(number: 12, elapsed_ms: 161_400)

    PREVIEW_BOTS.values_at("Slack", "X").each do |user_agent|
      get "/daily", params: { r: token }, headers: { "User-Agent" => user_agent }
      assert_response :success
      assert_select "title", text: "Set Daily — Today’s deal, same for everyone"
      assert_select "link[rel=canonical][href=?]", "https://set.tido.site/daily"
      assert_select "meta[property='og:title'][content=?]", "I completed Set Daily #12 in 2:41"
      assert_select "meta[name='twitter:title'][content=?]", "I completed Set Daily #12 in 2:41"
      assert_select "meta[property='og:url'][content=?]", "https://set.tido.site/daily?r=#{token}"
      assert_select "meta[property='og:image'][content=?]", "https://set.tido.site/og/daily/#{token}.png"
      assert_select "meta[name='twitter:image'][content=?]", "https://set.tido.site/og/daily/#{token}.png"
      assert_select "#root"
    end

    get "/daily", params: { r: "c-3gk0-abcdefghijkl" }
    assert_select "meta[property='og:title'][content=?]", "Set Daily — Today’s deal, same for everyone"
    assert_select "meta[property='og:image'][content=?]", "https://set.tido.site/og-image.png"
  end

  test "Safari 17.0 on iOS gets the app; browsers too old to render it do not" do
    get "/", headers: { "User-Agent" => "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" }
    assert_response :success
    get "/", headers: { "User-Agent" => "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15" }
    assert_response :success
    get "/", headers: { "User-Agent" => "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6 Safari/605.1.15" }
    assert_response :not_acceptable
  end

  test "the Umami tracker is on production pages, exactly once" do
    tracker = "script[defer][src='https://analytics.tido.site/script.js'][data-website-id='b4235c8a-975d-4920-85d3-0a87a4af920c']"
    get "/"
    assert_select tracker, count: 0

    Rails.stub(:env, ActiveSupport::EnvironmentInquirer.new("production")) { get "/daily" }
    assert_select "head #{tracker}", count: 1
  end

  test "tab icons are the small bold ones" do
    get "/"
    assert_select "link[rel=icon][href='/icon-16.png'][sizes='16x16']"
    assert_select "link[rel=icon][href='/icon-32.png'][sizes='32x32']"
    assert_select "link[rel=icon][href='/icon.svg']"
    %w[icon-16.png icon-32.png icon.svg].each { |file| assert Rails.root.join("public", file).file? }
  end

  test "crawl and install files point at the canonical domain" do
    robots = Rails.root.join("public/robots.txt").read
    assert_includes robots, "Sitemap: https://set.tido.site/sitemap.xml"

    sitemap = Nokogiri::XML(Rails.root.join("public/sitemap.xml").read)
    locations = sitemap.remove_namespaces!.xpath("//url/loc").map(&:text)
    assert_equal %w[https://set.tido.site/ https://set.tido.site/daily https://set.tido.site/m], locations

    manifest = JSON.parse(Rails.root.join("public/manifest.json").read)
    assert_equal "Set", manifest.fetch("name")
    assert_equal "Set", manifest.fetch("short_name")
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
