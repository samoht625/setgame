#!/usr/bin/env ruby
# frozen_string_literal: true

# Freezes the figures a blog post quotes: reads a saved copy of the /stats
# page and prints them as JSON, in the shape SetStats gives the charts.
#
#   ruby script/stats_snapshot.rb saved-stats.html 2026-11-15T23:09:00-08:00 > config/blog/spotting_sets.json
#
# The page is the only source, so every figure is as precise as the page is:
#   - counts and shares are the page's own text;
#   - each time (p25, median, p75) is the whole millisecond that draws the
#     page's bar where the page drew it (bars are placed to 0.01% of the 20 s
#     scale, which is 2 ms) and prints the page's tenth of a second;
#   - a time past the end of the scale has no bar position to read, so it is
#     the printed tenth of a second alone;
#   - the times in Quickest to spot and Fastest find have no bar at all, so
#     they too are the printed tenth of a second.
# Players' names are left behind: of Most games finished it keeps only the
# games each of the listed players finished.
# It stops rather than guess when the page isn't what it expects.

require "json"
require "time"
require_relative "../app/services/rules"

SCALE_MS = 20_000
NUMBERS = %w[1 2 3].freeze
SHADINGS = %w[solid striped open].freeze
COLORS = %w[red purple green].freeze
SHAPES = %w[squiggle diamond oval].freeze
CHANCE = { 1 => 10, 2 => 30, 3 => 40, 4 => 20 }.freeze

def stop(message)
  abort "stats_snapshot: #{message}"
end

def count(text)
  stop "not a count: #{text.inspect}" unless text.match?(/\A\d{1,3}(,\d{3})*\z/)
  text.delete(",").to_i
end

# The same arithmetic as the chart in app/views/stats/_how_fast.html.erb.
def position(ms, scale_ms)
  (ms.clamp(0, scale_ms) * 100.0 / scale_ms).round(2)
end

def printed(ms)
  ms < 60_000 ? format("%.1fs", ms / 1000.0) : format("%d:%02d", ms / 60_000, (ms / 1000) % 60)
end

def printed_ms(text)
  return (text.to_f * 1000).round if text.match?(/\A\d+\.\ds\z/)
  return (Regexp.last_match(1).to_i * 60 + Regexp.last_match(2).to_i) * 1000 if text =~ /\A(\d+):(\d\d)\z/

  stop "not a time: #{text.inspect}"
end

# The millisecond that is drawn at `drawn` percent and printed as `text`.
def time_ms(drawn, text, what, scale_ms)
  if drawn >= 100
    ms = printed_ms(text)
    stop "#{what}: #{text} is on the scale, but its bar ends at #{drawn}%" if ms < scale_ms
    return ms
  end
  centre = (drawn * scale_ms / 100).round
  step = [(scale_ms / 10_000.0).ceil, 2].max
  found = (centre - step..centre + step).sort_by { |ms| (ms - centre).abs }.find { |ms| position(ms, scale_ms) == drawn && printed(ms) == text }
  found || stop("#{what}: no millisecond is drawn at #{drawn}% and printed as #{text}")
end

