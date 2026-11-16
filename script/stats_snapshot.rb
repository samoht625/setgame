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
#     the printed tenth of a second alone.
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
def position(ms)
  (ms.clamp(0, SCALE_MS) * 100.0 / SCALE_MS).round(2)
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
def time_ms(drawn, text, what)
  if drawn >= 100
    ms = printed_ms(text)
    stop "#{what}: #{text} is on the scale, but its bar ends at #{drawn}%" if ms < SCALE_MS
    return ms
  end
  centre = (drawn * SCALE_MS / 100).round
  found = (centre - 2..centre + 2).sort_by { |ms| (ms - centre).abs }.find { |ms| position(ms) == drawn && printed(ms) == text }
  found || stop("#{what}: no millisecond is drawn at #{drawn}% and printed as #{text}")
end

def card_id(label)
  match = label.match(/\A([123]) (#{SHADINGS.join('|')}) (#{COLORS.join('|')}) (#{SHAPES.join('|')})s?\z/) || stop("not a card: #{label.inspect}")
  digits = [NUMBERS.index(match[1]), COLORS.index(match[3]), SHAPES.index(match[4]), SHADINGS.index(match[2])]
  1 + digits.each_with_index.sum { |digit, place| digit * 3**place }
end

def kind(row)
  label = row[%r{<span class="kind-label">([^<]+)</span>}, 1] || stop("a row without a label")
  cards = row.scan(/<svg class="c"[^>]*aria-label="([^"]+)"/).flatten.map { |card| card_id(card) }
  stop "#{label}: #{cards.inspect} is not a set" unless cards.length == 3 && Rules.is_set?(*cards.sort)
  track = row.match(/aria-label="middle half (\S+) to (\S+)" title="(\S+) – (\S+) · ([\d,]+) finds"/) || stop("#{label}: no middle half")
  stop "#{label}: the bar's label and its title disagree" unless track[1] == track[3] && track[2] == track[4]
  bar = row.match(/<span class="kind-iqr" style="left:([\d.]+)%;width:([\d.]+)%">/) || stop("#{label}: no bar")
  line = row[/<span class="kind-mid" style="left:([\d.]+)%">/, 1] || stop("#{label}: no median line")
  median = row[%r{<b class="kind-med">([\d.]+s)</b>}, 1] || stop("#{label}: no median")
  left = bar[1].to_f
  {
    label: label,
    cards: cards,
    n: count(track[5]),
    p25_ms: time_ms(left, track[1], "#{label} p25"),
    median_ms: time_ms(line.to_f, median, "#{label} median"),
    p75_ms: time_ms((left + bar[2].to_f).round(2), track[2], "#{label} p75")
  }.tap do |k|
    stop "#{label}: the bar is not #{bar[2]}% wide" unless (position(k[:p75_ms]) - position(k[:p25_ms])).round(2) == bar[2].to_f
    stop "#{label}: out of order" unless k[:p25_ms] <= k[:median_ms] && k[:median_ms] <= k[:p75_ms]
  end
end

path, taken_at = ARGV
stop "usage: ruby script/stats_snapshot.rb saved-stats.html 2026-11-15T23:09:00-08:00" unless path && taken_at && ARGV.length == 2
html = File.read(path, encoding: "UTF-8")
taken_at = Time.iso8601(taken_at)

tiles = html.scan(%r{<div><dt>([^<]+)</dt><dd>([^<]+)</dd></div>}).to_h
how_fast = html[%r{<div class="card kinds">(.*?)</ol>}m, 1] || stop("no How fast chart")
kinds = how_fast.scan(%r{<li class="kind">(.*?)</li>}m).flatten.map { |row| kind(row) }
stop "#{kinds.length} kinds of set, not 15" unless kinds.length == 15 && kinds.map { |k| k[:label] }.uniq.length == 15
stop "the kinds are not in order of median" unless kinds.each_cons(2).all? { |a, b| a[:median_ms] <= b[:median_ms] }

found = html[%r{<table class="shares".*?</table>}m] || stop("no What gets found table")
shares = found.scan(%r{<th scope="row">(\d) different</th>.*?<td class="n">([\d.]+)%</td>\s*<td class="n all">(\d+)%</td>}m)
stop "the shares are not of 1 to 4 differences" unless shares.map(&:first) == %w[1 2 3 4]
stop "the shares among all sets have changed" unless shares.to_h { |n, _, all| [n.to_i, all.to_i] } == CHANCE

rows = kinds.map { |k| "    #{JSON.generate(k)}" }.join(",\n")
puts <<~JSON
  {
    "source": "https://setdaily.app/stats",
    "taken_at": #{JSON.generate(taken_at.iso8601)},
    "sets_found": #{count(tiles.fetch("Sets found"))},
    "players": #{count(tiles.fetch("Players"))},
    "games_finished": #{count(tiles.fetch("Games finished"))},
    "kinds": [
  #{rows}
    ],
    "shares": #{JSON.generate(shares.to_h { |n, pct, _| [n, pct.to_f] })}
  }
JSON
