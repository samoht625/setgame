# frozen_string_literal: true

# The spoiler-free grid on a Daily Deal share: one square per set found, in
# order. Each set's find time (the gap since the previous find, or the deal) is
# compared with the median gap for that same set number across every finished
# Daily Deal: green under 0.8x the median, red over 1.25x, yellow between.
# Where fewer than MIN_SAMPLES runs reached a set number, the square is only
# ever green (faster than the median of all gaps) or yellow.
module ShareGrid
  FAST = 0.8
  SLOW = 1.25
  MIN_SAMPLES = 5
  CACHE_TTL = 10.minutes

  module_function

  def gaps(claims)
    previous = 0
    Array(claims).map do |claim|
      t_ms = (claim[:t_ms] || claim["t_ms"]).to_i
      gap = [t_ms - previous, 0].max
      previous = t_ms
      gap
    end
  end

  # "gyr…" for a run's claims.
  def daily_marks(claims, medians: daily_medians)
    gaps(claims).each_with_index.map do |gap, index|
      by_index, samples, overall = medians.values_at(:by_index, :samples, :overall)
      if samples[index].to_i >= MIN_SAMPLES && by_index[index].to_i.positive?
        ratio = gap.to_f / by_index[index]
        ratio < FAST ? "g" : ratio > SLOW ? "r" : "y"
      else
        overall && gap < overall ? "g" : "y"
      end
    end.join
  end

  def daily_medians
    Rails.cache.fetch("share_grid/daily_medians/v1", expires_in: CACHE_TTL) { compute_daily_medians }
  end

  def compute_daily_medians
    columns = Hash.new { |hash, key| hash[key] = [] }
    SoloScore.where.not(daily_on: nil).find_each do |score|
      claims = score.claims
      next unless claims

      gaps(claims).each_with_index { |gap, index| columns[index] << gap }
    end
    {
      by_index: columns.transform_values { |values| median(values) },
      samples: columns.transform_values(&:length),
      overall: median(columns.values.flatten)
    }
  end

  def median(values)
    return nil if values.empty?

    sorted = values.sort
    mid = sorted.length / 2
    sorted.length.odd? ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
  end
end
