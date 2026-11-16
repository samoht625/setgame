# frozen_string_literal: true

module ArchiveHelper
  CARD_FRAME = "overflow-hidden rounded-xl border border-neutral-200 bg-white dark:border-neutral-500/50 dark:bg-[#f1f0ec]"
  MINI_CARD_FRAME = "min-w-0 flex-1 overflow-hidden rounded-md border border-neutral-200 bg-white dark:border-neutral-500/50 dark:bg-[#f1f0ec]"
  RANK_BADGES = [
    "bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300",
    "bg-neutral-200 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300",
    "bg-orange-100 text-orange-700 dark:bg-orange-900/60 dark:text-orange-300"
  ].freeze

  # "1:05", like formatTime in the game.
  def archive_time(ms)
    seconds = ms.to_i / 1000
    format("%d:%02d", seconds / 60, seconds % 60)
  end

  # "Saturday, November 14, 2026"
  def archive_long_date(date)
    date.strftime("%A, %B %-d, %Y")
  end

  # "Nov 14, 2026"
  def archive_short_date(date)
    date.strftime("%b %-d, %Y")
  end

  # A card on the board, framed like the game's.
  def archive_card(id)
    tag.li(set_card_svg(id, css: "block h-auto w-full"), class: CARD_FRAME)
  end

  # Three small cards side by side: one set.
  def archive_set(cards)
    safe_join(cards.map { |id| tag.span(set_card_svg(id, css: "block h-auto w-full"), class: MINI_CARD_FRAME) })
  end

  def archive_rank_badge(rank)
    RANK_BADGES[rank - 1] || "text-neutral-600 dark:text-neutral-300"
  end

  # "17 players finished it; the fastest took 0:42." for the page's text and description.
  def archive_summary(day)
    return "Nobody finished it that day." if day.total.zero?

    "#{pluralize(day.total, 'player')} finished it; the fastest took #{archive_time(day.best_ms)}."
  end

  def archive_day_title(day)
    what = day.puzzle? ? "Board, Solution and Leaderboard" : "Opening Board and Leaderboard"
    "#{day.title} · #{archive_short_date(day.date)} · #{what}"
  end

  def archive_day_description(day)
    intro = if day.puzzle?
      "#{day.title}, the daily Set puzzle for #{archive_long_date(day.date)}: the 12-card board, all 6 sets and the day's leaderboard."
    else
      "#{day.title}, the Set Daily Deal for #{archive_long_date(day.date)}: the opening board, its sets and the day's leaderboard."
    end
    "#{intro} #{archive_summary(day)} Play it again as practice."
  end
end