def card_id(label)
  match = label.match(/\A([123]) (#{SHADINGS.join('|')}) (#{COLORS.join('|')}) (#{SHAPES.join('|')})s?\z/) || stop("not a card: #{label.inspect}")
  digits = [NUMBERS.index(match[1]), COLORS.index(match[3]), SHAPES.index(match[4]), SHADINGS.index(match[2])]
  1 + digits.each_with_index.sum { |digit, place| digit * 3**place }
end

# The three cards drawn in a piece of the page, which have to be a set.
def set_in(html, what)
  cards = html.scan(/<svg class="c"[^>]*aria-label="([^"]+)"/).flatten.map { |card| card_id(card) }
  stop "#{what}: #{cards.inspect} is not a set" unless cards.length == 3 && Rules.is_set?(*cards.sort)
  cards
end

# The rows of one of the page's ranked lists of sets, each given to the block as its cards and its value's HTML.
def ranked_sets(html, heading, name)
  section = html[%r{<section class="sec" aria-labelledby="#{heading}">(.*?)</section>}m, 1] || stop("no #{name} list")
  rows = section.scan(%r{<li><span class="rk"[^>]*>(\d+)</span>(.*?)<span class="val">(.*?)</span></li>}m)
  stop "#{name}: not a list of ten sets" unless rows.map(&:first) == (1..10).map(&:to_s)
  rows.map { |rank, cards, value| yield set_in(cards, "#{name} #{rank}"), value }
end

def kind(row, scale_ms)
  label = row[%r{<span class="kind-label">([^<]+)</span>}, 1] || stop("a row without a label")
  cards = set_in(row, label)
  track = row.match(/aria-label="middle half (\S+) to (\S+)" title="(\S+) – (\S+) · ([\d,]+) finds"/) || stop("#{label}: no middle half")
  stop "#{label}: the bar's label and its title disagree" unless track[1] == track[3] && track[2] == track[4]
  bar = row.match(/<span class="kind-iqr(?:\s+clipped)?" style="left:([\d.]+)%;width:([\d.]+)%">/) || stop("#{label}: no bar")
  line = row[/<span class="kind-mid" style="left:([\d.]+)%">/, 1] || stop("#{label}: no median line")
  median = row[%r{<b class="kind-med">([\d.]+s)</b>}, 1] || stop("#{label}: no median")
  left = bar[1].to_f
  {
    label: label,
    cards: cards,
    n: count(track[5]),
    p25_ms: time_ms(left, track[1], "#{label} p25", scale_ms),
    median_ms: time_ms(line.to_f, median, "#{label} median", scale_ms),
    p75_ms: time_ms((left + bar[2].to_f).round(2), track[2], "#{label} p75", scale_ms)
  }.tap do |k|
    stop "#{label}: the bar is not #{bar[2]}% wide" unless (position(k[:p75_ms], scale_ms) - position(k[:p25_ms], scale_ms)).round(2) == bar[2].to_f
    stop "#{label}: out of order" unless k[:p25_ms] <= k[:median_ms] && k[:median_ms] <= k[:p75_ms]
  end
end

path, taken_at = ARGV
stop "usage: ruby script/stats_snapshot.rb saved-stats.html 2026-11-15T23:09:00-08:00" unless path && taken_at && ARGV.length == 2
html = File.read(path, encoding: "UTF-8")
taken_at = Time.iso8601(taken_at)

tiles = html.scan(%r{<div><dt>([^<]+)</dt><dd>([^<]+)</dd></div>}).to_h
how_fast = html[%r{<div class="card kinds">(.*?)</ol>}m, 1] || stop("no How fast chart")
scale_max_s = how_fast.scan(%r{<i[^>]*>(\d+)s</i>}).flatten.map(&:to_i).max
scale_ms = scale_max_s ? scale_max_s * 1000 : SCALE_MS
kinds = how_fast.scan(%r{<li class="kind">(.*?)</li>}m).flatten.map { |row| kind(row, scale_ms) }
stop "#{kinds.length} kinds of set, not 15" unless kinds.length == 15 && kinds.map { |k| k[:label] }.uniq.length == 15
stop "the kinds are not in order of median" unless kinds.each_cons(2).all? { |a, b| a[:median_ms] <= b[:median_ms] }

found = html[%r{<table class="shares".*?</table>}m] || stop("no What gets found table")
shares = found.scan(%r{<th scope="row">(\d) different</th>.*?<td class="n">([\d.]+)%</td>\s*<td class="n all">(\d+)%</td>}m)
stop "the shares are not of 1 to 4 differences" unless shares.map(&:first) == %w[1 2 3 4]
stop "the shares among all sets have changed" unless shares.to_h { |n, _, all| [n.to_i, all.to_i] } == CHANCE

spread = html.match(/aria-label="Histogram of sets by times found, from (\d+)× to (\d+)×, median (\d+)×"/) || stop("no Finds per set chart")
stop "Finds per set: the tile and the chart disagree" unless tiles.fetch("Finds per set, min–max") == "#{spread[1]}–#{spread[2]}×"
stop "Finds per set: the chart and its caption disagree" unless html.include?("Median: #{spread[3]}×.")

quickest = ranked_sets(html, "h-fastest", "Quickest to spot") do |cards, value|
  time = value.match(%r{\A([\d.]+s)<small>([\d,]+) finds?</small>\z}) || stop("Quickest to spot: not a time and a count: #{value.inspect}")
  { cards: cards, median_ms: printed_ms(time[1]), n: count(time[2]) }
end
stop "Quickest to spot is not in order" unless quickest.each_cons(2).all? { |a, b| a[:median_ms] <= b[:median_ms] }

least = ranked_sets(html, "h-least", "Least found") do |cards, value|
  { cards: cards, n: count(value[/\A([\d,]+)×\z/, 1] || stop("Least found: not a count: #{value.inspect}")) }
end
stop "Least found is not in order" unless least.each_cons(2).all? { |a, b| a[:n] <= b[:n] }
stop "Least found does not start at the fewest finds" unless least.first[:n] == spread[1].to_i

fastest = html.match(%r{<dt>Fastest find</dt>\s*<dd class="val">([\d.]+s)</dd>\s*<dd class="note">(.*?)</dd>}m) || stop("no Fastest find")

players_table = html[%r{<table class="players".*?</table>}m] || stop("no Most games finished table")
most_games = players_table.scan(%r{<td role="cell" class="total">([\d,]+)</td>}).flatten.map { |games| count(games) }
stop "Most games finished: not a ranked list" unless most_games.any? && most_games == most_games.sort.reverse
stop "Most games finished: more games than were finished" unless most_games.sum <= count(tiles.fetch("Games finished"))

rows = ->(list) { list.map { |row| "    #{JSON.generate(row)}" }.join(",\n") }
puts <<~JSON
  {
    "source": "https://setdaily.app/stats",
    "taken_at": #{JSON.generate(taken_at.iso8601)},
    "sets_found": #{count(tiles.fetch("Sets found"))},
    "players": #{count(tiles.fetch("Players"))},
    "games_finished": #{count(tiles.fetch("Games finished"))},
    "kinds": [
  #{rows.(kinds)}
    ],
    "shares": #{JSON.generate(shares.to_h { |n, pct, _| [n, pct.to_f] })},
    "finds_per_set": #{JSON.generate(min: spread[1].to_i, max: spread[2].to_i, median: spread[3].to_i)},
    "quickest": [
  #{rows.(quickest)}
    ],
    "least_found": [
  #{rows.(least)}
    ],
    "fastest_find": #{JSON.generate(cards: set_in(fastest[2], "Fastest find"), ms: printed_ms(fastest[1]))},
    "most_games": #{JSON.generate(most_games)}
  }
JSON
