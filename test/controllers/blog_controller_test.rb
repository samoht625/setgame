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
  FEATURES = %w[number color shape shading].freeze

  def text_of(selector)
    css_select(selector).map { |node| node.text.squish }
  end

  # The post's running text: its standfirst, paragraphs and notes, without the charts and their captions.
  def prose
    text_of("main .deck, main .prose > p, main .notes li").join(" ")
  end

  def tenths(ms)
    format("%.1fs", ms / 1000.0)
  end

  def count(number)
    number_with_delimiter(number)
  end

  # The features that are all different across three cards, worked out from the cards themselves.
  def differing(cards)
    attributes = cards.map { |card| Rules.card_attributes(card) }
    FEATURES.select { |feature| attributes.map { |card| card.fetch(feature.to_sym) }.uniq.length == 3 }
  end

  # The features three cards have in common, color and shading first, as the post lists them.
  def shared(cards)
    %w[color shading number shape] - differing(cards)
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

    assert_select "main .play p a[href='/']", "Puzzle"
    assert_select "main .play p a[href='/daily']", "Daily Deal"
    assert_select "main .play a.btn[href='/']", "Play today’s Puzzle"
    assert_select "main .play a.btn[href='/daily']", "Play the Daily Deal"
    assert_select "main .prose a[href='/stats']", minimum: 2
    assert_includes text_of("main .play p").first, "a new Puzzle every day (12 cards hiding exactly 6 sets) and a Daily Deal everyone plays from the same cards"
    assert_select "main header time[datetime='2026-11-15T23:09:00-08:00']", "Nov 15, 2026"
    assert_includes text_of("main header .dateline").first, "Numbers as of Nov 15, 2026"
    # Every chart that shows the saved numbers says when they were taken; so does the small print.
    %w[figure.wide:not(.pair) figure.pair figure:not([class])].each { |figure| assert_includes text_of("main #{figure} figcaption").first, "Numbers as of Nov 15, 2026", figure }
    assert_includes text_of("main .notes li").last, "Everything here was frozen on Nov 15, 2026."
    assert_equal ["Every difference multiplies the search", "Color and shading do the work", "The hard ones get left on the board", "The quickest and the rarest", "How this was counted"],
                 text_of("main article h2")
  end

  test "the post opens on the two ends of the chart: the easiest kind of set and the hardest, each drawn with its time" do
    get "/blog/spotting-sets"
    easiest, hardest = SAVED.fetch("kinds").minmax_by { |kind| kind.fetch("median_ms") }

    assert_equal ["shape", "all four"], [easiest, hardest].map { |kind| kind.fetch("label") }
    assert_equal ["#{tenths(easiest.fetch('median_ms'))} Only shape differs", "#{tenths(hardest.fetch('median_ms'))} All four features differ"], text_of("main .versus .time")
    assert_equal ["3.0s Only shape differs", "15.0s All four features differ"], text_of("main .versus .time")
    sides = css_select("main .versus .side")
    [easiest, hardest].zip(sides).each do |kind, side|
      assert_equal css_select("main .kind").find { |row| row.at_css(".kind-label").text == kind.fetch("label") }.css("svg.c").map { |card| card["aria-label"] },
                   side.css("svg.c").map { |card| card["aria-label"] }, "the example the chart draws for #{kind.fetch('label')}"
    end
    # Each bar is that kind's median against the slowest.
    assert_equal ["width:#{(easiest.fetch('median_ms') * 100.0 / hardest.fetch('median_ms')).round(1)}%", "width:100.0%"], sides.map { |side| side.at_css(".len i")["style"] }
    assert_equal "width:20.0%", sides.first.at_css(".len i")["style"]
  end

  test "the chart is the stats page's How fast, drawn from the saved numbers without clipping" do
    get "/blog/spotting-sets"
    kinds = SAVED.fetch("kinds")

    assert_equal 15, kinds.length
    assert_select "main .card.kinds li.kind", 15
    assert_select "main .kind-iqr.clipped", 0, "the 0–30s scale fits the 28.0s p75 without clipping"
    assert_equal kinds.map { |k| k.fetch("label") }, text_of("main .kind .kind-label"), "every kind, fastest first"
    assert_equal kinds.map { |k| tenths(k.fetch("median_ms")) }, text_of("main .kind .kind-med")
    assert_equal %w[0s 5s 10s 15s 20s 25s 30s], text_of("main .kind-scale i"), "on the shared 0–30s scale"
    assert_select "main .kind .set svg.c", 45, "three example cards a row"
    kinds.zip(css_select("main .kind")).each do |saved, row|
      track = row.at_css(".kind-track")
      assert_equal "middle half #{tenths(saved.fetch('p25_ms'))} to #{tenths(saved.fetch('p75_ms'))}", track["aria-label"]
      assert track["title"].end_with?("· #{number_with_delimiter(saved.fetch('n'))} finds"), saved.fetch("label")
      left = (saved.fetch("p25_ms") * 100.0 / 30_000).round(2)
      right = ([saved.fetch("p75_ms"), 30_000].min * 100.0 / 30_000).round(2)
      assert_equal "left:#{left}%;width:#{(right - left).round(2)}%", row.at_css(".kind-iqr")["style"], "the middle half of #{saved.fetch('label')}"
      assert_equal "left:#{(saved.fetch('median_ms') * 100.0 / 30_000).round(2)}%", row.at_css(".kind-mid")["style"]
    end
    # The first and last rows on the 0–30s scale.
    assert_equal ["left:6.85%;width:12.18%", "left:27.15%;width:66.18%"], [css_select("main .kind-iqr").first, css_select("main .kind-iqr").last].map { |bar| bar["style"] }
    assert_equal ["left:9.99%", "left:50.04%"], [css_select("main .kind-mid").first, css_select("main .kind-mid").last].map { |line| line["style"] }
    assert_select "symbol#st-oval, #st-oval", minimum: 1, message: "with the shapes the cards are drawn from"
  end

  test "What gets found is the stats page's too, with the saved shares" do
    get "/blog/spotting-sets"

    assert_select "main table.shares[aria-labelledby='h-skipped']", 1
    assert_select "main h2#h-skipped", "The hard ones get left on the board"
    rows = css_select("main table.shares tbody tr").map { |row| row.css("th, td.n").map { |cell| cell.text.squish } }
    assert_equal [["1 different", "13.4%", "10%"], ["2 different", "34.0%", "30%"], ["3 different", "38.1%", "40%"], ["4 different", "14.4%", "20%"]], rows
    assert_equal SAVED.fetch("shares").values.map { |share| format("%.1f%%", share) }, rows.map { |row| row[1] }
  end

  test "every figure in the text is the saved numbers'" do
    get "/blog/spotting-sets"
    text = prose

    kinds = SAVED.fetch("kinds")
    found, players = SAVED.values_at("sets_found", "players")
    timed = kinds.sum { |kind| kind.fetch("n") }
    easiest, hardest = kinds.minmax_by { |kind| kind.fetch("median_ms") }
    post = SpottingSets.current
    fit = post.multiplicative_fit

    # The opening: what the numbers are, and how many of them there are.
    assert_includes text, "#{count(timed)} timed finds on Set Daily show how each differing feature multiplies search time"
    assert_includes text, "sets like the first take a median of #{tenths(easiest.fetch('median_ms'))}; sets like the second take #{tenths(hardest.fetch('median_ms'))}, " \
                          "#{WORDS.fetch((hardest.fetch('median_ms').to_f / easiest.fetch('median_ms')).round)} times as long."
    assert_includes text, "giving #{kinds.length} kinds in all"
    assert_includes text, "#{count(found)} sets found by #{count(players)} players so far, #{count(timed)} of them with clean inter-find times"

    # Every difference multiplies the search.
    assert_equal (1..4).map { |differences| "#{differences} different #{whole_range(saved_medians(differences))}s" }, text_of("main .stairs > div")
    assert_equal [1, 2, 3, 4], css_select("main .stairs > div").map { |step| step.css(".dots .on").length }, "one dot for each feature that differs"
    assert_includes text, "explains #{format('%.1f%%', fit[:r_squared] * 100)} of the variance (R2 = #{format('%.3f', fit[:r_squared])}, from a #{tenths(fit[:base_ms])} baseline): " \
                          "making color differ multiplies find time by #{format('%.2f×', fit[:multipliers]['color'])}, " \
                          "shading by #{format('%.2f×', fit[:multipliers]['shading'])}, " \
                          "shape by #{format('%.2f×', fit[:multipliers]['shape'])}, " \
                          "and number by #{format('%.2f×', fit[:multipliers]['number'])}."
    assert_includes text, "three quarters of finds finish within #{tenths(easiest.fetch('p75_ms'))}, while a quarter of “all different” finds drag past #{tenths(hardest.fetch('p75_ms'))}."
    assert_equal "all four", hardest.fetch("label"), "the slowest kind is the one the sentences name"
    assert saved_medians(1).max < saved_medians(2).max && saved_medians(2).max < saved_medians(3).max && saved_medians(3).max < saved_medians(4).min, "the medians do climb"
    assert saved_medians(1).min < saved_medians(2).min && saved_medians(2).min < saved_medians(3).min, "from the bottom of each step too"

    # Color and shading do the work.
    assert_includes text, "With two features shared, color and shading together are the fastest pair at #{tenths(saved_median('number + shape'))}, " \
                          "and number and shape together are the slowest at #{tenths(saved_median('color + shading'))}. Every kind that shares color beats every kind that does not, " \
                          "though the four in the middle sit within a second of each other."
    assert_includes text, "sharing color alone (#{tenths(saved_median('all but color'))}) beats sharing both number and shape (#{tenths(saved_median('color + shading'))}) " \
                          "by nearly a full second, and sharing shading alone (#{tenths(saved_median('all but shading'))}) nearly ties them."
    assert_includes text, "Number and shape on their own help much less: #{tenths(saved_median('all but shape'))} each, against #{tenths(saved_median('all four'))} for sharing nothing."
    # What those sentences say beyond their numbers has to be so, too.
    two = kinds.select { |kind| shared(kind.fetch("cards")).length == 2 }
    assert_equal [%w[color shading], %w[number shape]], [two.first, two.last].map { |kind| shared(kind.fetch("cards")) }, "the fastest and the slowest pair"
    with_color, without = two.partition { |kind| shared(kind.fetch("cards")).include?("color") }.map { |part| part.map { |kind| kind.fetch("median_ms") } }
    assert_equal [3, 3], [with_color.length, without.length]
    assert_operator with_color.max, :<, without.min, "every kind that shares color beats every kind that does not"
    middle = two[1..4].map { |kind| kind.fetch("median_ms") }
    assert_operator middle.max - middle.min, :<, 1000, "and the four between the fastest and the slowest are within a second"
    assert_operator saved_median("all but color"), :<, saved_median("color + shading"), "sharing color alone beats sharing both number and shape"
    one = kinds.select { |kind| shared(kind.fetch("cards")).length == 1 }
    assert_equal [%w[color], %w[shading]], one.first(2).map { |kind| shared(kind.fetch("cards")) }, "color helps most, then shading"
    assert_equal [%w[number], %w[shape]], one.last(2).map { |kind| shared(kind.fetch("cards")) }
    assert_equal tenths(saved_median("all but shape")), tenths(saved_median("all but number")), "they print the same, so “each” is right"
    assert_operator saved_median("all but shading"), :<, [saved_median("all but shape"), saved_median("all but number")].min
    assert_operator [saved_median("all but shape"), saved_median("all but number")].max, :<, saved_median("all four")

    # The hard ones get left on the board.
    shares = SAVED.fetch("shares")
    assert_includes text, "contains exactly 1,080 possible sets (81 × 80 / 6)."
    assert_includes text, "In play, they are found at nearly the same rate: #{format('%.1f%%', shares.fetch('4'))} of finds against #{format('%.1f%%', shares.fetch('1'))}."
    assert_includes text, "an average one-difference set is found #{format('%.1f', post.avg_finds_per_set_by_diff(1))} times in the timed data, " \
                          "while an average all-different set is found #{format('%.1f', post.avg_finds_per_set_by_diff(4))} times"
    assert_equal [10, 20, 1080], [SetStats::CHANCE[1], SetStats::CHANCE[4], SetStats::TOTAL_SETS]
    assert_operator shares.fetch("4"), :<, SetStats::CHANCE[4], "found less often than chance"
    assert_operator shares.fetch("1"), :>, SetStats::CHANCE[1], "found more often than chance"

    # The quickest and the rarest.
    quickest, least, per_set = SAVED.values_at("quickest", "least_found", "finds_per_set")
    assert_includes text, "the #{WORDS.fetch(quickest.length)} individual sets with the lowest median time, and the #{WORDS.fetch(least.length)} found least often. " \
                          "Each of the rarest sets has been found only #{least.map { |set| set.fetch('n') }.minmax.join(' to ')} times, " \
                          "compared with #{per_set.fetch('median')} for the median set and #{per_set.fetch('max')} for the most popular."
    alike = quickest.count { |set| (%w[color shading] - shared(set.fetch("cards"))).empty? }
    assert_includes text, "All #{WORDS.fetch(quickest.length)} of the quickest sets differ in a single feature, and in #{WORDS.fetch(alike)} of them the three cards share both color and shading."
    assert_includes text, "All #{WORDS.fetch(least.length)} of the least found differ in all four features."
    assert quickest.all? { |set| differing(set.fetch("cards")).length == 1 }, "all of the quickest differ in a single feature"
    assert least.all? { |set| differing(set.fetch("cards")).length == 4 }, "all of the least found differ in all four"
    assert_equal ["The fastest single find so far #{tenths(SAVED.fetch('fastest_find').fetch('ms'))}"], text_of("main .fact p")
    assert_includes text_of("main .fact figcaption").first, "pre-spotted"

    # How this was counted.
    assert_includes text, "#{count(found)} sets were found in all, and #{count(timed)} of them have a time. The other #{count(found - timed)} either came more than " \
                          "#{WORDS.fetch(SetStats::IDLE_MS / 60_000)} minutes after the previous find, most likely a tab left open, or were in unfinished games that kept only a count."
    most = SAVED.fetch("most_games")
    assert_includes text, "the #{WORDS.fetch(most.length)} most active named players finished #{count(most.sum)} of the #{count(SAVED.fetch('games_finished'))} completed games."
  end

  test "the count in the headline sentence adds up, and nothing says the Puzzle is timed" do
    get "/blog/spotting-sets"
    text = prose

    # 35,959 sets found; 35,335 of them timed and in the chart; the rest accounted for.
    assert_equal 35_959, 35_335 + 624
    assert_includes text, "35,959 sets found by 313 players so far, 35,335 of them with clean inter-find times"
    assert_includes text, "35,959 sets were found in all, and 35,335 of them have a time. The other 624"
    assert_equal 35_335, css_select("main .kind .kind-track").sum { |track| track["title"][/· ([\d,]+) finds\z/, 1].delete(",").to_i }, "the chart's rows add up to the timed finds"

    assert_includes text, "Set Daily logs how long each find takes in its Daily Deal and Practice games"
    assert_includes text, "The numbers cover Set Daily’s Daily Deal and Practice games. Finds in the daily Puzzle are not in them:"
    [text, SpottingSets::DESCRIPTION, css_select("meta[name=description]").first["content"]].each do |words|
      refute_match(/every (find|set)|all finds/i, words, "not every find is timed: the Puzzle's are not in these numbers")
    end
    assert_includes SpottingSets::DESCRIPTION, "Daily Deal and Practice"

    get "/blog"
    refute_match(/every (find|set)/i, css_select("meta[name=description]").first["content"])
  end

  test "the kinds are shown again by what their cards share, color and shading picked out" do
    get "/blog/spotting-sets"
    kinds = SAVED.fetch("kinds")

    assert_equal ["Two features shared", "One feature shared"], text_of("main .shared h3")
    expected = [2, 1].flat_map { |features| kinds.select { |kind| shared(kind.fetch("cards")).length == features } }
    assert_equal 10, expected.length
    assert_equal expected.map { |kind| "Same #{shared(kind.fetch('cards')).join(' ')} #{tenths(kind.fetch('median_ms'))}" }, text_of("main .shared li")
    assert_equal ["Same color shading 4.1s", "Same color shape 5.4s", "Same color number 5.8s", "Same shading shape 5.9s", "Same shading number 6.1s", "Same number shape 7.7s",
                  "Same color 6.8s", "Same shading 8.0s", "Same number 11.0s", "Same shape 11.0s"], text_of("main .shared li")
    rows = css_select("main .shared li")
    expected.zip(rows).each do |kind, row|
      assert_equal shared(kind.fetch("cards")) & %w[color shading], row.css(".chips .strong").map(&:text), kind.fetch("label")
      assert_equal 3, row.css("svg.c").length
      assert_equal "width:#{(kind.fetch('median_ms') * 100.0 / kinds.last.fetch('median_ms')).round(1)}%", row.at_css(".len i")["style"]
    end
  end

  test "the two lists are the stats page's Quickest to spot and Least found, as saved" do
    get "/blog/spotting-sets"
    quickest, least = SAVED.values_at("quickest", "least_found")

    assert_equal ["Quickest to spot", "Least found"], text_of("main .pair h3")
    lists = css_select("main .pair ol.sets")
    assert_equal [10, 10], lists.map { |list| list.css("li").length }
    assert_equal quickest.map { |set| "#{tenths(set.fetch('median_ms'))}#{count(set.fetch('n'))} finds" }, lists.first.css(".val").map { |value| value.text.squish }
    assert_equal least.map { |set| "#{set.fetch('n')}×" }, lists.last.css(".val").map { |value| value.text.squish }
    assert_equal %w[10× 10× 10× 11× 12× 13× 14× 14× 14× 14×], lists.last.css(".val").map(&:text)
    assert_equal "2.1s46 finds", lists.first.at_css(".val").text
    # The cards drawn are the saved sets: the first of each list, as the stats page had them.
    assert_equal ["3 solid green squiggles", "3 solid green diamonds", "3 solid green ovals"], lists.first.at_css("li").css("svg.c").map { |card| card["aria-label"] }
    assert_equal ["2 solid red diamonds", "3 striped purple squiggles", "1 open green oval"], lists.last.at_css("li").css("svg.c").map { |card| card["aria-label"] }
    assert_equal ["1 solid purple diamond", "2 solid purple diamonds", "3 solid purple diamonds"], css_select("main .fact svg.c").map { |card| card["aria-label"] }
  end

  test "the post as published: the figures a reader sees" do
    get "/blog/spotting-sets"
    text = prose

    assert_includes text, "35,335 timed finds on Set Daily show how each differing feature multiplies search time, and why sharing color alone beats sharing shape and number."
    assert_includes text, "sets like the first take a median of 3.0s; sets like the second take 15.0s, five times as long."
    assert_includes text, "35,959 sets found by 313 players so far, 35,335 of them with clean inter-find times (excluding gaps over five minutes). Here are all 15 kinds, fastest first."
    assert_equal ["1 different 3–4s", "2 different 4–8s", "3 different 7–11s", "4 different 15s"], text_of("main .stairs > div"), "two differences take 4 to 8 seconds"
    assert_includes text, "explains 99.4% of the variance (R2 = 0.994, from a 2.1s baseline): making color differ multiplies find time by 1.97×, shading by 1.85×, shape by 1.39×, and number by 1.36×."
    assert_includes text, "three quarters of finds finish within 5.7s, while a quarter of “all different” finds drag past 28.0s."
    assert_includes text, "color and shading together are the fastest pair at 4.1s, and number and shape together are the slowest at 7.7s."
    assert_includes text, "sharing color alone (6.8s) beats sharing both number and shape (7.7s) by nearly a full second, and sharing shading alone (8.0s) nearly ties them."
    assert_includes text, "Number and shape on their own help much less: 11.0s each, against 15.0s for sharing nothing."
    assert_includes text, "In play, they are found at nearly the same rate: 14.4% of finds against 13.4%."
    assert_includes text, "an average one-difference set is found 44.0 times in the timed data, while an average all-different set is found 23.6 times"
    assert_includes text, "Each of the rarest sets has been found only 10 to 14 times, compared with 31 for the median set and 80 for the most popular."
    assert_includes text, "All ten of the quickest sets differ in a single feature, and in nine of them the three cards share both color and shading. Six are solid, three are striped, and one is open (the lone set in the top ten where color differs). All ten of the least found differ in all four features."
    assert_equal ["The fastest single find so far 0.8s"], text_of("main .fact p")
    assert_includes text, "The other 624 either came more than five minutes after the previous find"
    assert_includes text, "the ten most active named players finished 749 of the 1,312 completed games."
    assert_equal %w[3.0s 3.0s 3.9s 4.0s 4.1s 5.4s 5.8s 5.9s 6.1s 6.8s 7.7s 8.0s 11.0s 11.0s 15.0s], text_of("main .kind .kind-med")
  end

  test "no figure is typed into the text: with other numbers saved, the text and the charts follow" do
    kinds = SAVED.fetch("kinds").map do |k|
      k.transform_keys(&:to_sym).merge(n: k.fetch("n") + 1, median_ms: k.fetch("median_ms") * 2, p25_ms: k.fetch("p25_ms") * 2, p75_ms: k.fetch("p75_ms") * 2)
    end
    # The quickest list loses its one set that differs in color; the least found loses three.
    quickest = SAVED.fetch("quickest").reject.with_index { |_, index| index == 8 }.map { |set| set.transform_keys(&:to_sym).merge(median_ms: set.fetch("median_ms") + 5000) }
    least = SAVED.fetch("least_found").first(7).map { |set| set.transform_keys(&:to_sym).merge(n: set.fetch("n") + 20) }
    other = SpottingSets.new(
      sets_found: 1_234_567, players: 89, games_finished: 456, taken_at: "2027-02-03T04:05:00-08:00", kinds: kinds, shares: { "1": 16.6, "2": 31.2, "3": 41.1, "4": 11.1 },
      finds_per_set: { min: 30, max: 99, median: 52 }, quickest: quickest, least_found: least, fastest_find: { cards: [1, 2, 3], ms: 1200 }, most_games: [70, 60, 50]
    )

    SpottingSets.stub(:current, other) do
      get "/blog/spotting-sets"
    end
    text = prose

    assert_includes text, "35,350 timed finds on Set Daily show how each differing feature multiplies search time"
    assert_includes text, "sets like the first take a median of 6.0s; sets like the second take 30.0s, five times as long."
    assert_includes text, "1,234,567 sets found by 89 players so far, 35,350 of them with clean inter-find times"
    assert_equal ["6.0s Only shape differs", "30.0s All four features differ"], text_of("main .versus .time")
    assert_equal ["1 different 6–8s", "2 different 8–15s", "3 different 14–22s", "4 different 30s"], text_of("main .stairs > div")
    assert_includes text, "from a 4.3s baseline"
    assert_includes text, "finish within 11.4s, while a quarter of “all different” finds drag past 56.0s."
    assert_includes text, "the fastest pair at 8.1s, and number and shape together are the slowest at 15.4s."
    assert_includes text, "sharing color alone (13.7s) beats sharing both number and shape (15.4s)"
    assert_includes text, "Number and shape on their own help much less: 22.0s each, against 30.0s for sharing nothing."
    assert_includes text, "In play, they are found at nearly the same rate: 11.1% of finds against 16.6%."
    assert_includes text, "the nine individual sets with the lowest median time, and the seven found least often. Each of the rarest sets has been found only 30 to 34 times, " \
                          "compared with 52 for the median set and 99 for the most popular."
    assert_includes text, "All nine of the quickest sets differ in a single feature, and in nine of them the three cards share both color and shading. Six are solid, three are striped, and zero are open. All seven of the least found differ in all four features."
    assert_equal ["The fastest single find so far 1.2s"], text_of("main .fact p")
    assert_includes text, "1,234,567 sets were found in all, and 35,350 of them have a time. The other 1,199,217 either came"
    assert_includes text, "the three most active named players finished 180 of the 456 completed games."
    assert_includes text, "Everything here was frozen on Feb 3, 2027."

    assert_equal %w[0s 10s 20s 30s 40s 50s 60s], text_of("main .kind-scale i"), "the scale expands to 60s for 56s p75"
    assert_select "main .kind-iqr.clipped", 0
    assert_equal "30.0s", text_of("main .kind .kind-med").last
    assert_equal "Same color shading 8.1s", text_of("main .shared li").first
    assert_equal %w[16.6% 31.2% 41.1% 11.1%], text_of("main table.shares td.n:not(.all)")
    assert_equal [9, 7], css_select("main .pair ol.sets").map { |list| list.css("li").length }
    assert_equal "7.1s46 finds", css_select("main .pair ol.sets").first.at_css(".val").text
    assert_includes text_of("main header .dateline").first, "Numbers as of Feb 3, 2027"

    # Nothing of the saved numbers is left anywhere in the article.
    article = text_of("main article").first
    %w[35,959 35,335 313 624 749 1,312 3–4 4–8 7–11 3.0s 15.0s 28.0s 5.7s 4.1s 7.7s 6.8s 11.0s 0.8s 13.4% 14.4%].each do |figure|
      refute_includes article, figure, "#{figure} was the saved number, not this one"
    end
    refute_match(/\b2\.1s\b|\bten\b|10 to 14|31 for the median|80 for the most popular/, text)
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
    assert_equal %w[/ /daily /stats], css_select("main .elsewhere a").map { |link| link["href"] }, "and the way to the game, Puzzle first"
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

  test "blog index and post support conditional ETag caching and vary by player identity" do
    # First request sets the player cookie (@known_player_new is true); second establishes steady-state ETag.
    get "/blog"
    assert_response :success
    get "/blog"
    assert_response :success
    index_etag = response.headers["ETag"]
    assert index_etag.present?

    get "/blog", headers: { "If-None-Match" => index_etag }
    assert_response :not_modified

    get "/blog/spotting-sets"
    assert_response :success
    post_etag = response.headers["ETag"]
    assert post_etag.present?
    player_id = css_select("meta[name='setgame-player-id']").first["content"]

    get "/blog/spotting-sets", headers: { "If-None-Match" => post_etag }
    assert_response :not_modified

    # Changing a setting rendered in the page's identity meta tags changes the ETag.
    PlayerSetting.choose_two_card!(player_id, true)
    get "/blog/spotting-sets", headers: { "If-None-Match" => post_etag }
    assert_response :success
    refute_equal post_etag, response.headers["ETag"]
  end
end
