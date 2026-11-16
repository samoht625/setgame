# frozen_string_literal: true

require "test_helper"
require "open3"
require "tmpdir"

# script/retention reads the database with the sqlite3 command line, which
# knows no time zones, so it spells out Pacific time itself. Its days have to
# be the dailies' days all the same.
class RetentionScriptTest < ActiveSupport::TestCase
  SCRIPT = Rails.root.join("script/retention").to_s

  setup do
    skip "the sqlite3 command line isn't installed" unless system("sqlite3", "-version", out: File::NULL, err: File::NULL)
    @dir = Dir.mktmpdir("retention")
    @db = File.join(@dir, "games.sqlite3")
    sqlite("create table solo_games (player_id text, started_at datetime(6)); create table puzzle_runs (player_id text, started_at datetime(6));")
  end

  teardown { FileUtils.remove_entry(@dir) if @dir }

  test "a player's days are Pacific days: 11:30 PM and 12:30 AM are a day apart, in standard and in daylight time" do
    # Rows as Rails stores them: UTC, with microseconds.
    played("winter", "solo_games", Time.utc(2026, 11, 16, 7, 30))     # 11:30 PM PST on Nov 15
    played("winter", "puzzle_runs", Time.utc(2026, 11, 16, 8, 30))    # 12:30 AM PST on Nov 16
    played("summer", "solo_games", Time.utc(2026, 11, 1, 6, 30))      # 11:30 PM PDT on Oct 31
    played("summer", "puzzle_runs", Time.utc(2026, 11, 1, 7, 30))     # 12:30 AM PDT on Nov 1
    played("long day", "solo_games", Time.utc(2026, 11, 2, 7, 30))    # 11:30 PM PST on Nov 1, the day the clocks went back
    played("last instant", "solo_games", Time.utc(2026, 11, 15, 7, 59, 59, 999_999)) # the last microsecond of Nov 14

    days = players_per_day(now: "2026-11-16 08:31:00")
    assert_equal({ "2026-11-14" => 1, "2026-11-15" => 1, "2026-11-16" => 1 }, days.select { |day, _| day >= "2026-11-03" })

    all = players_per_day(now: "2026-11-02 07:31:00")
    assert_equal({ "2026-10-31" => 1, "2026-11-01" => 2 }, all.select { |day, _| day <= "2026-11-02" }, "summer played on both days; the long day's late game is still Nov 1")
    by_the_dailies = @played.map { |player, at| [player, DailyPuzzle.today(at).date.iso8601] }.uniq.map(&:last).tally
    assert_equal by_the_dailies.sort.to_h, all, "each game on the day DailyPuzzle gives it"
  end

  test "today is the Pacific day too: the last 14 days end on it" do
    played("first day of the window", "solo_games", Time.utc(2026, 11, 2, 20))  # noon on Nov 2
    played("the day before it", "solo_games", Time.utc(2026, 11, 1, 20))        # noon on Nov 1
    played("october", "solo_games", Time.utc(2026, 10, 17, 19))                 # noon PDT on Oct 17

    # 11:55 PM Pacific on Nov 15 (07:55 UTC on the 16th): the 14 days are Nov 2 to Nov 15.
    assert_equal %w[2026-11-02], players_per_day(now: "2026-11-16 07:55:00").keys
    # Five minutes into the 16th: Nov 3 to Nov 16.
    assert_equal [], players_per_day(now: "2026-11-16 08:05:00").keys
    # 12:30 AM PDT on Oct 31 (07:30 UTC): the 14 days are Oct 18 to Oct 31. By UTC-8 it would still be the 30th.
    assert_equal [], players_per_day(now: "2026-10-31 07:30:00").keys.select { |day| day < "2026-10-18" }
    assert_equal %w[2026-10-17], players_per_day(now: "2026-10-31 06:30:00").keys.select { |day| day < "2026-10-18" }, "an hour earlier, still the 30th"
  end

  test "a time that isn't one is refused" do
    output, status = Open3.capture2e({ "RETENTION_NOW" => "yesterday'; drop table solo_games; --" }, SCRIPT, @db)
    refute status.success?
    assert_includes output, "RETENTION_NOW"
    assert_equal "0", sqlite("select count(*) from solo_games;").strip
  end

  private

  def sqlite(sql)
    output, status = Open3.capture2e("sqlite3", @db, sql)
    assert status.success?, output
    output
  end

  def played(player, table, at)
    (@played ||= []) << [player, at]
    sqlite("insert into #{table} values ('#{player}', '#{at.utc.strftime('%Y-%m-%d %H:%M:%S.%6N')}');")
  end

  # The script's first table, "Players per day, last 14 days", as { "2026-11-15" => 1 }.
  def players_per_day(now:)
    output, status = Open3.capture2e({ "RETENTION_NOW" => now }, SCRIPT, @db)
    assert status.success?, output
    section = output[/== Players per day.*?(?=\n== )/m] || flunk("no per-day table in:\n#{output}")
    section.scan(/^(\d{4}-\d{2}-\d{2})\s+(\d+)/).to_h { |day, players| [day, players.to_i] }
  end
end
