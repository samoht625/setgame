# frozen_string_literal: true

require "test_helper"

class ArchiveControllerTest < ActionDispatch::IntegrationTest
  DAY = Date.new(2026, 11, 14)
  TODAY = DAY + 1
  # Noon Pacific on TODAY: DAY (Puzzle #21) closed ten hours ago and Puzzle #22 is live.
  NOON = Time.utc(2026, 11, 15, 20)
  # DAY ends at midnight Pacific (08:00 UTC) and closes two hours later.
  ENDED = Time.utc(2026, 11, 15, 8, 0, 0)
  CLOSED = Time.utc(2026, 11, 15, 10, 0, 0)

  def create_daily_score(date, elapsed_ms:, player_id: SecureRandom.uuid, name: nil)
    game = SoloGame.create!(id: SecureRandom.uuid, player_id: player_id, seed: DailyPuzzle.new(date).seed.to_s, status: "completed", started_at: Time.current, daily_on: date)
    SoloScore.create!(solo_game: game, player_id: player_id, display_name: name, elapsed_ms: elapsed_ms, completed_at: Time.current, daily_on: date, misses: 0, events: [])
  end

  def create_puzzle_run(date, elapsed_ms:, player_id: SecureRandom.uuid, name: nil)
    puzzle = ClassicPuzzle.new(date)
    claims = puzzle.sets.each_with_index.map { |set, i| { "cards" => set, "t_ms" => (i + 1) * 1_000 } }
    PuzzleRun.create!(id: SecureRandom.uuid, player_id: player_id, puzzle_on: date, cards: puzzle.cards, started_at: Time.current, display_name: name,
                      elapsed_ms: elapsed_ms, completed_at: Time.current, claims: claims, misses: 0)
  end

  def play_data
    JSON.parse(css_select("#archive-play").first["data-archive"])
  end

  def card_labels(selector)
    css_select("#{selector} svg[role=img]").map { |svg| svg["aria-label"] }
  end

  def describe(card)
    a = Rules.card_attributes(card)
    shape = StatsHelper::SHAPES[a[:shape]]
    "#{a[:number] + 1} #{%w[solid striped open][a[:shading]]} #{StatsHelper::INKS[a[:color]].first} #{shape}#{'s' unless a[:number].zero?}"
  end

  # Everything today's games must keep to themselves, as it would appear in a page or a JSON body.
  def todays_secrets
    puzzle = ClassicPuzzle.new(TODAY)
    [puzzle.cards.to_json, puzzle.cards.join(","), puzzle.sets.first.to_json, DailyPuzzle.new(TODAY).seed.to_s]
  end

  # The page's content exactly as served, byte for byte.
  def served_main(body = response.body)
    body[%r{<main\b.*</main>}m] || flunk("no <main> in the page")
  end

  def assert_nothing_of_today(body, where)
    todays_secrets.each { |secret| refute_includes body, secret, "#{where} gives away today's game" }
  end

  test "a past Puzzle's page carries its board, solution and final leaderboard in the HTML" do
    travel_to NOON do
      rose = create_puzzle_run(DAY, elapsed_ms: 65_000, name: "Rose")
      anonymous = create_puzzle_run(DAY, elapsed_ms: 42_000)
      create_puzzle_run(DAY, elapsed_ms: 80_000, name: "Tom & <b>Jerry</b>")
      create_daily_score(DAY - 3, elapsed_ms: 200_000)
      puzzle = ClassicPuzzle.new(DAY)

      get "/puzzle/21"
      assert_response :success

      assert_select "title", "Puzzle #21 | Set Daily"
      description = css_select("meta[name=description]").first["content"]
      assert_includes description, "Set Puzzle #21, the daily Set puzzle for Saturday, November 14, 2026"
      assert_includes description, "3 players finished it; the fastest took 0:42."
      assert_select "link[rel=canonical][href='https://setdaily.app/puzzle/21']"
      assert_select "meta[property='og:url'][content='https://setdaily.app/puzzle/21']"
      assert_select "meta[property='og:title'][content='Puzzle #21 | Set Daily']"
      assert_select "h1", "Set Puzzle #21"
      assert_select "time[datetime='2026-11-14']", "Saturday, November 14, 2026"

      assert_equal puzzle.cards.map { |card| describe(card) }, card_labels("#archive-board"), "the board, readable without the script"
      assert_select "#archive-solution ol > li", 6
      assert_equal puzzle.sets.flatten.map { |card| describe(card) }, card_labels("#archive-solution"), "all six sets"
      assert_select "#archive-solution h2", "Solution: all 6 sets"

      rows = css_select("#archive-leaderboard-title").first.parent.parent.css("ol > li").map { |li| li.css("span").map { |span| span.text.strip } }
      assert_equal [["1", "Anonymous", "0:42"], ["2", "Rose", "1:05"], ["3", "Tom & <b>Jerry</b>", "1:20"]], rows
      assert_includes response.body, "Tom &amp; &lt;b&gt;Jerry&lt;/b&gt;", "names are text, never markup"
      [rose, anonymous].each { |run| refute_includes response.body, run.player_id, "player ids stay off the page" }
      refute_includes response.body, rose.id, "and so do run ids"

      assert_equal({ "kind" => "puzzle", "number" => 21, "date" => "2026-11-14", "total" => 3, "times" => [42_000, 65_000, 80_000], "cards" => puzzle.cards }, play_data)
      assert_select "a[rel=prev][href='/puzzle/20']", "←Puzzle #20"
      assert_select "a[rel=next]", 0, "the next one is today's"
      assert_select "a[href='/daily/4']", "That day’s Daily Deal #4"
      assert_select "a[href='/']", "Today’s Puzzle"
      assert_select "a[href='/archive']", minimum: 2
      assert_select "#site-header", 1
      assert_select "#root", 0, "the game itself is not mounted here"
      assert_nothing_of_today response.body, "a past day's page"
    end
  end

  test "a past Daily Deal's page carries its opening board, the sets on it, its seed and its leaderboard" do
    travel_to NOON do
      create_daily_score(DAY - 3, elapsed_ms: 200_000)
      ada = create_daily_score(DAY, elapsed_ms: 185_000, name: "Ada")
      seed = DailyPuzzle.new(DAY).seed
      board = SoloReplay::Simulator.new(seed).board

      get "/daily/4"
      assert_response :success

      assert_select "title", "Daily Deal #4 | Set Daily"
      assert_includes css_select("meta[name=description]").first["content"], "Set Daily Deal #4, the Set Daily Deal for Saturday, November 14, 2026"
      assert_includes css_select("meta[name=description]").first["content"], "1 player finished it; the fastest took 3:05."
      assert_select "link[rel=canonical][href='https://setdaily.app/daily/4']"
      assert_select "h1", "Set Daily Deal #4"
      assert_equal board.map { |card| describe(card) }, card_labels("#archive-board")
      sets = ClassicPuzzle.sets_in(board)
      assert_select "#archive-solution ol > li", sets.length
      assert_select "#archive-solution h2", "#{sets.length} #{sets.length == 1 ? 'set' : 'sets'} on the opening board"
      assert_equal({ "kind" => "daily", "number" => 4, "date" => "2026-11-14", "total" => 1, "times" => [185_000], "seed" => seed }, play_data)
      assert_includes response.body, "Ada"
      refute_includes response.body, ada.player_id
      assert_select "a[rel=prev][href='/daily/3']"
      assert_select "a[href='/puzzle/21']", "That day’s Puzzle #21"
      assert_select "a[href='/daily']", "Today’s Daily Deal"
      assert_nothing_of_today response.body, "a past day's page"
    end
  end

  test "a day nobody finished still has its page" do
    travel_to NOON do
      get "/puzzle/20"
      assert_response :success
      assert_select "#archive-board li", 12
      assert_includes response.body, "Nobody finished this one on the day."
      assert_includes css_select("meta[name=description]").first["content"], "Nobody finished it that day."
      assert_equal [0, []], play_data.values_at("total", "times")
    end
  end

  test "today's number goes to the live game, and nothing of today's is served" do
    travel_to NOON do
      create_daily_score(DAY - 3, elapsed_ms: 200_000)
      create_puzzle_run(TODAY, elapsed_ms: 30_000, name: "Early")
      create_daily_score(TODAY, elapsed_ms: 150_000, name: "Early")
      assert_equal [22, 5], [ClassicPuzzle.today.number, DailyPuzzle.today.number]

      get "/puzzle/22"
      assert_redirected_to "/"
      assert_nothing_of_today response.body, "the redirect"
      get "/daily/5"
      assert_redirected_to "/daily"
      assert_nothing_of_today response.body, "the redirect"

      ["/archive", "/puzzle/21", "/daily/4", "/sitemap.xml", "/api/archive/puzzle/21", "/api/archive/daily/4"].each do |path|
        get path, headers: { "X-Player-Id" => SecureRandom.uuid }
        assert_response :success
        assert_nothing_of_today response.body, path
        refute_includes response.body, "/puzzle/22", "#{path} links to no page for today"
        refute_includes response.body, "/daily/5", "#{path} links to no page for today"
      end
      ["/api/archive/puzzle/22", "/api/archive/daily/5"].each do |path|
        get path, headers: { "X-Player-Id" => SecureRandom.uuid }
        assert_response :not_found
        assert_equal({ "error" => "not_found" }, JSON.parse(response.body))
      end
    end
  end

  test "future days, days before launch and anything that isn't a day number are not found" do
    travel_to NOON do
      create_daily_score(DAY - 3, elapsed_ms: 200_000)

      %w[
        /puzzle/23 /puzzle/24 /puzzle/400 /puzzle/999999 /puzzle/9999999 /puzzle/99999999999999999999
        /daily/6 /daily/7 /daily/99999
        /puzzle/0 /daily/0 /puzzle/-1 /puzzle/00 /puzzle/01 /puzzle/021 /puzzle/+21 /puzzle/21.0 /puzzle/21.json /puzzle/21.html /puzzle/21.xml
        /puzzle/1e1 /puzzle/0x15 /puzzle/abc /puzzle/21abc /puzzle/2026-11-14 /puzzle/2026-11-15 /puzzle/today /puzzle/latest
        /puzzle/21%20 /puzzle/%2021 /puzzle/21%0A /puzzle/%EF%BC%91 /daily/2026-11-14 /daily/yesterday
      ].each do |path|
        get path
        assert_response :not_found, path
        refute_includes response.body, "archive-board", "#{path} shows no board"
        refute_includes response.body, "data-archive", "#{path} carries no deal"
        assert_nothing_of_today response.body, path
      end
    end
  end

  test "a day opens the moment it closes, two hours after it ends" do
    create_daily_score(DAY - 3, elapsed_ms: 200_000)
    board = ClassicPuzzle.new(DAY).cards.to_json
    seed = DailyPuzzle.new(DAY).seed.to_s
    paths = ["/puzzle/21", "/daily/4", "/api/archive/puzzle/21", "/api/archive/daily/4"]

    [ENDED - 1.second, NOON - 1.day].each do |live|
      travel_to live do
        get "/puzzle/21"
        assert_redirected_to "/", "still today's"
        get "/daily/4"
        assert_redirected_to "/daily"
      end
    end

    [ENDED, ENDED + 1.second, CLOSED - 1.second].each do |in_grace|
      travel_to in_grace do
        paths.each do |path|
          get path, headers: { "X-Player-Id" => SecureRandom.uuid }
          assert_response :not_found, "#{path} at #{in_grace}: ended, but runs can still finish"
          refute_includes response.body, board
          refute_includes response.body, seed
          refute_includes response.body, "archive-board"
        end
        get "/archive"
        refute_includes response.body, "/puzzle/21"
        refute_includes response.body, "/daily/4"
        get "/sitemap.xml"
        refute_includes response.body, "/puzzle/21<"
        refute_includes response.body, "/daily/4<"
      end
    end

    [CLOSED, CLOSED + 1.second].each do |closed|
      travel_to closed do
        paths.each do |path|
          get path, headers: { "X-Player-Id" => SecureRandom.uuid }
          assert_response :success, "#{path} at #{closed}"
        end
        get "/puzzle/21"
        assert_includes CGI.unescapeHTML(response.body), board
        get "/daily/4"
        assert_includes CGI.unescapeHTML(response.body), %("seed":#{seed})
        get "/archive"
        assert_select "a[href='/puzzle/21']", 1
        assert_select "a[href='/daily/4']", 1
        get "/sitemap.xml"
        assert_includes response.body, "<loc>https://setdaily.app/puzzle/21</loc>"
        assert_includes response.body, "<loc>https://setdaily.app/daily/4</loc>"
      end
    end
  end

  test "the first day ever opens when it closes and has no day before it" do
    launch_closes = Time.utc(2026, 10, 26, 9)

    travel_to launch_closes - 1.second do
      get "/puzzle/1"
      assert_response :not_found
      get "/archive"
      assert_response :success
      assert_includes response.body, "No past days yet"
      assert_select "a[href^='/puzzle/']", 0
    end

    travel_to launch_closes do
      get "/puzzle/1"
      assert_response :success
      assert_select "h1", "Set Puzzle #1"
      assert_select "a[rel=prev]", 0
      assert_select "a[rel=next]", 0
      get "/puzzle/2"
      assert_redirected_to "/"
      get "/daily/1"
      assert_redirected_to "/daily", "no Daily Deal played yet: #1 is today's"
      get "/daily/2"
      assert_response :not_found
    end
  end

  test "the index lists every closed day of both games, newest first, a page at a time" do
    travel_to NOON do
      create_daily_score(Date.new(2026, 10, 3), elapsed_ms: 200_000)
      create_puzzle_run(DAY, elapsed_ms: 65_000)
      create_puzzle_run(DAY, elapsed_ms: 42_000)
      create_daily_score(DAY, elapsed_ms: 185_000)
      create_puzzle_run(TODAY, elapsed_ms: 20_000)

      get "/archive"
      assert_response :success
      assert_select "title", "Archive | Set Daily"
      assert_select "link[rel=canonical][href='https://setdaily.app/archive']"
      assert_select "h1", "Archive"
      assert_select "main ol > li", 30
      assert_select "main ol > li:first-child time[datetime='2026-11-14']"
      assert_select "main ol > li:first-child a[href='/puzzle/21']", /Puzzle #21\s+2 finishers · best 0:42/
      assert_select "main ol > li:first-child a[href='/daily/43']", /Daily Deal #43\s+1 finisher · best 3:05/
      assert_equal %w[/puzzle/21 /daily/43], css_select("main ol > li:first-child a").map { |link| link["href"] }, "the Puzzle's tile comes first"
      assert_includes css_select("main header p").first.text, "Every past Puzzle and Daily Deal"
      assert_match(/\AEvery past daily Set Puzzle and Set Daily Deal/, css_select("meta[name=description]").first["content"])
      assert_select "a[href='/puzzle/20']", /Puzzle #20\s+No finishers/
      assert_select "a[href='/puzzle/22']", 0, "today's is not listed"
      assert_select "a[href='/daily/44']", 0
      assert_select "a[href='/puzzle/1']", 1
      assert_select "a[href='/daily/14']", 1
      assert_select "a[href='/daily/13']", 0, "that's on the next page"
      assert_equal [["/archive?page=2", "Older→"]], css_select("a[rel=next]").map { |link| [link["href"], link.text] }
      assert_select "a[rel=prev]", 0
      assert_includes response.body, "Page 1 of 2"

      get "/archive", params: { page: "2" }
      assert_response :success
      assert_select "title", "Archive, page 2 | Set Daily"
      assert_equal "https://setdaily.app/archive?page=2", css_select("link[rel=canonical]").first["href"]
      assert_select "main ol > li", 13
      assert_select "a[href='/daily/13']", 1
      assert_select "main ol > li:last-child a[href='/daily/1']", 1
      assert_select "main a[href^='/puzzle/']", 0, "these days are before the Puzzle launched"
      assert_select "a[rel=prev][href='/archive']", "←Newer"
      assert_select "a[rel=next]", 0

      get "/archive", params: { page: "1" }
      assert_response :success
      assert_select "link[rel=canonical][href='https://setdaily.app/archive']"

      ["3", "0", "-1", "01", "2.0", "two", "99999"].each do |page|
        get "/archive", params: { page: page }
        assert_response :not_found, "page=#{page}"
      end
      get "/archive?page[]=1"
      assert_response :not_found
    end
  end

  test "the index is the same list for every visitor: what a player has played is added by the script, not served" do
    travel_to NOON do
      player = SecureRandom.uuid
      create_daily_score(Date.new(2026, 10, 3), elapsed_ms: 200_000)
      create_puzzle_run(DAY, elapsed_ms: 42_000)
      create_puzzle_run(DAY, elapsed_ms: 65_432, player_id: player)
      create_daily_score(DAY, elapsed_ms: 150_000)
      create_daily_score(DAY, elapsed_ms: 185_432, player_id: player)
      create_daily_score(Date.new(2026, 10, 5), elapsed_ms: 200_000)
      create_daily_score(Date.new(2026, 10, 5), elapsed_ms: 251_432, player_id: player)

      # A browser the server knows as that player.
      get "/api/archive", headers: { "X-Player-Id" => player }
      assert_equal %w[43], JSON.parse(response.body).fetch("daily").keys, "the script can ask for this player's days"
      pages = ["/archive", "/archive?page=2"].to_h do |path|
        get path
        assert_response :success
        assert_select "meta[name='setgame-player-id'][content=?]", player
        [path, served_main]
      end

      # Each tile says which day it is and leaves room for the script to mark it.
      assert_select "ol[data-archive-page='2']", 1
      get "/archive"
      assert_select "ol[data-archive-page='1']", 1
      assert_select "a[data-archive-tile]", 30 + 21
      assert_select "a[href='/daily/43'][data-archive-tile='daily:43'][data-archive-date='2026-11-14']", 1
      assert_select "a[href='/puzzle/21'][data-archive-tile='puzzle:21'][data-archive-date='2026-11-14']", 1
      assert_select "a[href='/puzzle/1'][data-archive-tile='puzzle:1'][data-archive-date='2026-10-25']", 1
      assert_select "a[data-archive-tile] [data-archive-status]", 30 + 21
      css_select("a[data-archive-tile] [data-archive-status]").each { |slot| assert_empty slot.inner_html, "nothing about any player is served in a tile" }
      assert_select "[data-played]", 0

      ["1:05", "3:05", "4:11", "65432", "185432", "251432", "On the day", "Practice", "Not played"].each do |own|
        pages.each { |path, html| refute_includes html, own, "the player's own result (#{own}) is not in the list #{path} serves" }
      end
      assert_includes pages.fetch("/archive"), "2 finishers · best 0:42", "only the day's own figures"
      assert_includes pages.fetch("/archive"), "2 finishers · best 2:30"

      # Someone else, and a browser the server has never seen, get the same list.
      [{ "X-Player-Id" => SecureRandom.uuid }, nil].each do |headers|
        open_session do |visitor|
          visitor.get "/api/archive", headers: headers if headers
          pages.each do |path, html|
            visitor.get path
            visitor.assert_response :success
            assert_equal html, served_main(visitor.response.body), "#{path} for #{headers ? 'another player' : 'a new browser'}"
          end
        end
      end

      # A crawler too.
      get "/archive", headers: { "User-Agent" => "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" }
      assert_equal pages.fetch("/archive"), served_main
    end
  end

  test "every game page has a link to the archive that a crawler can follow" do
    travel_to NOON do
      ["/", "/puzzle", "/daily", "/practice", "/m"].each do |path|
        get path
        assert_select "a[href='/archive']", { minimum: 1 }, path
      end
    end
  end

  test "search crawlers get the archive, not the unsupported-browser page" do
    travel_to NOON do
      create_daily_score(DAY - 3, elapsed_ms: 200_000)
      ["Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)"].each do |crawler|
        ["/archive", "/puzzle/21", "/daily/4", "/sitemap.xml"].each do |path|
          get path, headers: { "User-Agent" => crawler }
          assert_response :success, "#{path} for #{crawler}"
        end
        get "/puzzle/21", headers: { "User-Agent" => crawler }
        assert_select "#archive-board li", 12
        assert_select "#archive-solution ol > li", 6
      end
    end
  end

  test "visiting the archive writes nothing" do
    travel_to NOON do
      player = SecureRandom.uuid
      create_daily_score(DAY - 3, elapsed_ms: 200_000)
      create_puzzle_run(DAY, elapsed_ms: 65_000, player_id: player)
      create_daily_score(DAY, elapsed_ms: 185_000, player_id: player)
      headers = { "X-Player-Id" => player }
      before = [SoloGame, SoloScore, PuzzleRun].map { |model| model.order(:id).map(&:attributes) }
      streaks = [DailyPuzzle.today.streak_for(player), ClassicPuzzle.today.streak_for(player)]

      3.times do
        ["/archive", "/puzzle/21", "/daily/4", "/puzzle/20", "/sitemap.xml", "/api/archive/puzzle/21", "/api/archive/daily/4", "/api/archive/puzzle/20"].each do |path|
          get path, headers: headers
          assert_response :success
        end
      end

      assert_equal before, [SoloGame, SoloScore, PuzzleRun].map { |model| model.order(:id).map(&:attributes) }
      assert_equal streaks, [DailyPuzzle.today.streak_for(player), ClassicPuzzle.today.streak_for(player)]
      get "/api/puzzle", headers: headers
      assert_equal false, JSON.parse(response.body).dig("me", "attempted"), "today's Puzzle is still unplayed"
      get "/api/daily", headers: headers
      assert_equal false, JSON.parse(response.body).dig("me", "attempted")
    end
  end
end
