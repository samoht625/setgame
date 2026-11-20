# frozen_string_literal: true

require "test_helper"
require "minitest/mock"

class StatsControllerTest < ActionDispatch::IntegrationTest
  test "stats page counts finished and unfinished finds" do
    travel_to Time.find_zone(SetStats::ZONE).now.change(hour: 12)
    Rails.cache.clear
    SoloScore.delete_all
    SoloGame.delete_all
    PuzzleRun.delete_all
    finished = SoloGame.create!(id: SecureRandom.uuid, player_id: "player-secret-xyz", seed: "1", started_at: 1.hour.ago, status: "completed", completed_at: Time.current)
    SoloScore.create!(solo_game: finished, player_id: "player-secret-xyz", elapsed_ms: 9000, completed_at: Time.current,
      events: [{ "type" => "claim", "cards" => [1, 2, 3], "t_ms" => 2000 }, { "type" => "claim", "cards" => [4, 5, 6], "t_ms" => 9000 }])
    SoloGame.create!(id: SecureRandom.uuid, player_id: "p2", seed: "2", started_at: 1.hour.ago, sets_found: 1,
      events: [{ "type" => "claim", "cards" => [1, 2, 3], "t_ms" => 1500 }])

    stats = SetStats.new.compute
    assert_equal 3, stats[:total_finds]
    assert_equal 1500, stats[:fastest_find][:ms]
    assert_equal({ cards: [1, 2, 3], n: 2 }, stats[:most_found].first)
    assert_equal 3, stats[:type_counts][1]
    assert_equal ["number"], stats[:kinds].map { |k| k[:label] }, "[1,2,3] and [4,5,6] differ only in number"
    kind = stats[:kinds].first
    assert_equal [3, 1750.0, 2000.0, 4500.0], kind.values_at(:n, :p25_ms, :median_ms, :p75_ms)
    assert_includes [[1, 2, 3], [4, 5, 6]], kind[:cards]
    assert_equal({ cards: [1, 2, 3], n: 2, tied: 0 }, stats[:spread][:max])
    assert_equal 0, stats[:spread][:min][:n]
    assert_equal 1077, stats[:spread][:min][:tied]
    assert_equal [[0, 1078], [1, 1], [2, 1]], stats[:spread][:hist]
    assert_equal 10, stats[:spread][:least].length
    assert_equal 0, stats[:spread][:least].first[:n]

    named = SoloGame.create!(id: SecureRandom.uuid, player_id: "p3", seed: "3", started_at: 1.hour.ago, status: "completed", completed_at: Time.current, daily_on: Date.current)
    SoloScore.create!(solo_game: named, player_id: "p3", display_name: "Ada", elapsed_ms: 5000, completed_at: Time.current, daily_on: Date.current, events: [])
    games = SetStats.new.compute[:most_games]
    assert_equal [{ name: "Ada", solo: 0, daily: 1, best_daily_ms: 5000, best_puzzle_ms: nil, total: 1 }], games, "only named players are listed"

    puzzle = { cards: [], started_at: 1.hour.ago, completed_at: Time.current }
    PuzzleRun.create!(id: SecureRandom.uuid, player_id: "p3", puzzle_on: Date.current - 1, elapsed_ms: 41_000, **puzzle)
    PuzzleRun.create!(id: SecureRandom.uuid, player_id: "ada-phone", display_name: " ada ", puzzle_on: Date.current, elapsed_ms: 38_000, **puzzle)
    PuzzleRun.create!(id: SecureRandom.uuid, player_id: "p3", puzzle_on: Date.current, started_at: 1.hour.ago, cards: [])
    PuzzleRun.create!(id: SecureRandom.uuid, player_id: "stranger", display_name: "Bo", puzzle_on: Date.current, elapsed_ms: 1000, **puzzle)
    games = SetStats.new.compute[:most_games]
    assert_equal 38_000, games.first[:best_puzzle_ms], "Puzzle runs join by device, or by name on another device; unfinished runs don't count"
    assert_equal ["Ada"], games.map { |g| g[:name] }, "a Puzzle alone doesn't put someone on the list"

    by_day = SetStats.new.compute[:activity_by_day]
    assert_equal SetStats::CHART_DAYS, by_day.length, "empty days are kept"
    assert_equal Time.current.in_time_zone(SetStats::ZONE).to_date, by_day.last[:date]
    assert_equal 2, by_day.last[:games]
    assert_equal 3, by_day.sum { |d| d[:players] }, "a finisher counts once; an unfinished game with a find counts too"

    get "/stats"
    assert_response :success
    assert_includes response.body, "<h1>Stats</h1>"
    refute_includes response.body, "drought", "idle tabs made it absurd"
    assert_includes response.body, %(id="site-header")
    assert_includes response.body, "Most found"
    assert_includes response.body, "Most games finished"
    assert_select "table.players thead th", 7
    assert_equal ["Rank", "Player", "Games", "Practice", "Daily Deal", "Best Puzzle", "Best Daily Deal"], css_select("table.players thead th").map { |th| th.text.squish }
    assert_equal [["1", "Ada", "1", "0", "1", "38.0s", "5.0s"]], player_rows, "one row per named player: rank, name, games, the practice and daily split, best times"
    assert_equal [["Fastest find", "1.5s", ""], ["Practice games", "1", "Median time 9.0s"], ["Daily Deal games", "1", "Median time 5.0s"],
      ["Busiest day", DailyPuzzle.today.date.strftime("%b %-d"), "3 games"], ["Busiest hour", "11 AM", "Pacific time"]], facts,
      "every fun fact is a label, a value and a note"
    assert_select ".facts .wide .note svg.c", 3, "the fastest find shows its three cards"
    assert_includes response.body, "kind-iqr"
    assert_includes response.body, %(for="act-players">Players</label>)
    assert_includes response.body, %(data-tip="Today · 2 games")
    refute_includes response.body, "vs all"
    assert_includes response.body, "Least found"
    refute_includes response.body, "possible sets found at least once"
    refute_includes response.body, "player-secret-xyz"
  end

  test "Puzzle runs never count toward stats" do
    Rails.cache.clear
    before = comparable_stats
    cards = ClassicPuzzle.generate(7)
    claims = ClassicPuzzle.sets_in(cards).each_with_index.map { |set, i| { "cards" => set, "t_ms" => (i + 1) * 1000 } }
    PuzzleRun.create!(id: SecureRandom.uuid, player_id: "puzzler", display_name: "Puzzler", puzzle_on: Date.current, cards: cards,
      claims: claims, started_at: 1.minute.ago, completed_at: Time.current, elapsed_ms: 6000)
    Rails.cache.clear
    assert_equal before, comparable_stats
  end

  test "the players table separates thousands, quiets zeros and says when there is no best time" do
    Rails.cache.clear
    [SoloScore, SoloGame, PuzzleRun].each(&:delete_all)
    now = Time.current
    finish = lambda do |name, count, daily_on: nil, elapsed_ms: 90_000|
      SoloScore.insert_all!(Array.new(count) do |i|
        { solo_game_id: "#{name}-#{daily_on}-#{i}", player_id: "device-#{name}", display_name: name, elapsed_ms: elapsed_ms + i,
          completed_at: now, daily_on: daily_on, events: [], created_at: now, updated_at: now }
      end)
    end
    finish.call("Rose", 1_229)
    finish.call("Rose", 1, daily_on: Date.current, elapsed_ms: 71_000)
    finish.call("Practice only", 3)
    PuzzleRun.create!(id: SecureRandom.uuid, player_id: "device-Rose", puzzle_on: Date.current, elapsed_ms: 23_200, cards: [], started_at: 1.hour.ago, completed_at: now)

    get "/stats"
    assert_response :success
    assert_equal [["1", "Rose", "1,230", "1,229", "1", "23.2s", "1:11"], ["2", "Practice only", "3", "3", "0", "–none", "–none"]], player_rows
    assert_select "table.players[role=table] tbody tr[role=row]:first-child" do
      assert_select "th[scope=row][role=rowheader]", "Rose"
      assert_select "td[role=cell]", 6
      assert_select ".badge.top1", "1"
    end
    assert_select "table.players tbody tr:last-child td.dly .nil", "0"
    assert_select "table.players tbody tr:last-child td.bdd .sr", "none", "a missing best is a dash to the eye and a word to a screen reader"
    assert_select "table.players tbody tr:last-child td.bdd [aria-hidden=true]", "–"
    assert_select ".tiles dd", text: "1,233"
    assert_equal [["Fastest find", "–none"], ["Practice games", "1,232", "Median time 1:30"], ["Daily Deal games", "1", "Median time 1:11"],
      ["Busiest day", "–none"], ["Busiest hour", "–none"]], facts, "a fact with nothing to show keeps its place"
  end

  test "an empty site gets an empty state instead of empty charts" do
    Rails.cache.clear
    [SoloScore, SoloGame, PuzzleRun].each(&:delete_all)

    get "/stats"
    assert_response :success
    assert_select "h1", "Stats"
    assert_equal %w[0 0 0 0×], css_select(".tiles dd").map(&:text)
    assert_select ".empty", /No sets found yet/
    assert_select ".empty a[href='/daily']", "Play the Daily Deal"
    assert_select "section", 0
    assert_select "table", 0
  end

  test "sections with nothing to rank say so" do
    Rails.cache.clear
    [SoloScore, SoloGame, PuzzleRun].each(&:delete_all)
    SoloGame.create!(id: SecureRandom.uuid, player_id: "p1", seed: "1", started_at: 1.hour.ago, sets_found: 1,
      events: [{ "type" => "claim", "cards" => [1, 2, 3], "t_ms" => 1500 }])

    get "/stats"
    assert_response :success
    assert_select "table.players", 0
    assert_select "p.none", "No named player has finished a game yet."
    assert_select "p.none", "No set has been found #{SetStats::MIN_SAMPLE} times yet."
    assert_select ".kinds li.kind", 1
    assert_select "ol.sets", 2, "most found and least found still list sets"
  end

  # Tido's report: at 11:55 PM Pacific on Nov 15, 2026 the chart's "Today" was
  # already the 16th. It is 07:55 on the 16th in UTC then, and 1:55 AM Central.
  LATE = Time.utc(2026, 11, 16, 7, 55)

  test "a day on the stats page is the dailies' day: 11:30 PM Pacific and 12:30 AM are a day apart" do
    reset_games
    finish(pacific(2026, 11, 14, 23, 30), "ada")
    finish(pacific(2026, 11, 15, 0, 30), "bo")
    finish(pacific(2026, 11, 15, 23, 30), "ada")
    found_a_set(pacific(2026, 11, 15, 23, 40), "cy")

    travel_to LATE do
      days = SetStats.new.compute[:activity_by_day]
      assert_equal Date.new(2026, 11, 15), days.last[:date], "five minutes to midnight Pacific is still the 15th"
      assert_equal DailyPuzzle.today.date, days.last[:date], "the same today as the Puzzle's and the Daily Deal's"
      assert_equal SetStats::CHART_DAYS, days.length
      assert_equal [[Date.new(2026, 11, 14), 1, 1], [Date.new(2026, 11, 15), 2, 3]], days.last(2).map { |day| day.values_at(:date, :games, :players) }
      assert_equal 3, days.sum { |day| day[:games] }

      get "/stats"
      assert_response :success
      assert_includes response.body, %(data-tip="Today · 2 games")
      assert_includes response.body, %(data-tip="Sat, Nov 14 · 1 game")
      assert_includes response.body, %(data-tip="Today · 3 players")
      refute_includes response.body, "Nov 16"
      assert_equal ["2 on Nov 15", "3 on Nov 15"], css_select(".chart-stats > div:first-child dd").map { |peak| peak.text.squish }, "the busiest day of each chart"
    end

    travel_to LATE + 5.minutes do
      days = SetStats.new.compute[:activity_by_day]
      assert_equal [[Date.new(2026, 11, 15), 2, 3], [Date.new(2026, 11, 16), 0, 0]], days.last(2).map { |day| day.values_at(:date, :games, :players) }, "midnight Pacific: a new, empty day"

      get "/stats"
      assert_includes response.body, %(data-tip="Today · 0 games")
      assert_includes response.body, %(data-tip="Sun, Nov 15 · 2 games")
    end

    finish(pacific(2026, 11, 16, 0, 30), "ada")
    travel_to pacific(2026, 11, 16, 0, 31) do
      assert_equal [[Date.new(2026, 11, 15), 2], [Date.new(2026, 11, 16), 1]], SetStats.new.compute[:activity_by_day].last(2).map { |day| day.values_at(:date, :games) }
    end
  end

  test "the busiest day and hour are counted on the dailies' clock, and the hour says so" do
    reset_games
    # Three games within 80 minutes, either side of midnight Pacific. They are
    # one day in UTC (07:10 to 08:30) and one in Central (1:10 to 2:30 AM).
    finish(pacific(2026, 11, 14, 23, 12), "ada")
    finish(pacific(2026, 11, 14, 23, 42), "bo")
    finish(pacific(2026, 11, 15, 0, 32), "cy")

    travel_to LATE do
      stats = SetStats.new.compute
      assert_equal [Date.new(2026, 11, 14), 2], stats[:busiest_day]
      assert_equal 23, stats[:busiest_hour]

      get "/stats"
      assert_equal [["Busiest day", "Nov 14", "2 games"], ["Busiest hour", "11 PM", "Pacific time"]], facts.last(2)
    end
  end

  test "the stats' days follow daylight time: the day the clocks go back is 25 hours long" do
    reset_games
    finish(Time.utc(2026, 11, 1, 6, 30), "ada")  # 11:30 PM PDT on Oct 31
    finish(Time.utc(2026, 11, 1, 7, 30), "ada")  # 12:30 AM PDT on Nov 1
    finish(Time.utc(2026, 11, 2, 7, 30), "ada")  # 11:30 PM PST on Nov 1, 24 hours later
    finish(Time.utc(2026, 11, 2, 8, 30), "ada")  # 12:30 AM PST on Nov 2

    travel_to LATE do
      days = SetStats.new.compute[:activity_by_day].to_h { |day| [day[:date], day[:games]] }
      assert_equal [1, 2, 1], [Date.new(2026, 10, 31), Date.new(2026, 11, 1), Date.new(2026, 11, 2)].map { |date| days.fetch(date) }
    end
  end

  test "the stats' days don't depend on the zone the server or the app is set to" do
    reset_games
    finish(pacific(2026, 11, 14, 23, 30), "ada")
    finish(pacific(2026, 11, 15, 0, 30), "bo")
    finish(pacific(2026, 11, 15, 23, 30), "ada")

    travel_to LATE do
      expected = comparable_stats
      assert_equal [1, 2], expected[:activity_by_day].last(2).map { |day| day[:games] }
      page = dated_parts_of_the_page
      assert_equal ["Fri, Nov 13 · 0 games", "Sat, Nov 14 · 1 game", "Today · 2 games"], page.first.first(SetStats::CHART_DAYS).last(3)
      %w[UTC America/Chicago America/New_York Asia/Tokyo Pacific/Kiritimati].each do |zone|
        Time.use_zone(zone) do
          assert_equal expected, comparable_stats, "with the app in #{zone}"
          assert_equal page, dated_parts_of_the_page, "the page, with the app in #{zone}"
        end
        with_server_zone(zone) do
          assert_equal expected, comparable_stats, "with the server in #{zone}"
          assert_equal page, dated_parts_of_the_page, "the page, with the server in #{zone}"
        end
      end
    end
  end

  test "stats kept for a few minutes are never kept past midnight: today is always today" do
    reset_games
    finish(pacific(2026, 11, 15, 12, 0), "ada")

    Rails.stub(:cache, ActiveSupport::Cache::MemoryStore.new) do
      travel_to pacific(2026, 11, 15, 23, 57) do
        assert_equal [Date.new(2026, 11, 15), 1], SetStats.cached[:activity_by_day].last.values_at(:date, :games)
      end
      finish(pacific(2026, 11, 15, 23, 58), "bo")
      travel_to pacific(2026, 11, 15, 23, 59) do
        assert_equal [Date.new(2026, 11, 15), 1], SetStats.cached[:activity_by_day].last.values_at(:date, :games), "kept: the same day, two minutes on"
      end

      travel_to pacific(2026, 11, 16, 0, 0, 30) do
        days = SetStats.cached[:activity_by_day]
        assert_equal [[Date.new(2026, 11, 15), 2], [Date.new(2026, 11, 16), 0]], days.last(2).map { |day| day.values_at(:date, :games) }, "worked out again for the new day"
        get "/stats"
        assert_includes response.body, %(data-tip="Today · 0 games")
        assert_includes response.body, %(data-tip="Sun, Nov 15 · 2 games")
      end
      finish(pacific(2026, 11, 16, 0, 1), "cy")
      travel_to pacific(2026, 11, 16, 0, 2) do
        assert_equal 0, SetStats.cached[:activity_by_day].last[:games], "and the new day's numbers are kept in turn"
      end
      travel_to pacific(2026, 11, 16, 0, 7) do
        assert_equal 1, SetStats.cached[:activity_by_day].last[:games]
      end
    end
  end

  test "the header menu's How to play has its dialog on the stats page" do
    Rails.cache.clear

    get "/stats"
    assert_response :success
    assert_select "#site-header", 1
    # Light or dark with the system, like the game.
    assert_select "meta[name='color-scheme'][content='light dark']"
    assert_select "meta[name='theme-color'][media=?][content=?]", "(prefers-color-scheme: light)", "#f5f5f5"
    assert_select "meta[name='theme-color'][media=?][content=?]", "(prefers-color-scheme: dark)", "#111214"
    assert_select "dialog#how-to-play", 1 do
      assert_select "#rules-demo-root", 1
      assert_select "h2#how-to-play-title", "How to play"
    end
    assert_select "section.sr-only", 0, "the longer About text stays on the game pages"
  end

  test "SetStats.kind lookup table agrees with Rules.card_attributes for all 1,080 valid sets" do
    SetStats.all_sets.each do |cards|
      attrs = cards.map { |c| Rules.card_attributes(c) }
      expected = SetStats::ATTRS.map { |a| attrs.map { |h| h[a.to_sym] }.uniq.length == 3 }
      assert_equal expected, SetStats.kind(cards), "mismatch for #{cards.inspect}"
    end
  end

  test "most_games SQL aggregation merges unnamed device runs, renames, and multi-device names" do
    reset_games
    now = Time.current
    add = lambda do |pid, name, elapsed_ms:, completed_at:, daily_on: nil|
      game = SoloGame.create!(
        id: SecureRandom.uuid,
        player_id: pid,
        seed: "1",
        status: "completed",
        started_at: completed_at - 2.minutes,
        completed_at: completed_at,
        daily_on: daily_on
      )
      SoloScore.create!(
        solo_game: game,
        player_id: pid,
        display_name: name,
        elapsed_ms: elapsed_ms,
        completed_at: completed_at,
        daily_on: daily_on,
        events: []
      )
    end

    # Device 1: unnamed first, named later, then renamed.
    add.call("dev-1", nil, elapsed_ms: 80_000, completed_at: now - 3.hours)
    add.call("dev-1", "OldName", elapsed_ms: 70_000, completed_at: now - 2.hours)
    add.call("dev-1", "  Ada  ", elapsed_ms: 60_000, completed_at: now - 1.hour, daily_on: Date.current)
    # Device 2: same person with different casing.
    add.call("dev-2", "ada", elapsed_ms: 50_000, completed_at: now, daily_on: Date.current - 1)
    # Device 3: never named -> excluded.
    add.call("dev-3", "   ", elapsed_ms: 40_000, completed_at: now)

    PuzzleRun.create!(id: SecureRandom.uuid, player_id: "dev-1", puzzle_on: Date.current - 1, cards: [],
                      started_at: now - 2.hours, completed_at: now - 1.hour, elapsed_ms: 35_000)
    PuzzleRun.create!(id: SecureRandom.uuid, player_id: "dev-phone", display_name: "ADA", puzzle_on: Date.current, cards: [],
                      started_at: now - 1.hour, completed_at: now, elapsed_ms: 29_000)

    top = SetStats.new.compute[:most_games]
    assert_equal [{ name: "ada", solo: 2, daily: 2, best_daily_ms: 50_000, best_puzzle_ms: 29_000, total: 4 }], top
  end

  test "ShareGrid caches daily medians for 1 hour and computes them from selected columns" do
    assert_equal 1.hour, ShareGrid::CACHE_TTL
    reset_games
    now = Time.current
    game = SoloGame.create!(id: SecureRandom.uuid, player_id: "p1", seed: "1", status: "completed", started_at: now - 2.minutes, daily_on: Date.current)
    SoloScore.create!(
      solo_game: game,
      player_id: "p1",
      elapsed_ms: 10_000,
      completed_at: now,
      daily_on: Date.current,
      events: [
        { "type" => "claim", "cards" => [1, 2, 3], "t_ms" => 3_000 },
        { "type" => "claim", "cards" => [4, 5, 6], "t_ms" => 10_000 }
      ]
    )

    medians = ShareGrid.compute_daily_medians
    assert_equal({ 0 => 3_000, 1 => 7_000 }, medians[:by_index])
    assert_equal({ 0 => 1, 1 => 1 }, medians[:samples])
    assert_equal 5_000, medians[:overall]
  end

  private

  def pacific(*args)
    ActiveSupport::TimeZone[DailyPuzzle::TIME_ZONE].local(*args)
  end

  def reset_games
    Rails.cache.clear
    [SoloScore, SoloGame, PuzzleRun].each(&:delete_all)
  end

  # A Practice game this player finished at `at`, two minutes after starting it.
  def finish(at, player)
    game = SoloGame.create!(id: SecureRandom.uuid, player_id: player, seed: "1", started_at: at - 2.minutes, status: "completed", completed_at: at)
    SoloScore.create!(solo_game: game, player_id: player, elapsed_ms: 120_000, completed_at: at, events: [])
  end

  # A game started at `at` that found a set and was never finished.
  def found_a_set(at, player)
    SoloGame.create!(id: SecureRandom.uuid, player_id: player, seed: "2", started_at: at, sets_found: 1,
      events: [{ "type" => "claim", "cards" => [1, 2, 3], "t_ms" => 1500 }])
  end

  # Everything on /stats that names a day or an hour: the charts' bars, their busiest days and axes, and the fun facts.
  def dated_parts_of_the_page
    get "/stats"
    assert_response :success
    [css_select(".days i").map { |bar| bar["data-tip"] }, css_select(".chart-stats, .axis, .days").map { |part| [part.text.squish, part["aria-label"]] }, facts]
  end

  # Runs the block as if the machine's own clock were set to `zone`.
  def with_server_zone(zone)
    before = ENV["TZ"]
    ENV["TZ"] = zone
    yield
  ensure
    ENV["TZ"] = before
  end

  # The players table as text: one array of cells per row.
  def player_rows
    css_select("table.players tbody tr").map { |tr| tr.css("th, td").map { |cell| cell.text.squish } }
  end

  # The fun facts as text: label, value and note per fact.
  def facts
    css_select(".facts > div").map { |fact| fact.css("dt, dd").map { |part| part.text.squish } }
  end

  # Each kind's example set is picked at random, so leave it out of the comparison.
  def comparable_stats
    stats = SetStats.new.compute.except(:generated_at)
    stats.merge(kinds: stats[:kinds].map { |kind| kind.except(:cards) })
  end
end
