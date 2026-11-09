# frozen_string_literal: true

require "test_helper"
require "minitest/mock"

class HomeControllerTest < ActionDispatch::IntegrationTest
  DAILY_TITLE = "Set Daily Deal · Play the Set Card Game Online"
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

  test "the dailies inline this player's status so the first paint is the right card" do
    get "/"
    boot = JSON.parse(response.body[%r{<script type="application/json" id="setgame-boot">(.*?)</script>}m, 1])
    assert_nil boot["player_id"], "no cookie: it's what a new player sees"
    assert_equal DailyStatus.for(SecureRandom.uuid).except(:leaderboard).deep_stringify_keys.except("leaderboard"), boot["daily"].except("leaderboard")
    assert_equal false, boot["puzzle"]["me"]["attempted"]

    get "/puzzle"
    assert_includes response.body, 'id="setgame-boot"'
    get "/practice"
    refute_includes response.body, 'id="setgame-boot"'
  end

  test "each page has its own title, description, canonical URL and share preview" do
    {
      "/" => [DAILY_TITLE, "https://set.tido.site/"],
      "/daily" => [DAILY_TITLE, "https://set.tido.site/"],
      "/puzzle" => ["Set Puzzle · The Daily Set Puzzle: Find All 6 Sets", "https://set.tido.site/puzzle"],
      "/practice" => ["Set Practice · Timed Set Card Game", "https://set.tido.site/practice"],
      "/m" => ["Set Multiplayer · Play Set Online with Friends", "https://set.tido.site/m"]
    }.each do |path, (title, url)|
      get path
      assert_response :success
      assert_select "html[lang=en]"
      assert_select "title", text: title
      description = css_select("meta[name=description]").first["content"]
      assert_operator description.length, :>, 80, "#{path} says what the page is, not just its title"
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
      assert_select "dialog#how-to-play", text: /About Set|free/, count: 0
      assert_select "section.sr-only", text: /About Set/
      assert_select "footer", false
      assert_no_match(/not affiliated with Set Enterprises/, response.body)
    end
  end

  test "the Daily Deal is the front door and old links still work" do
    get "/s"
    assert_redirected_to "/"
    get "/solo"
    assert_redirected_to "/practice"
    %w[/ /daily /puzzle /practice].each do |path|
      get path
      assert_response :success
      assert_select "#root"
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
    assert_select "meta[property='og:title'][content=?]", "Set Daily Deal #12 · 2:41"
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
      assert_select "title", text: DAILY_TITLE
      assert_select "link[rel=canonical][href=?]", "https://set.tido.site/"
      assert_select "meta[property='og:title'][content=?]", "Set Daily Deal #12 · 2:41"
      assert_select "meta[name='twitter:title'][content=?]", "Set Daily Deal #12 · 2:41"
      assert_select "meta[property='og:url'][content=?]", "https://set.tido.site/daily?r=#{token}"
      assert_select "meta[property='og:image'][content=?]", "https://set.tido.site/og/daily/#{token}.png"
      assert_select "meta[name='twitter:image'][content=?]", "https://set.tido.site/og/daily/#{token}.png"
      assert_select "#root"
    end

    get "/daily", params: { r: "c-3gk0-abcdefghijkl" }
    assert_select "meta[property='og:title'][content=?]", DAILY_TITLE
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
    tracker = "script[async][src='https://analytics.tido.site/script.js'][data-website-id='b4235c8a-975d-4920-85d3-0a87a4af920c']"
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
    assert_equal %w[https://set.tido.site/ https://set.tido.site/puzzle https://set.tido.site/practice https://set.tido.site/m https://set.tido.site/stats], locations

    manifest = JSON.parse(Rails.root.join("public/manifest.json").read)
    assert_equal "Set", manifest.fetch("name")
    assert_equal "Set", manifest.fetch("short_name")
    assert_equal "/", manifest.fetch("start_url")
    assert_equal "standalone", manifest.fetch("display")
    sizes = manifest.fetch("icons").map { |icon| icon.fetch("sizes") }
    assert_includes sizes, "192x192"
    assert_includes sizes, "512x512"
    purposes = manifest.fetch("icons").map { |icon| icon.fetch("purpose", "any") }
    assert_equal %w[any any maskable], purposes, "the maskable icon must be its own file, not also used as an any icon"
    manifest.fetch("icons").each do |icon|
      assert Rails.root.join("public", icon.fetch("src").delete_prefix("/")).file?, "#{icon["src"]} should exist"
    end
    assert Rails.root.join("public/og-image.png").file?
    assert_not Rails.root.join("public/cards").exist?, "original card art must not be served"
  end
  test "a shared link puts the friend's result in the page, so the start card can ask to beat it" do
    boot = ->(body) { JSON.parse(body[%r{<script type="application/json" id="setgame-boot">(.*?)</script>}m, 1]) }
    get "/daily", params: { r: DailyShare.token(number: 12, elapsed_ms: 161_400, rank: 2, total: 9, streak: 3, marks: "ggy") }
    assert_equal({ "kind" => "daily", "number" => 12, "elapsed_ms" => 161_400, "rank" => 2, "total" => 9 }, boot.(response.body)["shared"])

    get "/puzzle", params: { r: DailyShare.token(kind: "puzzle", number: 5, elapsed_ms: 70_000) }
    assert_equal({ "kind" => "puzzle", "number" => 5, "elapsed_ms" => 70_000, "rank" => nil, "total" => nil }, boot.(response.body)["shared"])

    # A daily token doesn't verify as a puzzle one, and a made-up one is nothing.
    get "/puzzle", params: { r: DailyShare.token(number: 12, elapsed_ms: 161_400) }
    assert_nil boot.(response.body)["shared"]
    get "/daily", params: { r: "c-3gk0-abcdefghijkl" }
    assert_nil boot.(response.body)["shared"]
  end

  test "the front door tells search engines the site's name and that it's a free web game" do
    get "/"
    data = JSON.parse(css_select("script[type='application/ld+json']").first.text)
    site, app = data.fetch("@graph")
    assert_equal({ "@type" => "WebSite", "name" => "Set", "url" => "https://set.tido.site/" }, site)
    assert_equal "WebApplication", app.fetch("@type")
    assert_equal "GameApplication", app.fetch("applicationCategory")
    assert_equal "0", app.dig("offers", "price")
    assert_equal css_select("meta[name=description]").first["content"], app.fetch("description")

    get "/puzzle"
    assert_select "script[type='application/ld+json']", count: 0
  end
end
