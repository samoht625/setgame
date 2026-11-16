# frozen_string_literal: true

require "date"

# The closed days of one daily game (the Daily Deal or the Puzzle), numbered
# the way the game numbers them: day 1 is its launch day, the same number its
# share links and result cards show.
#
# A day is in the archive only once it has closed (DailyPuzzle.last_closed_date):
# today, a day still inside its finishing grace, a day before launch and
# anything that isn't a plain day number are simply not there. Everything
# that shows a past day's board or solution goes through here, so none of it
# can be reached for a day that is still being played.
#
# Plain Ruby on purpose: dates in, dates and numbers out, no clock and no
# database (DailyArchive.for supplies those).
class DailyArchive
  # In the order the two are listed wherever they appear side by side: the
  # Puzzle, which is the home page, then the Daily Deal.
  KINDS = %w[puzzle daily].freeze
  NAMES = { "puzzle" => "Puzzle", "daily" => "Daily Deal" }.freeze
  # A day number as it appears in a URL: digits only, no sign, no leading
  # zero, so every day has exactly one address.
  NUMBER = /\A[1-9][0-9]{0,5}\z/

  Day = Struct.new(:kind, :number, :date) do
    def name
      "#{NAMES.fetch(kind)} ##{number}"
    end

    # Matches DailyShare::Result#title.
    def title
      "Set #{name}"
    end

    def path
      "/#{kind}/#{number}"
    end
  end

  attr_reader :kind, :launch, :last_closed

  def self.for(kind, now = Time.current)
    kind = kind.to_s
    raise ArgumentError, "unknown daily: #{kind}" unless KINDS.include?(kind)

    launch = kind == "puzzle" ? ClassicPuzzle::LAUNCH_DATE : DailyPuzzle.launch_date
    new(kind, launch: launch, last_closed: DailyPuzzle.last_closed_date(now))
  end

  def self.all(now = Time.current)
    KINDS.map { |kind| self.for(kind, now) }
  end

  # `launch` is the game's first day (nil when it has never been played);
  # `last_closed` the latest closed day.
  def initialize(kind, launch:, last_closed:)
    raise ArgumentError, "unknown daily: #{kind}" unless KINDS.include?(kind)

    @kind = kind
    @launch = launch
    @last_closed = last_closed
  end

  # How many days are in the archive; also the number of the latest one.
  def size
    return 0 unless launch && last_closed

    [(last_closed - launch).to_i + 1, 0].max
  end

  def empty?
    size.zero?
  end

  def first_date
    launch unless empty?
  end

  def last_date
    last_closed unless empty?
  end

  def include?(date)
    date.is_a?(Date) && !empty? && date >= launch && date <= last_closed
  end

  def number_for(date)
    (date - launch).to_i + 1 if include?(date)
  end

  def date_for(number)
    launch + (number - 1) if number.is_a?(Integer) && number.between?(1, size)
  end

  # The day with this number, or nil when it isn't in the archive.
  def day(number)
    date = date_for(number)
    Day.new(kind, number, date) if date
  end

  def on(date)
    number = number_for(date)
    Day.new(kind, number, date) if number
  end

  # The day a URL's number names; nil for anything but the number of a closed day.
  def find(param)
    day(param.to_i) if param.is_a?(String) && NUMBER.match?(param)
  end

  # Newest first.
  def days
    size.downto(1).map { |number| day(number) }
  end

  # Every closed day of both games as one calendar, newest first, in pages.
  class Index
    PER_PAGE = 30
    PAGE = /\A[1-9][0-9]{0,3}\z/

    Row = Struct.new(:date, :days)

    attr_reader :archives

    def initialize(archives)
      @archives = archives.reject(&:empty?)
    end

    def empty?
      archives.empty?
    end

    def first_date
      archives.map(&:first_date).min
    end

    def last_date
      archives.map(&:last_date).max
    end

    # How many dates have at least one closed day.
    def size
      empty? ? 0 : (last_date - first_date).to_i + 1
    end

    def pages
      [(size + PER_PAGE - 1) / PER_PAGE, 1].max
    end

    # The page a URL's ?page= names: 1 when absent, nil when it isn't a page.
    def page_number(param)
      return 1 if param.nil? || param == ""
      return unless param.is_a?(String) && PAGE.match?(param)

      number = param.to_i
      number if number <= pages
    end

    def rows(page)
      return [] unless page.is_a?(Integer) && page.between?(1, pages) && !empty?

      newest = last_date - (page - 1) * PER_PAGE
      oldest = [newest - (PER_PAGE - 1), first_date].max
      newest.downto(oldest).map do |date|
        Row.new(date, archives.to_h { |archive| [archive.kind, archive.on(date)] })
      end
    end
  end
end
