# frozen_string_literal: true

# Set game rules engine
module Rules
  # Card attributes: number, shape, shading, color
  # Each attribute has values 0, 1, or 2
  # Mapping: card id (1-81) maps to base-3 representation
  # id-1 in base-3 gives us [number, shape, shading, color]
  
  def self.card_attributes(card_id)
    # Convert card_id (1-81) to base-3 representation
    # Each digit represents an attribute
    base3 = (card_id - 1).digits(3)
    base3.fill(0, base3.length, 4 - base3.length) if base3.length < 4
    
    {
      number: base3[0],
      shape: base3[1],
      shading: base3[2],
      color: base3[3]
    }
  end
  
  # Check if three cards form a valid set
  # For each attribute, all three cards must be either:
  # - all the same value, OR
  # - all different values
  def self.is_set?(card1_id, card2_id, card3_id)
    attrs1 = card_attributes(card1_id)
    attrs2 = card_attributes(card2_id)
    attrs3 = card_attributes(card3_id)
    
    %i[number shape shading color].all? do |attr|
      vals = [attrs1[attr], attrs2[attr], attrs3[attr]]
      unique_count = vals.uniq.length
      unique_count == 1 || unique_count == 3
    end
  end
  
  # Given two cards, calculate the third card that would form a set
  # For each attribute, if the two cards are the same, the third must be the same
  # If they're different, the third must be the third unique value
  def self.third_card(card1_id, card2_id)
    attrs1 = card_attributes(card1_id)
    attrs2 = card_attributes(card2_id)
    
    third_attrs = %i[number shape shading color].map do |attr|
      val1 = attrs1[attr]
      val2 = attrs2[attr]
      
      if val1 == val2
        val1
      else
        # Find the third value (0, 1, or 2)
        (0..2).find { |v| v != val1 && v != val2 }
      end
    end
    
    # Convert back to card id
    # third_attrs is [number, shape, shading, color]
    card_id = third_attrs.each_with_index.sum do |val, idx|
      val * (3**idx)
    end
    
    card_id + 1
  end
  
  # Check if there's at least one set in the given board
  def self.set_exists?(board)
    return false if board.length < 3
    
    # Try all combinations of 3 cards
    board.combination(3).any? do |cards|
      is_set?(cards[0], cards[1], cards[2])
    end
  end
end

