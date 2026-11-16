# frozen_string_literal: true

require "date"

# sitemap.xml: the site's pages plus every closed day of the Daily Deal and
# the Puzzle. A day joins when it closes, which is also the last time its
# page changes, so that date is its lastmod.
#
# Plain Ruby: the archives and today's date come in, XML goes out
# (Sitemap.current supplies them and caches the result).
class Sitemap
  NAMESPACE = "http://www.sitemaps.org/schemas/sitemap/0.9"
  # A sitemap that lags a new day by this long only misses that day; it never lists one too early.
  MAX_AGE = 3600

  Entry = Struct.new(:path, :lastmod)

  CACHE_KEY = "sitemap/v2"

  # The whole document, built again only when a day starts or closes. One
  # cache entry, replaced in place, so the cache doesn't grow by a file a day.
  def self.current(now = Time.current)
    today = DailyPuzzle.today(now).date
    stamp = "#{today.iso8601}/#{DailyPuzzle.last_closed_date(now).iso8601}"
    cached = Rails.cache.read(CACHE_KEY)
    return cached[:xml] if cached.is_a?(Hash) && cached[:stamp] == stamp

    xml = new(site: ApplicationHelper::SITE_URL, today: today, archives: DailyArchive.all(now)).to_xml
    Rails.cache.write(CACHE_KEY, { stamp: stamp, xml: xml })
    xml
  end

  # `today` is the dailies' current day; `archives` one DailyArchive per game.
  def initialize(site:, today:, archives:)
    @site = site.to_s.chomp("/")
    @today = today
    @archives = archives.reject(&:empty?)
  end

  def entries
    pages + days
  end

  def to_xml
    lines = ['<?xml version="1.0" encoding="UTF-8"?>', %(<urlset xmlns="#{NAMESPACE}">)]
    entries.each do |entry|
      lines << "  <url>"
      lines << "    <loc>#{escape(@site + entry.path)}</loc>"
      lines << "    <lastmod>#{entry.lastmod.iso8601}</lastmod>" if entry.lastmod
      lines << "  </url>"
    end
    lines << "</urlset>"
    lines.join("\n") + "\n"
  end

  private

  # The two dailies and /stats change every day. Practice and multiplayer
  # are the same page every day, so they carry no lastmod rather than a made-up one.
  # The Puzzle is listed once, as the home page: /puzzle is the same page and names / as its canonical address.
  def pages
    list = [Entry.new("/", @today), Entry.new("/daily", @today), Entry.new("/practice", nil), Entry.new("/m", nil), Entry.new("/stats", @today)]
    newest = @archives.map(&:last_date).max
    list << Entry.new("/archive", newest + 1) if newest
    list
  end

  # Newest first, the two games side by side.
  def days
    @archives.flat_map(&:days).sort_by { |day| [-day.date.jd, DailyArchive::KINDS.index(day.kind)] }.map do |day|
      Entry.new(day.path, day.date + 1)
    end
  end

  def escape(text)
    text.gsub("&", "&amp;").gsub("<", "&lt;").gsub(">", "&gt;").gsub('"', "&quot;").gsub("'", "&apos;")
  end
end
