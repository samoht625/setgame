# frozen_string_literal: true

# A player's one try at a day's classic Puzzle (see ClassicPuzzle).
class PuzzleRun < ApplicationRecord
  self.primary_key = "id"

  validates :player_id, presence: true
  validates :puzzle_on, presence: true
  validates :started_at, presence: true

  scope :finished, -> { where.not(completed_at: nil) }

  def finished?
    completed_at.present?
  end

  # Claims as {cards: [a, b, c], t_ms:}, oldest first.
  def found
    Array(claims).filter_map do |claim|
      cards = claim["cards"]
      t_ms = claim["t_ms"]
      next unless cards.is_a?(Array) && cards.length == 3 && t_ms.is_a?(Integer)

      { cards: cards, t_ms: t_ms }
    end
  end
end
