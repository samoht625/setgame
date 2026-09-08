# frozen_string_literal: true

# Set game rules engine
module Rules
  # Card attributes: number, color, shape, shading
  # Each attribute has values 0, 1, or 2
  # Mapping: card id (1-81) maps to base-3 representation of (id - 1),
  # least significant digit first. This matches the artwork in public/cards:
  #   digit 0 -> number  (0 = one, 1 = two, 2 = three)
  #   digit 1 -> color   (0 = red, 1 = purple, 2 = green)
  #   digit 2 -> shape   (0 = squiggle, 1 = diamond, 2 = oval)
  #   digit 3 -> shading (0 = solid, 1 = striped, 2 = open)

  def self.card_attributes(card_id)
    # Convert card_id (1-81) to base-3 digits (least significant first)
    base3 = (card_id - 1).digits(3)
    base3.fill(0, base3.length, 4 - base3.length) if base3.length < 4

    {
      number: base3[0],
      color: base3[1],
      shape: base3[2],
      shading: base3[3]
    }
  end

  # Each attribute's three values must sum to zero modulo 3.
  THIRD_CARDS = Array.new(81) do |first|
    Array.new(81) do |second|
      a = first
      b = second
      third = 1
      place = 1
      4.times do
        third += ((6 - a % 3 - b % 3) % 3) * place
        a /= 3
        b /= 3
        place *= 3
      end
      third
    end.freeze
  end.freeze
  private_constant :THIRD_CARDS

  def self.is_set?(card1_id, card2_id, card3_id)
    third = third_card(card1_id, card2_id)
    !third.nil? && third == card3_id
  end

  def self.third_card(card1_id, card2_id)
    return unless card1_id.is_a?(Integer) && card1_id.between?(1, 81)
    return unless card2_id.is_a?(Integer) && card2_id.between?(1, 81)

    THIRD_CARDS[card1_id - 1][card2_id - 1]
  end

  def self.set_exists?(board)
    return false if board.length < 3

    last_positions = {}
    board.each_with_index { |card, index| last_positions[card] = index }

    i = 0
    while i < board.length - 2
      j = i + 1
      while j < board.length - 1
        third = third_card(board[i], board[j])
        # The completing card must occupy a third position, even for repeated IDs.
        return true if third && last_positions.fetch(third, -1) > j

        j += 1
      end
      i += 1
    end

    false
  end
end
