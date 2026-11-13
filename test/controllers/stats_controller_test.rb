# frozen_string_literal: true

require "test_helper"

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
    assert_equal ["Rank", "Player", "Games", "Practice", "Daily Deal", "Best Daily Deal", "Best Puzzle"], css_select("table.players thead th").map { |th| th.text.squish }
    assert_equal [["1", "Ada", "1", "0", "1", "5.0s", "38.0s"]], player_rows, "one row per named player: rank, name, games, the practice and daily split, best times"
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
    assert_equal [["1", "Rose", "1,230", "1,229", "1", "1:11", "23.2s"], ["2", "Practice only", "3", "3", "0", "–none", "–none"]], player_rows
    assert_select "table.players[role=table] tbody tr[role=row]:first-child" do
      assert_select "th[scope=row][role=rowheader]", "Rose"
      assert_select "td[role=cell]", 6
      assert_select ".badge.top1", "1"
    end
    assert_select "table.players tbody tr:last-child td.dly .nil", "0"
    assert_select "table.players tbody tr:last-child td.bdd .sr", "none", "a missing best is a dash to the eye and a word to a screen reader"
    assert_select "table.players tbody tr:last-child td.bdd [aria-hidden=true]", "–"
    assert_select ".tiles dd", text: "1,233"
  end

  test "an empty site gets an empty state instead of empty charts" do
    Rails.cache.clear
    [SoloScore, SoloGame, PuzzleRun].each(&:delete_all)

    get "/stats"
    assert_response :success
    assert_select "h1", "Stats"
    assert_equal %w[0 0 0 0×], css_select(".tiles dd").map(&:text)
    assert_select ".empty", /No sets found yet/
    assert_select ".empty a[href='/']", "Play the Daily Deal"
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

  private

  # The players table as text: one array of cells per row.
  def player_rows
    css_select("table.players tbody tr").map { |tr| tr.css("th, td").map { |cell| cell.text.squish } }
  end

  # Each kind's example set is picked at random, so leave it out of the comparison.
  def comparable_stats
    stats = SetStats.new.compute.except(:generated_at)
    stats.merge(kinds: stats[:kinds].map { |kind| kind.except(:cards) })
  end
end
