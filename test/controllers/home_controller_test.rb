# frozen_string_literal: true

require "test_helper"
require "minitest/mock"

class HomeControllerTest < ActionDispatch::IntegrationTest
  # The front door is the Puzzle. Its title is the site's name alone; the
  # heading and the description carry the words people search for.
  HOME_TITLE = "Set Daily"
  HOME_HEADING = "Daily Set Puzzle: find all 6 sets in 12 cards"
  HOME_DESCRIPTION = "Play the daily Set puzzle free: 12 cards hold exactly 6 sets. Find all 6 and see how your time ranks. " \
                     "Same puzzle for everyone, new at midnight Pacific. No signup."
  HOME_URL = "https://setdaily.app/"
  DAILY_TITLE = "Daily Deal | Set Daily"
  DAILY_HEADING = "Set Daily Deal: clear the whole deck, one ranked try a day"
  DAILY_DESCRIPTION = "The Daily Deal: one deck of Set, dealt the same for everyone. Clear all 81 cards as fast as you can, " \
                      "one ranked try a day. New at midnight Pacific. No signup."
  DAILY_URL = "https://setdaily.app/daily"
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

    %w[/puzzle /daily].each do |path|
      get path
      assert_includes response.body, 'id="setgame-boot"'
    end
    get "/practice"
    refute_includes response.body, 'id="setgame-boot"'
  end

  test "each page has its own title, description, canonical URL and share preview" do
    {
      "/" => [HOME_TITLE, HOME_URL],
      "/puzzle" => [HOME_TITLE, HOME_URL],
      "/daily" => [DAILY_TITLE, DAILY_URL],
      "/practice" => ["Practice | Set Daily", "https://setdaily.app/practice"],
      "/m" => ["Multiplayer | Set Daily", "https://setdaily.app/m"]
    }.each do |path, (title, url)|
      get path
      assert_response :success
      assert_select "html[lang=en]"
      assert_equal title, css_select("title").first.text
      assert_select "title", count: 1
      assert_select "meta[property='og:site_name'][content='Set Daily']"
      assert_select "meta[name='apple-mobile-web-app-title'][content='Set Daily']"
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

  test "the Puzzle is the front door and old links still work" do
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
      assert_select "link[rel=canonical][href=?]", DAILY_URL
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

  # The Daily Deal was the front door before the Puzzle: its results shared from / must still open the Deal.
  test "a Daily Deal result shared from the old front door still lands on the Deal" do
    token = DailyShare.token(number: 12, elapsed_ms: 161_400, rank: 2, total: 9, streak: 3, marks: "ggy")
    legacy = DailyShare.token(number: 12, elapsed_ms: 161_400)

    [token, legacy].each do |shared|
      get "/", params: { r: shared }
      assert_response :moved_permanently
      assert_redirected_to "/daily?r=#{shared}"
      follow_redirect!
      assert_response :success
      assert_select "title", text: DAILY_TITLE
      assert_select "meta[property='og:title'][content=?]", "Set Daily Deal #12 · 2:41"
      assert_select "meta[property='og:url'][content=?]", "https://setdaily.app/daily?r=#{shared}"
      assert_select "meta[property='og:image'][content=?]", "https://setdaily.app/og/daily/#{shared}.png"
    end

    # A link preview follows it too, and whatever else the link carried comes along.
    get "/", params: { r: token, ref: "dib2" }, headers: { "User-Agent" => PREVIEW_BOTS.fetch("Slack") }
    assert_redirected_to "/daily?r=#{token}&ref=dib2"
    get "/puzzle", params: { r: token }
    assert_redirected_to "/daily?r=#{token}"

    # The Puzzle's own results, and links that carry nothing real, stay on the Puzzle.
    puzzle = DailyShare.token(kind: "puzzle", number: 5, elapsed_ms: 70_000)
    ["/", "/puzzle"].each do |path|
      get path, params: { r: puzzle }
      assert_response :success
      assert_select "meta[property='og:title'][content=?]", "Set Puzzle #5 · 1:10"
      assert_select "meta[property='og:url'][content=?]", "https://setdaily.app/?r=#{puzzle}"
      assert_select "meta[property='og:image'][content=?]", "https://setdaily.app/og/puzzle/#{puzzle}.png"
    end
    ["c-3gk0-abcdefghijkl", "", "nonsense"].each do |made_up|
      get "/", params: { r: made_up }
      assert_response :success
      assert_select "meta[property='og:title'][content=?]", HOME_TITLE
    end
    get "/", params: { ref: "dib2" }
    assert_response :success
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
    assert_equal "Set Daily", manifest.fetch("name")
    assert_equal "Set Daily", manifest.fetch("short_name")
    # The installed app opens the home page, which is the Puzzle; its id stays "/" so it is still the same app.
    assert_equal "/", manifest.fetch("start_url")
    assert_equal "/", manifest.fetch("id")
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

    %w[/ /puzzle].each do |path|
      get path, params: { r: DailyShare.token(kind: "puzzle", number: 5, elapsed_ms: 70_000) }
      assert_equal({ "kind" => "puzzle", "number" => 5, "elapsed_ms" => 70_000, "rank" => nil, "total" => nil }, boot.(response.body)["shared"])
    end

    # A puzzle token doesn't verify as a daily one, and a made-up one is nothing.
    get "/daily", params: { r: DailyShare.token(kind: "puzzle", number: 5, elapsed_ms: 70_000) }
    assert_nil boot.(response.body)["shared"]
    %w[/ /daily].each do |path|
      get path, params: { r: "c-3gk0-abcdefghijkl" }
      assert_nil boot.(response.body)["shared"]
    end
  end

  test "the front door is the Puzzle: the site's name for a title, the search wording in the description and heading" do
    %w[/ /puzzle].each do |path|
      get path
      assert_equal HOME_TITLE, css_select("title").first.text, "#{path}: the tab says the site's name and nothing else"
      assert_select "meta[name=description][content=?]", HOME_DESCRIPTION
      assert_select "meta[property='og:title'][content=?]", HOME_TITLE
      assert_select "meta[name='twitter:title'][content=?]", HOME_TITLE
      assert_select "meta[property='og:description'][content=?]", HOME_DESCRIPTION
      assert_select "meta[name='twitter:description'][content=?]", HOME_DESCRIPTION
      # /puzzle is the same page, so it names / as the one address for it.
      assert_select "link[rel=canonical][href=?]", HOME_URL, count: 1
      assert_select "meta[property='og:url'][content=?]", HOME_URL
      # One main heading, out of sight like the About text.
      assert_select "h1", count: 1
      assert_select "h1.sr-only", text: HOME_HEADING
    end

    description = css_select("meta[name=description]").first["content"]
    heading = css_select("h1").first.text
    assert description.start_with?("Play the daily Set puzzle"), "the phrase people search for comes first"
    assert heading.start_with?("Daily Set Puzzle")
    assert_match(/12 cards hold exactly 6 sets/, description)
    assert_operator description.length, :<=, 170, "long descriptions are cut off in search results"
    # Honest about what opens: the page is the Puzzle, so neither says the Daily Deal is here.
    [description, heading].each { |text| assert_no_match(/Daily Deal|clear the/i, text) }
    # The hidden About text names the site and both dailies, the puzzle first.
    assert_select "section.sr-only p", text: /at Set Daily, with a daily Set puzzle \(find all 6 sets in 12 cards\) and a Daily Deal \(clear the whole deck\)/
  end

  test "the Daily Deal has its own page, title and description at /daily" do
    get "/daily"
    assert_equal DAILY_TITLE, css_select("title").first.text
    assert_select "meta[name=description][content=?]", DAILY_DESCRIPTION
    assert_select "meta[property='og:title'][content=?]", DAILY_TITLE
    assert_select "meta[name='twitter:title'][content=?]", DAILY_TITLE
    assert_select "meta[property='og:description'][content=?]", DAILY_DESCRIPTION
    assert_select "link[rel=canonical][href=?]", DAILY_URL, count: 1
    assert_select "meta[property='og:url'][content=?]", DAILY_URL
    assert_select "h1", count: 1
    assert_select "h1.sr-only", text: DAILY_HEADING
    assert_operator DAILY_DESCRIPTION.length, :<=, 170, "long descriptions are cut off in search results"
    assert_no_match(/daily set puzzle/i, DAILY_DESCRIPTION, "the front door is the page for that search")

    # A shared result keeps the page's own address, whatever the link carries.
    get "/daily", params: { r: DailyShare.token(number: 12, elapsed_ms: 161_400) }
    assert_equal DAILY_TITLE, css_select("title").first.text
    assert_select "link[rel=canonical][href=?]", DAILY_URL
  end

  test "every page's title ends with the site's name, and only the home page's is the name alone" do
    titles = %w[/ /daily /practice /m].to_h do |path|
      get path
      [path, css_select("title").first.text]
    end
    assert_equal "Set Daily", titles.delete("/")
    titles.each do |path, title|
      assert_match(/\A[^|]+ \| Set Daily\z/, title, path)
      assert_no_match(/\ASet Daily Deal/, title, "#{path}: the tab doesn't read as the Daily Deal's name")
    end
  end

  test "no two game pages share a title, a description or a canonical URL" do
    pages = %w[/ /daily /practice /m].map do |path|
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
      { "@type" => "WebSite", "@id" => "https://setdaily.app/#website", "name" => "Set Daily", "alternateName" => "setdaily.app",
        "url" => "https://setdaily.app/", "inLanguage" => "en" },
      site
    )

    assert_equal %w[VideoGame WebApplication], game.fetch("@type")
    assert_equal "https://setdaily.app/#game", game.fetch("@id")
    assert_equal "Set Daily", game.fetch("name")
    assert_equal "https://setdaily.app/", game.fetch("url")
    assert_nil game["alternateName"]
    assert_equal HOME_DESCRIPTION, game.fetch("description")
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

    # /puzzle is the same page, so it says the same.
    get "/puzzle"
    assert_equal data, JSON.parse(css_select("script[type='application/ld+json']").first.text)

    # A shared result changes the link preview, not what the site is.
    get "/", params: { r: DailyShare.token(kind: "puzzle", number: 5, elapsed_ms: 70_000) }
    assert_equal data, JSON.parse(css_select("script[type='application/ld+json']").first.text)

    %w[/daily /practice /m].each do |path|
      get path
      assert_select "script[type='application/ld+json']", count: 0
    end
  end
end
