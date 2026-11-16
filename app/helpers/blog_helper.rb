# frozen_string_literal: true

# How a blog post writes the figures it quotes.
module BlogHelper
  NUMBER_WORDS = %w[zero one two three four five six seven eight nine ten].freeze

  # Milliseconds as whole seconds: 15012 is 15.
  def whole_seconds(ms)
    (ms / 1000.0).round
  end

  # A pair of times as a range of whole seconds, "3–4"; one number when they round the same.
  def seconds_range(range_ms)
    low, high = range_ms.map { |ms| whole_seconds(ms) }
    low == high ? low.to_s : "#{low}–#{high}"
  end

  # A small count spelled out, as running text has it; digits past ten.
  def number_word(n)
    NUMBER_WORDS[n] || n.to_s
  end

  # "Nov 15, 2026", as the archive writes its days.
  def post_date(date)
    date.strftime("%b %-d, %Y")
  end
end
