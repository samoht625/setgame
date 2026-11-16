# frozen_string_literal: true

require "test_helper"
require "minitest/mock"

class HomeControllerTest < ActionDispatch::IntegrationTest
  # The front door plays the Daily Deal but leads with the daily Set puzzle for search, naming both dailies.
  DAILY_HEADING = "Daily Set Puzzle: find 6 sets in 12 cards, or clear the deck"
  DAILY_TITLE = "#{DAILY_HEADING} | Set Daily"
  DAILY_DESCRIPTION = "Play the daily Set puzzle free: find all 6 sets in 12 cards, or clear the whole deck in the Daily Deal. " \
                      "Same cards for everyone, new at midnight Pacific. No signup."
  PUZZLE_HEADING = "Today’s Set Puzzle: 12 cards, 6 sets, one try"
  PUZZLE_TITLE = "#{PUZZLE_HEADING} | Set Daily"
  PUZZLE_DESCRIPTION = "Today’s Set Puzzle: 12 cards hold exactly 6 sets. Find all 6 in one try and see how your time ranks. " \
                       "A new puzzle every midnight Pacific. Free, no signup."
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
    assert_equal css_select("meta[name='setgame-player-id']").first["content"], boot["player_id"], "no cookie: the page's new player, with what a new player sees"
    assert_equal DailyStatus.for(SecureRandom.uuid).except(:leaderboard).deep_stringify_keys.except("leaderboard"), boot["daily"].except("leaderboard")
    assert_equal false, boot["puzzle"]["me"]["attempted"]

    get "/puzzle"
    assert_includes response.body, 'id="setgame-boot"'
    get "/practice"
    refute_includes response.body, 'id="setgame-boot"'
  end

  test "each page has its own title, description, canonical URL and share preview" do
    {
      "/" => [DAILY_TITLE, "https://setdaily.app/"],
      "/daily" => [DAILY_TITLE, "https://setdaily.app/"],
      "/puzzle" => [PUZZLE_TITLE, "https://setdaily.app/puzzle"],
      "/practice" => ["Set Practice · Timed Set Card Game", "https://setdaily.app/practice"],
      "/m" => ["Set Multiplayer · Play Set Online with Friends", "https://setdaily.app/m"]
    }.each do |path, (title, url)|
      get path
      assert_response :success
      assert_select "html[lang=en]"
      assert_select "title", text: title
      description = css_select("meta[name=description]").first["content"]
      assert_operator description.length, :>, 80, "#{path} says what the page is, not just its title"
      assert_select "link[rel=canonical][href=?]", url
      assert_select "meta[property='og:title'][content=?]", title
      assert_select "meta[name='twitter:title'][content=?]", title
      assert_select "meta[property='og:description'][content=?]", description
      assert_select "meta[name='twitter:description'][content=?]", description
      assert_select "meta[property='og:url'][content=?]", url
      assert_select "meta[property='og:image'][content=?]", "https://setdaily.app/og-image.png"
      assert_select "meta[property='og:image:width'][content='1200']"
      assert_select "meta[property='og:image:height'][content='630']"
      assert_select "meta[name='twitter:card'][content='summary_large_image']"
      assert_select "link[rel=manifest][href='/manifest.json']"
      assert_select "link[rel=apple-touch-icon][href='/apple-touch-icon.png']"
      # Light or dark with the system, browser chrome included.
      assert_select "meta[name='color-scheme'][content='light dark']"
      assert_select "meta[name='theme-color'][media=?][content=?]", "(prefers-color-scheme: light)", "#f5f5f5"
      assert_select "meta[name='theme-color'][media=?][content=?]", "(prefers-color-scheme: dark)", "#111214"
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
      assert_select "meta[property='og:image'][content=?]", "https://setdaily.app/og-image.png"
    end

    get "/daily", params: { r: token }, headers: { "User-Agent" => messages }
    assert_response :success
    assert_select "meta[property='og:title'][content=?]", "Set Daily Deal #12 · 2:41"
    assert_select "meta[property='og:image'][content=?]", "https://setdaily.app/og/daily/#{token}.png"

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
      assert_select "link[rel=canonical][href=?]", "https://setdaily.app/"
      assert_select "meta[property='og:title'][content=?]", "Set Daily Deal #12 · 2:41"
      assert_select "meta[name='twitter:title'][content=?]", "Set Daily Deal #12 · 2:41"
      assert_select "meta[property='og:url'][content=?]", "https://setdaily.app/daily?r=#{token}"
      assert_select "meta[property='og:image'][content=?]", "https://setdaily.app/og/daily/#{token}.png"
      assert_select "meta[name='twitter:image'][content=?]", "https://setdaily.app/og/daily/#{token}.png"
      assert_select "#root"
    end

    get "/daily", params: { r: "c-3gk0-abcdefghijkl" }
    assert_select "meta[property='og:title'][content=?]", DAILY_TITLE
    assert_select "meta[property='og:image'][content=?]", "https://setdaily.app/og-image.png"
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
    assert_includes robots, "Sitemap: https://setdaily.app/sitemap.xml"

    refute Rails.root.join("public/sitemap.xml").exist?, "a file there would be served instead of the generated sitemap (SitemapController)"

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

  test "the front door leads with the daily Set puzzle for search and says both dailies are there" do
    %w[/ /daily].each do |path|
      get path
      assert_select "title", text: DAILY_TITLE
      assert_select "meta[name=description][content=?]", DAILY_DESCRIPTION
      assert_select "meta[property='og:title'][content=?]", DAILY_TITLE
      assert_select "meta[name='twitter:title'][content=?]", DAILY_TITLE
      assert_select "meta[property='og:description'][content=?]", DAILY_DESCRIPTION
      assert_select "meta[name='twitter:description'][content=?]", DAILY_DESCRIPTION
      assert_select "link[rel=canonical][href=?]", "https://setdaily.app/", count: 1
      # One main heading, out of sight like the About text; the game on screen is still the Daily Deal.
      assert_select "h1", count: 1
      assert_select "h1.sr-only", text: DAILY_HEADING
    end

    title = css_select("title").first.text
    description = css_select("meta[name=description]").first["content"]
    assert title.start_with?("Daily Set Puzzle"), "the phrase people search for comes first"
    assert_equal 1, title.scan(/puzzle/i).size, "said once, not stuffed"
    # Honest about what opens: the title, the heading and the description name the Daily Deal's game too.
    [title, css_select("h1").first.text].each { |text| assert_match(/find 6 sets in 12 cards, or clear the deck/, text) }
    assert_match(/6 sets in 12 cards/, description)
    assert_match(/clear the whole deck in the Daily Deal/, description)
    assert_operator description.length, :<=, 170, "long descriptions are cut off in search results"
    # The hidden About text says the same, the daily puzzle first.
    assert_select "section.sr-only p", text: /a daily Set puzzle \(find all 6 sets in 12 cards\) and a Daily Deal \(clear the whole deck\)/
  end

  test "the Puzzle page says what that one game is and doesn't compete with the front door" do
    get "/puzzle"
    assert_select "title", text: PUZZLE_TITLE
    assert_select "meta[name=description][content=?]", PUZZLE_DESCRIPTION
    assert_select "meta[property='og:title'][content=?]", PUZZLE_TITLE
    assert_select "meta[name='twitter:title'][content=?]", PUZZLE_TITLE
    assert_select "meta[property='og:description'][content=?]", PUZZLE_DESCRIPTION
    assert_select "link[rel=canonical][href=?]", "https://setdaily.app/puzzle", count: 1
    assert_select "h1", count: 1
    assert_select "h1.sr-only", text: PUZZLE_HEADING
    title = css_select("title").first.text
    description = css_select("meta[name=description]").first["content"]
    assert_operator description.length, :<=, 170, "long descriptions are cut off in search results"
    [title, description, css_select("h1").first.text].each do |text|
      assert_no_match(/daily set puzzle/i, text, "the front door is the page for that search")
    end

    # A shared result keeps its own canonical page, whatever the link carries.
    get "/puzzle", params: { r: DailyShare.token(kind: "puzzle", number: 5, elapsed_ms: 70_000) }
    assert_select "title", text: PUZZLE_TITLE
    assert_select "link[rel=canonical][href=?]", "https://setdaily.app/puzzle"
    assert_select "meta[property='og:title'][content=?]", "Set Puzzle #5 · 1:10"
  end

  test "no two game pages share a title, a description or a canonical URL" do
    pages = %w[/ /puzzle /practice /m].map do |path|
      get path
      [css_select("title").first.text, css_select("meta[name=description]").first["content"], css_select("link[rel=canonical]").first["href"]]
    end
    pages.transpose.each { |values| assert_equal values.uniq, values }
  end

  test "the front door tells search engines the site's name and that it's a free browser game" do
    get "/"
    scripts = css_select("script[type='application/ld+json']")
    assert_equal 1, scripts.size
    assert_no_match(/[<>&]/, scripts.first.text, "nothing in the JSON can close the script tag")
    data = JSON.parse(scripts.first.text)
    assert_equal "https://schema.org", data.fetch("@context")
    site, game = data.fetch("@graph")
    assert_equal 2, data.fetch("@graph").size

    assert_equal(
      { "@type" => "WebSite", "@id" => "https://setdaily.app/#website", "name" => "Set Daily", "alternateName" => "Set",
        "url" => "https://setdaily.app/", "inLanguage" => "en" },
      site
    )

    assert_equal %w[VideoGame WebApplication], game.fetch("@type")
    assert_equal "https://setdaily.app/#game", game.fetch("@id")
    assert_equal "Set Daily", game.fetch("name")
    assert_equal "https://setdaily.app/", game.fetch("url")
    assert_equal DAILY_DESCRIPTION, game.fetch("description")
    assert_equal css_select("meta[name=description]").first["content"], game.fetch("description")
    assert_equal css_select("meta[property='og:image']").first["content"], game.fetch("image")
    assert_equal ["Puzzle", "Card game"], game.fetch("genre")
    assert_equal "Web browser", game.fetch("gamePlatform")
    assert_equal %w[https://schema.org/SinglePlayer https://schema.org/MultiPlayer], game.fetch("playMode")
    assert_equal "GameApplication", game.fetch("applicationCategory")
    assert_equal "Any", game.fetch("operatingSystem")
    assert_equal true, game.fetch("isAccessibleForFree")
    assert_equal({ "@type" => "Offer", "price" => "0", "priceCurrency" => "USD" }, game.fetch("offers"))
    assert_equal({ "@id" => site.fetch("@id") }, game.fetch("isPartOf"))

    # Only what is true of the site: it has no ratings, reviews, named author or search box.
    [site, game].each do |node|
      assert_empty node.keys & %w[aggregateRating review author publisher creator potentialAction], node.fetch("@type").inspect
    end

    # /daily is the same page under its canonical URL, so it says the same.
    get "/daily"
    assert_equal data, JSON.parse(css_select("script[type='application/ld+json']").first.text)

    # A shared result changes the link preview, not what the site is.
    get "/daily", params: { r: DailyShare.token(number: 12, elapsed_ms: 161_400) }
    assert_equal data, JSON.parse(css_select("script[type='application/ld+json']").first.text)

    %w[/puzzle /practice /m].each do |path|
      get path
      assert_select "script[type='application/ld+json']", count: 0
    end
  end
end
