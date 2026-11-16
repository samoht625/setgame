# frozen_string_literal: true

require "test_helper"

class SitemapControllerTest < ActionDispatch::IntegrationTest
  # Noon Pacific on Nov 15, 2026: Puzzle #22 is live and #21 closed ten hours ago.
  NOON = Time.utc(2026, 11, 15, 20)

  def urls
    doc = Nokogiri::XML(response.body) { |config| config.strict }
    doc.remove_namespaces!
    doc.xpath("/urlset/url").to_h { |url| [url.at_xpath("loc").text, url.at_xpath("lastmod")&.text] }
  end

  test "sitemap.xml lists the site's pages and every past day of both dailies, with lastmod" do
    travel_to NOON do
      SoloGame.create!(id: SecureRandom.uuid, player_id: SecureRandom.uuid, seed: "1", status: "open", started_at: Time.current, daily_on: Date.new(2026, 11, 12))

      get "/sitemap.xml"
      assert_response :success
      assert_equal "application/xml", response.media_type
      assert_includes response.headers["Cache-Control"], "public"
      assert_includes response.headers["Cache-Control"], "max-age=3600"
      assert_nil response.headers["Set-Cookie"], "the same document for everyone"

      listed = urls
      site = %w[/ /daily /practice /m /stats /archive].map { |path| "https://setdaily.app#{path}" }
      assert_equal site, listed.keys.first(6)
      past_puzzles = (1..21).map { |number| "https://setdaily.app/puzzle/#{number}" }
      past_deals = (1..3).map { |number| "https://setdaily.app/daily/#{number}" }
      assert_equal (site + past_puzzles + past_deals).sort, listed.keys.sort
      refute_includes listed.keys, "https://setdaily.app/puzzle", "the Puzzle is listed once, as the home page"
      (past_puzzles + past_deals + ["https://setdaily.app/", "https://setdaily.app/daily", "https://setdaily.app/archive"]).each do |loc|
        assert_match(/\A2026-\d\d-\d\d\z/, listed.fetch(loc), "#{loc} has a lastmod")
      end
      assert_equal "2026-11-15", listed.fetch("https://setdaily.app/puzzle/21")
      assert_equal "2026-10-26", listed.fetch("https://setdaily.app/puzzle/1")
      assert_equal "2026-11-13", listed.fetch("https://setdaily.app/daily/1")

      listed.each_key do |loc|
        get URI(loc).path
        assert_response :success, "#{loc} is in the sitemap, so it must be a page"
        assert_equal loc, css_select("link[rel=canonical]").first["href"], "and its own canonical URL"
      end
    end
  end

  test "robots.txt points at it and no static file shadows it" do
    assert_includes Rails.root.join("public/robots.txt").read, "Sitemap: https://setdaily.app/sitemap.xml"
    refute Rails.root.join("public/sitemap.xml").exist?
    assert_equal "/sitemap.xml", sitemap_path
  end

  test "only /sitemap.xml answers" do
    get "/sitemap"
    assert_response :not_found
    get "/sitemap.xml.gz"
    assert_response :not_found
  end
end
