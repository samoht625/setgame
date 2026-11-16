# frozen_string_literal: true

require "test_helper"
require "minitest/mock"

class BlogControllerTest < ActionDispatch::IntegrationTest
  include ActionView::Helpers::NumberHelper

  TITLE = SpottingSets::TITLE
  URL = "https://setdaily.app/blog/spotting-sets"
  # The saved numbers as they are on disk, read without SpottingSets.
  SAVED = JSON.parse(Rails.root.join("config/blog/spotting_sets.json").read)
  WORDS = %w[zero one two three four five six seven eight nine ten].freeze

  def text_of(selector)
    css_select(selector).map { |node| node.text.squish }
  end

  # The post's running text: its paragraphs, without the charts and their captions.
  def prose
    text_of("main .prose > p").join(" ")
  end

  def tenths(ms)
    format("%.1fs", ms / 1000.0)
  end

  # Median times of the saved kinds with this many features all different, read off their labels.
  def saved_medians(differences)
    SAVED.fetch("kinds").select do |kind|
      label = kind.fetch("label")
      differences == (label == "all four" ? 4 : label.start_with?("all but ") ? 3 : label.count("+") + 1)
    end.map { |kind| kind.fetch("median_ms") }
  end

  def saved_median(label)
    SAVED.fetch("kinds").find { |kind| kind.fetch("label") == label }.fetch("median_ms")
  end

  def whole_range(medians)
    medians.minmax.map { |ms| (ms / 1000.0).round }.uniq.join("–")
  end

  test "the post has its headline as title, heading and link previews, and its own address" do
    get "/blog/spotting-sets"
    assert_response :success

    assert_select "title", "#{TITLE} | Set Daily"
    assert_select "h1", count: 1, text: TITLE
    assert_select "meta[property='og:title'][content=?]", TITLE
    assert_select "meta[name='twitter:title'][content=?]", TITLE
    # As written in the page: the quotes are there as themselves, escaped neither once nor twice.
    assert_includes response.body, "<title>#{TITLE} | Set Daily</title>"
    assert_includes response.body, %(<meta property="og:title" content="#{TITLE}">)
    assert_includes response.body, %(<meta name="twitter:title" content="#{TITLE}">)
    assert_includes response.body, ">#{TITLE}</h1>"
    refute_match(/&amp;(?:quot|[lr]dquo|#)|&quot;all different|&[lr]dquo;/, response.body)

    assert_select "link[rel=canonical][href=?]", URL
    assert_select "meta[property='og:url'][content=?]", URL
    assert_select "meta[property='og:type'][content='article']"
    assert_select "meta[property='og:site_name'][content='Set Daily']"
    description = css_select("meta[name=description]").first["content"]
    assert_equal SpottingSets::DESCRIPTION, description
    assert_operator description.length, :>, 80
    assert_select "meta[property='og:description'][content=?]", description
    assert_select "meta[name='twitter:description'][content=?]", description
    assert_select "meta[property='og:image'][content=?]", "https://setdaily.app/og-image.png"
    assert_select "meta[name='twitter:image'][content=?]", "https://setdaily.app/og-image.png"
    assert_select "meta[name='twitter:card'][content='summary_large_image']"

    data = JSON.parse(css_select("script[type='application/ld+json']").first.text)
    assert_equal ["BlogPosting", TITLE, URL, description], data.values_at("@type", "headline", "url", "description")
    assert_equal SpottingSets::PUBLISHED_ON.iso8601, data.fetch("datePublished")

    assert_select "#site-header[data-page='blog']", 1, "the site's header and menu"
    assert_select "#root", 0, "no game is mounted here"
    assert_select "main a[href='/blog']", minimum: 1
  end

  test "the post links to the game and to the live numbers, and says when its own were taken" do
    get "/blog/spotting-sets"

    assert_select "main .prose p a[href='/']", "Puzzle"
    assert_select "main .prose p a[href='/daily']", "Daily Deal"
    assert_select "main .prose a[href='/stats']", minimum: 2
    assert_includes prose, "a new Puzzle every day (12 cards hiding exactly 6 sets) and a Daily Deal everyone plays from the same cards"
    assert_select "main header time[datetime='2026-11-15T23:09:00-08:00']", "Nov 15, 2026"
    assert_includes text_of("main header .dateline").first, "Numbers as of Nov 15, 2026"
    text_of("main figcaption").each { |caption| assert_includes caption, "Numbers as of Nov 15, 2026" }
    assert_equal ["Each extra difference costs time", "Not all features are equal", "People skip the hard ones"], text_of("main article h2")
  end

  test "the chart is the stats page's How fast, drawn from the saved numbers" do
    get "/blog/spotting-sets"
    kinds = SAVED.fetch("kinds")

    assert_equal 15, kinds.length
    assert_select "main .card.kinds li.kind", 15
    assert_equal kinds.map { |k| k.fetch("label") }, text_of("main .kind .kind-label"), "every kind, fastest first"
    assert_equal kinds.map { |k| tenths(k.fetch("median_ms")) }, text_of("main .kind .kind-med")
    assert_equal %w[0s 5s 10s 15s 20s], text_of("main .kind-scale i"), "on the same 0–20s scale"
    assert_select "main .kind .set svg.c", 45, "three example cards a row"
    kinds.zip(css_select("main .kind")).each do |saved, row|
      track = row.at_css(".kind-track")
      assert_equal "middle half #{tenths(saved.fetch('p25_ms'))} to #{tenths(saved.fetch('p75_ms'))}", track["aria-label"]
      assert track["title"].end_with?("· #{number_with_delimiter(saved.fetch('n'))} finds"), saved.fetch("label")
      left = (saved.fetch("p25_ms") * 100.0 / 20_000).round(2)
      right = ([saved.fetch("p75_ms"), 20_000].min * 100.0 / 20_000).round(2)
      assert_equal "left:#{left}%;width:#{(right - left).round(2)}%", row.at_css(".kind-iqr")["style"], "the middle half of #{saved.fetch('label')}"
      assert_equal "left:#{(saved.fetch('median_ms') * 100.0 / 20_000).round(2)}%", row.at_css(".kind-mid")["style"]
    end
    # The first and last rows, as the stats page drew them when the numbers were taken.
    assert_equal ["left:10.28%;width:18.26%", "left:40.72%;width:59.28%"], [css_select("main .kind-iqr").first, css_select("main .kind-iqr").last].map { |bar| bar["style"] }
    assert_equal ["left:14.98%", "left:75.06%"], [css_select("main .kind-mid").first, css_select("main .kind-mid").last].map { |line| line["style"] }
    assert_select "symbol#st-oval, #st-oval", minimum: 1, message: "with the shapes the cards are drawn from"
  end

  test "What gets found is the stats page's too, with the saved shares" do
    get "/blog/spotting-sets"

    assert_select "main table.shares[aria-labelledby='h-skipped']", 1
    assert_select "main h2#h-skipped", "People skip the hard ones"
    rows = css_select("main table.shares tbody tr").map { |row| row.css("th, td.n").map { |cell| cell.text.squish } }
    assert_equal [["1 different", "13.4%", "10%"], ["2 different", "34.0%", "30%"], ["3 different", "38.1%", "40%"], ["4 different", "14.4%", "20%"]], rows
    assert_equal SAVED.fetch("shares").values.map { |share| format("%.1f%%", share) }, rows.map { |row| row[1] }
  end

  test "every figure in the text is the saved numbers'" do
    get "/blog/spotting-sets"
    text = prose

    assert_includes text, "That’s now #{number_with_delimiter(SAVED.fetch('sets_found'))} finds from #{number_with_delimiter(SAVED.fetch('players'))} players"

    fastest = SAVED.fetch("kinds").map { |k| k.fetch("median_ms") }.min
    all_four = saved_median("all four")
    assert_includes text, "When one feature differs, the median find takes #{whole_range(saved_medians(1))} seconds. " \
                          "Two differences take #{whole_range(saved_medians(2))}, three take #{whole_range(saved_medians(3))}. " \
                          "All four different takes #{(all_four / 1000.0).round} seconds, #{WORDS.fetch((all_four.to_f / fastest).round)} times the easiest."

    # What the sentences say beyond their numbers has to be so, too.
    one = SAVED.fetch("kinds").select { |k| saved_medians(1).include?(k.fetch("median_ms")) }.map { |k| k.fetch("label") }
    assert_equal %w[number shape], one.first(2).sort, "shape and number are the fastest"
    assert_equal tenths(saved_median("shape")), tenths(saved_median("number")), "and print the same, so “each” is right"
    assert_equal (saved_median("color") / 1000.0).round, (saved_median("shading") / 1000.0).round, "color and shading round to the same second"
    three = SAVED.fetch("kinds").select { |k| k.fetch("label").start_with?("all but ") }.map { |k| k.fetch("label") }
    assert_equal ["all but number", "all but shape"], three.last(2).sort, "keeping shape or number the same is slowest"
    assert_equal tenths(saved_median("all but shape")), tenths(saved_median("all but number"))
    assert_includes text, "Shape and number are fastest (#{tenths(saved_median('shape'))} each), color and shading about #{(saved_median('color') / 1000.0).round}s. " \
                          "Among three-difference sets the slowest are the ones that keep shape or number the same (#{tenths(saved_median('all but shape'))} each)"

    shares = SAVED.fetch("shares")
    assert_includes text, "20% of the 1,080 possible sets have all four features different, but they’re only #{shares.fetch('4').round}% of finds; " \
                          "one-difference sets are #{shares.fetch('1').round}% of finds vs 10% by chance."
    assert_equal [10, 20, 1080], [SetStats::CHANCE[1], SetStats::CHANCE[4], SetStats::TOTAL_SETS]
    assert_operator shares.fetch("4"), :<, SetStats::CHANCE[4], "found less often than chance"
    assert_operator shares.fetch("1"), :>, SetStats::CHANCE[1], "found more often than chance"
  end

  test "the post as published: the figures a reader sees" do
    get "/blog/spotting-sets"
    text = prose

    assert_includes text, "That’s now 35,959 finds from 313 players"
    assert_includes text, "the median find takes 3–4 seconds. Two differences take 4–8, three take 7–11. All four different takes 15 seconds, five times the easiest."
    assert_includes text, "Shape and number are fastest (3.0s each), color and shading about 4s."
    assert_includes text, "keep shape or number the same (11.0s each)"
    assert_includes text, "they’re only 14% of finds; one-difference sets are 13% of finds vs 10% by chance."
    assert_equal %w[3.0s 3.0s 3.9s 4.0s 4.1s 5.4s 5.8s 5.9s 6.1s 6.8s 7.7s 8.0s 11.0s 11.0s 15.0s], text_of("main .kind .kind-med")
  end

  test "no figure is typed into the text: with other numbers saved, the text and the charts follow" do
    kinds = SAVED.fetch("kinds").map { |k| k.transform_keys(&:to_sym).merge(median_ms: k.fetch("median_ms") * 2, p25_ms: k.fetch("p25_ms") * 2, p75_ms: k.fetch("p75_ms") * 2) }
    other = SpottingSets.new(sets_found: 1_234_567, players: 89, taken_at: "2027-02-03T04:05:00-08:00", kinds: kinds, shares: { "1": 16.6, "2": 31.2, "3": 41.1, "4": 11.1 })

    SpottingSets.stub(:current, other) do
      get "/blog/spotting-sets"
    end
    text = prose

    assert_includes text, "That’s now 1,234,567 finds from 89 players"
    assert_includes text, "the median find takes 6–8 seconds. Two differences take 8–15, three take 14–22. All four different takes 30 seconds, five times the easiest."
    assert_includes text, "Shape and number are fastest (6.0s each), color and shading about 8s."
    assert_includes text, "keep shape or number the same (22.0s each)"
    assert_includes text, "they’re only 11% of finds; one-difference sets are 17% of finds vs 10% by chance."
    assert_equal "30.0s", text_of("main .kind .kind-med").last
    assert_equal %w[16.6% 31.2% 41.1% 11.1%], text_of("main table.shares td.n:not(.all)")
    assert_includes text_of("main header .dateline").first, "Numbers as of Feb 3, 2027"
    %w[35,959 313 3–4 4–8 7–11 3.0s 11.0s 14% 13%].each { |figure| refute_includes text, figure, "#{figure} was the saved number, not this one" }
  end

  test "the blog lists its posts, each with its headline, date and what it is about" do
    get "/blog"
    assert_response :success

    assert_select "title", "Blog | Set Daily"
    assert_select "link[rel=canonical][href='https://setdaily.app/blog']"
    assert_select "meta[property='og:url'][content='https://setdaily.app/blog']"
    assert_operator css_select("meta[name=description]").first["content"].length, :>, 80
    assert_select "h1", "Blog"
    assert_select "#site-header[data-page='blog']", 1
    assert_select "main ol.posts > li", Blog::POSTS.length
    assert_select "main ol.posts > li:first-child h2 a[href='/blog/spotting-sets']", TITLE
    assert_includes response.body, %(<a href="/blog/spotting-sets">#{TITLE}</a>)
    assert_select "main ol.posts > li:first-child time[datetime=?]", SpottingSets::PUBLISHED_ON.iso8601
    assert_select "main ol.posts > li:first-child p", SpottingSets::DESCRIPTION
  end

  test "a post is found by its slug alone" do
    assert_equal SpottingSets, Blog.find("spotting-sets")
    assert_equal "/blog/spotting-sets", Blog.path(SpottingSets)

    ["/blog/spotting", "/blog/spotting-sets.json", "/blog/Spotting-Sets", "/blog/spotting-sets/2", "/blog/index"].each do |path|
      get path
      assert_response :not_found, path
    end
  end

  test "the stats page still has both charts, now shared with the post" do
    Rails.cache.clear
    SoloScore.delete_all
    SoloGame.delete_all
    game = SoloGame.create!(id: SecureRandom.uuid, player_id: SecureRandom.uuid, seed: "1", started_at: 1.hour.ago, status: "completed", completed_at: Time.current)
    SoloScore.create!(solo_game: game, player_id: game.player_id, elapsed_ms: 9000, completed_at: Time.current,
      events: [{ "type" => "claim", "cards" => [1, 2, 3], "t_ms" => 2000 }, { "type" => "claim", "cards" => [4, 5, 6], "t_ms" => 9000 }])

    get "/stats"
    assert_response :success

    assert_select "title", "Stats | Set Daily"
    assert_select "link[rel=canonical][href='https://setdaily.app/stats']"
    assert_select "meta[property='og:title'][content='Stats | Set Daily']"
    assert_select "meta[name=description][content^='How fast people spot a set']"
    assert_select "meta[property='og:description'][content^='Timing from every set found on setdaily.app']"
    assert_select "meta[property='og:type'][content='website']"
    assert_select "#site-header[data-page='stats']", 1
    assert_equal ["number"], text_of("main .card.kinds .kind-label")
    assert_equal ["4.5s"], text_of("main .card.kinds .kind-med"), "the median of 2.0s and 7.0s"
    assert_select "main table.shares[aria-labelledby='h-shares'] tbody tr", 4
    assert_equal %w[100.0% 0.0% 0.0% 0.0%], text_of("main table.shares td.n:not(.all)")
  ensure
    Rails.cache.clear
  end
end
