# frozen_string_literal: true

require "test_helper"

class DailyArchiveTest < ActiveSupport::TestCase
  LAUNCH = ClassicPuzzle::LAUNCH_DATE

  def pacific(*args)
    ActiveSupport::TimeZone[DailyPuzzle::TIME_ZONE].local(*args)
  end

  def puzzle_archive(last_closed)
    DailyArchive.new("puzzle", launch: LAUNCH, last_closed: last_closed)
  end

  def create_daily_game(date)
    SoloGame.create!(id: SecureRandom.uuid, player_id: SecureRandom.uuid, seed: DailyPuzzle.new(date).seed.to_s, status: "open", started_at: Time.current, daily_on: date)
  end

  test "a day closes two hours after it ends in Pacific time, and not a second sooner" do
    day = Date.new(2026, 11, 14)

    assert_equal day - 1, DailyPuzzle.last_closed_date(pacific(2026, 11, 14, 23, 59, 59)), "still being played"
    assert_equal day - 1, DailyPuzzle.last_closed_date(pacific(2026, 11, 15, 0, 0, 1)), "ended a second ago: runs started before midnight can still finish"
    assert_equal day - 1, DailyPuzzle.last_closed_date(pacific(2026, 11, 15, 1, 59, 59))
    assert_equal day, DailyPuzzle.last_closed_date(pacific(2026, 11, 15, 2, 0, 0))

    refute DailyPuzzle.closed?(day, pacific(2026, 11, 15, 1, 59, 59))
    assert DailyPuzzle.closed?(day, pacific(2026, 11, 15, 2, 0, 0))
    assert DailyPuzzle.closed?(day - 30, pacific(2026, 11, 15, 2, 0, 0))
    refute DailyPuzzle.closed?(day + 1, pacific(2026, 11, 15, 23, 59, 59)), "today is never closed"
    refute DailyPuzzle.closed?(day + 2, pacific(2026, 11, 15, 12)), "nor is tomorrow"
  end

  test "the day's clock is Pacific whatever zone the server's time is in" do
    # 9pm on Nov 14 in Los Angeles is already Nov 15 in New York and in UTC.
    evening = Time.utc(2026, 11, 15, 5)
    assert_equal Date.new(2026, 11, 14), DailyPuzzle.today(evening).date
    assert_equal Date.new(2026, 11, 13), DailyPuzzle.last_closed_date(evening)
    assert_equal Date.new(2026, 11, 13), DailyPuzzle.last_closed_date(evening.in_time_zone("America/New_York"))
    assert_equal Date.new(2026, 11, 13), DailyPuzzle.last_closed_date(evening.in_time_zone("Asia/Tokyo"))
  end

  test "the two hours are real hours across a daylight saving change" do
    # Clocks go back at 2am on Nov 1, 2026: Oct 31 ends at 07:00 UTC and closes at 09:00 UTC.
    assert_equal Date.new(2026, 10, 30), DailyPuzzle.last_closed_date(Time.utc(2026, 11, 1, 8, 59, 59))
    assert_equal Date.new(2026, 10, 31), DailyPuzzle.last_closed_date(Time.utc(2026, 11, 1, 9, 0, 0))
    # Clocks go forward at 2am on Mar 14, 2027: Mar 13 ends at 08:00 UTC and closes at 10:00 UTC.
    assert_equal Date.new(2027, 3, 12), DailyPuzzle.last_closed_date(Time.utc(2027, 3, 14, 9, 59, 59))
    assert_equal Date.new(2027, 3, 13), DailyPuzzle.last_closed_date(Time.utc(2027, 3, 14, 10, 0, 0))
  end

  test "the archive holds launch day through the last closed day, numbered like the game" do
    archive = puzzle_archive(Date.new(2026, 11, 14))

    assert_equal 21, archive.size
    assert_equal LAUNCH, archive.first_date
    assert_equal Date.new(2026, 11, 14), archive.last_date
    assert_equal LAUNCH, archive.day(1).date
    assert_equal Date.new(2026, 11, 14), archive.day(21).date
    assert_equal 21, archive.on(Date.new(2026, 11, 14)).number
    assert_equal (1..21).to_a.reverse, archive.days.map(&:number), "newest first"
    archive.days.each { |day| assert_equal ClassicPuzzle.new(day.date).number, day.number }

    day = archive.day(21)
    assert_equal ["puzzle", "Puzzle #21", "Set Puzzle #21", "/puzzle/21"], [day.kind, day.name, day.title, day.path]
    assert_equal "Set Daily Deal #3", DailyArchive.new("daily", launch: LAUNCH, last_closed: LAUNCH + 5).day(3).title
    assert_equal DailyShare::Result.new(kind: "puzzle", number: 21, elapsed_ms: 1000).title, day.title, "the name its share links carry"
  end

  test "today, tomorrow and days before launch are not in the archive" do
    archive = puzzle_archive(Date.new(2026, 11, 14))

    assert_nil archive.day(22), "today"
    assert_nil archive.day(23), "tomorrow"
    assert_nil archive.day(0)
    assert_nil archive.day(-1)
    assert_nil archive.on(Date.new(2026, 11, 15))
    assert_nil archive.on(LAUNCH - 1)
    refute archive.include?(Date.new(2026, 11, 15))
    refute archive.include?(LAUNCH - 1)
    refute archive.include?("2026-11-01"), "only dates"
    assert archive.include?(LAUNCH)
  end

  test "nothing is archived until the first day has closed, or when the game has never been played" do
    [puzzle_archive(LAUNCH - 1), puzzle_archive(LAUNCH - 40), DailyArchive.new("daily", launch: nil, last_closed: Date.new(2026, 11, 14))].each do |archive|
      assert archive.empty?
      assert_equal 0, archive.size
      assert_nil archive.first_date
      assert_nil archive.last_date
      assert_nil archive.day(1)
      assert_nil archive.find("1")
      assert_empty archive.days
      refute archive.include?(LAUNCH)
    end

    first = puzzle_archive(LAUNCH)
    assert_equal [1], first.days.map(&:number), "the first day ever, once it has closed"
    assert_nil first.day(2)
  end

  test "a URL names a day only by its plain number" do
    archive = puzzle_archive(Date.new(2026, 11, 14))

    assert_equal 1, archive.find("1").number
    assert_equal 21, archive.find("21").number
    ["22", "0", "00", "01", "021", "-1", "+1", "1.0", "1e1", "0x1", " 1", "1 ", "1\n", "one", "", "１", "2026-11-14", "1/2", "9999999", "99999999999999999999"].each do |param|
      assert_nil archive.find(param), "#{param.inspect} is not a day"
    end
    [nil, 1, 1.0, ["1"], { "number" => "1" }].each { |param| assert_nil archive.find(param), "#{param.inspect} is not a URL's number" }
  end

  test "an unknown game is refused" do
    assert_raises(ArgumentError) { DailyArchive.new("practice", launch: LAUNCH, last_closed: LAUNCH) }
    assert_raises(ArgumentError) { DailyArchive.for("practice") }
  end

  test "the archives follow the clock and each game's own launch" do
    create_daily_game(Date.new(2026, 10, 3))

    before = pacific(2026, 10, 26, 1, 59, 59)
    assert DailyArchive.for("puzzle", before).empty?, "the Puzzle's launch day has ended but not closed"
    assert_equal 22, DailyArchive.for("daily", before).size
    assert_equal Date.new(2026, 10, 3), DailyArchive.for("daily", before).day(1).date

    after = pacific(2026, 10, 26, 2, 0, 0)
    assert_equal [1], DailyArchive.for("puzzle", after).days.map(&:number)
    assert_equal 23, DailyArchive.for("daily", after).size
    assert_equal %w[puzzle daily], DailyArchive.all(after).map(&:kind), "the Puzzle first, as wherever the two are listed"

    archive = DailyArchive.for("daily", pacific(2026, 11, 15, 12))
    archive.days.each { |day| assert_equal DailyPuzzle.new(day.date).number, day.number }
    assert_equal DailyPuzzle.today(pacific(2026, 11, 15, 12)).number - 1, archive.size, "today is the day after the newest archived one"
  end

  test "the Daily Deal has no archive before anyone has played one" do
    assert_nil DailyPuzzle.launch_date
    assert DailyArchive.for("daily", pacific(2026, 11, 15, 12)).empty?

    create_daily_game(Date.new(2026, 11, 15))
    assert DailyArchive.for("daily", pacific(2026, 11, 15, 12)).empty?, "launch day itself is today"
    assert_equal 1, DailyArchive.for("daily", pacific(2026, 11, 16, 2)).size
  end

  test "the index pages through every date, newest first, with each game's day or a gap" do
    daily = DailyArchive.new("daily", launch: Date.new(2026, 10, 3), last_closed: Date.new(2026, 11, 14))
    puzzle = puzzle_archive(Date.new(2026, 11, 14))
    index = DailyArchive::Index.new([daily, puzzle])

    assert_equal 43, index.size
    assert_equal 2, index.pages
    first = index.rows(1)
    assert_equal 30, first.length
    assert_equal Date.new(2026, 11, 14), first.first.date
    assert_equal Date.new(2026, 10, 16), first.last.date
    assert_equal ["/daily/43", "/puzzle/21"], first.first.days.values_at("daily", "puzzle").map(&:path)
    assert_equal "/daily/22", first[21].days["daily"].path
    assert_nil first[21].days["puzzle"], "Oct 24 is before the Puzzle launched"

    last = index.rows(2)
    assert_equal 13, last.length
    assert_equal [Date.new(2026, 10, 15), Date.new(2026, 10, 3)], [last.first.date, last.last.date]
    assert_equal 1, last.last.days["daily"].number
    assert_empty index.rows(3)
    assert_empty index.rows(0)
    assert_empty index.rows(nil)

    assert_equal 1, index.page_number(nil)
    assert_equal 1, index.page_number("")
    assert_equal 1, index.page_number("1")
    assert_equal 2, index.page_number("2")
    ["3", "0", "-1", "01", "1.5", "two", " 1", "99999", ["1"], 1].each { |param| assert_nil index.page_number(param), "#{param.inspect} is not a page" }
  end

  test "an index with nothing archived is one empty page" do
    index = DailyArchive::Index.new([puzzle_archive(LAUNCH - 1), DailyArchive.new("daily", launch: nil, last_closed: LAUNCH)])

    assert index.empty?
    assert_equal 0, index.size
    assert_equal 1, index.pages
    assert_equal 1, index.page_number(nil)
    assert_nil index.page_number("2")
    assert_empty index.rows(1)
  end
end
