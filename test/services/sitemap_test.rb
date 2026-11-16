# frozen_string_literal: true

require "test_helper"
require "minitest/mock"

class SitemapTest < ActiveSupport::TestCase
  TODAY = Date.new(2026, 11, 15)

  def sitemap(daily_launch: Date.new(2026, 11, 12), last_closed: TODAY - 1)
    Sitemap.new(
      site: "https://setdaily.app/",
      today: TODAY,
      archives: [DailyArchive.new("daily", launch: daily_launch, last_closed: last_closed), DailyArchive.new("puzzle", launch: ClassicPuzzle::LAUNCH_DATE, last_closed: last_closed)]
    )
  end

  def urls(xml)
    doc = Nokogiri::XML(xml) { |config| config.strict }
    doc.remove_namespaces!
    doc.xpath("/urlset/url").to_h { |url| [url.at_xpath("loc").text, url.at_xpath("lastmod")&.text] }
  end

  test "the site's pages come first, then every closed day of both games, newest first" do
    xml = sitemap.to_xml
    listed = urls(xml)

    assert xml.start_with?(%(<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n))
    assert_equal %w[/ /daily /practice /m /stats /archive /puzzle/21 /daily/3 /puzzle/20 /daily/2 /puzzle/19 /daily/1 /puzzle/18].map { |path| "https://setdaily.app#{path}" },
                 listed.keys.first(13)
    assert_equal 6 + 3 + 21, listed.length
    assert_equal "https://setdaily.app/puzzle/1", listed.keys.last
    assert listed.keys.all? { |loc| loc.start_with?("https://setdaily.app/") }
    assert_equal listed.length, listed.keys.uniq.length
  end

  test "lastmod is the day a page last changed" do
    listed = urls(sitemap.to_xml)

    assert_equal "2026-11-15", listed.fetch("https://setdaily.app/"), "the dailies change every day"
    assert_equal "2026-11-15", listed.fetch("https://setdaily.app/daily")
    refute listed.key?("https://setdaily.app/puzzle"), "/puzzle is the home page again, which names / as its address"
    assert_equal "2026-11-15", listed.fetch("https://setdaily.app/stats")
    assert_nil listed.fetch("https://setdaily.app/practice"), "no made-up date for a page that doesn't change"
    assert_nil listed.fetch("https://setdaily.app/m")
    assert_equal "2026-11-15", listed.fetch("https://setdaily.app/archive"), "when its newest day joined"
    assert_equal "2026-11-15", listed.fetch("https://setdaily.app/puzzle/21"), "a day's page is final the day after"
    assert_equal "2026-11-15", listed.fetch("https://setdaily.app/daily/3")
    assert_equal "2026-10-26", listed.fetch("https://setdaily.app/puzzle/1")
    assert listed.values.compact.all? { |date| date.match?(/\A\d{4}-\d{2}-\d{2}\z/) && Date.iso8601(date) <= TODAY }, "never in the future"
  end

  test "today's and later days are never listed" do
    listed = urls(sitemap.to_xml).keys

    refute_includes listed, "https://setdaily.app/puzzle/22"
    refute_includes listed, "https://setdaily.app/daily/4"
    refute_includes listed, "https://setdaily.app/puzzle/23"

    in_grace = urls(sitemap(last_closed: TODAY - 2).to_xml)
    refute_includes in_grace.keys, "https://setdaily.app/puzzle/21", "yesterday, until it has closed"
    assert_includes in_grace.keys, "https://setdaily.app/puzzle/20"
    assert_equal "2026-11-14", in_grace.fetch("https://setdaily.app/archive")
  end

  test "with nothing archived it is the site's pages alone" do
    empty = Sitemap.new(site: "https://setdaily.app", today: TODAY, archives: [DailyArchive.new("daily", launch: nil, last_closed: TODAY - 1)])

    assert_equal %w[https://setdaily.app/ https://setdaily.app/daily https://setdaily.app/practice https://setdaily.app/m https://setdaily.app/stats], urls(empty.to_xml).keys
  end

  test "the current sitemap follows the clock: a day joins when it closes" do
    before = urls(Sitemap.current(Time.utc(2026, 11, 15, 9, 59, 59)))
    refute_includes before.keys, "https://setdaily.app/puzzle/21"
    assert_includes before.keys, "https://setdaily.app/puzzle/20"
    assert_equal "2026-11-15", before.fetch("https://setdaily.app/"), "today is already the 15th"

    after = urls(Sitemap.current(Time.utc(2026, 11, 15, 10, 0, 0)))
    assert_includes after.keys, "https://setdaily.app/puzzle/21"
    refute_includes after.keys, "https://setdaily.app/puzzle/22"
    assert_empty after.keys.grep(%r{/daily/}), "no Daily Deal has been played in this database"
  end

  test "it is built once per day boundary and cached in between" do
    Rails.stub(:cache, ActiveSupport::Cache::MemoryStore.new) do
      morning = Sitemap.current(Time.utc(2026, 11, 15, 18))
      assert_empty urls(morning).keys.grep(%r{/daily/})

      # Something that would change the document if it were built again.
      SoloGame.create!(id: SecureRandom.uuid, player_id: SecureRandom.uuid, seed: "1", status: "open", started_at: Time.current, daily_on: Date.new(2026, 11, 10))
      assert_equal morning, Sitemap.current(Time.utc(2026, 11, 15, 23)), "same day, same closed day: the cached document"

      midnight = urls(Sitemap.current(Time.utc(2026, 11, 16, 8, 0, 1)))
      assert_equal "2026-11-16", midnight.fetch("https://setdaily.app/"), "a new day is a new document"
      assert_includes midnight.keys, "https://setdaily.app/daily/5"
      refute_includes midnight.keys, "https://setdaily.app/daily/6", "the 15th has ended but not closed"
      refute_includes midnight.keys, "https://setdaily.app/puzzle/22"

      closed = urls(Sitemap.current(Time.utc(2026, 11, 16, 10, 0, 0)))
      assert_includes closed.keys, "https://setdaily.app/daily/6"
      assert_includes closed.keys, "https://setdaily.app/puzzle/22"
      refute_includes closed.keys, "https://setdaily.app/puzzle/23"
    end
  end
end
