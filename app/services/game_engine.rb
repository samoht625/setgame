# frozen_string_literal: true

# Game engine manages the state of the Set game
class GameEngine
  include Rules
  
  attr_reader :board, :deck, :scores, :status
  
  def initialize
    @board = []
    @deck = []
    @scores = {} # player_id => score
    @status = 'playing'
    @mutex = Mutex.new
    start_new_round
  end
  
  # Start a new round: shuffle deck, deal initial board
  def start_new_round
    @mutex.synchronize do
      @deck = (1..81).to_a.shuffle
      @board = []
      deal_cards(12)
      
      # If no set exists, add 3 more cards (up to 15, then 18)
      while @board.length < 18 && !Rules.set_exists?(@board)
        deal_cards(3)
      end
      
      @status = 'playing'
    end
  end
  
  # Deal cards from deck to board
  def deal_cards(count)
    count.times do
      break if @deck.empty?
      @board << @deck.shift
    end
  end
  
  # Player claims a set of three cards
  # Returns: { success: bool, message: string, new_state: hash }
  def claim_set(player_id, card_ids)
    @mutex.synchronize do
      # Validate input
      if card_ids.length != 3
        return { success: false, message: 'Must select exactly 3 cards' }
      end
      
      # Check if cards are still on board
      unless card_ids.all? { |id| @board.include?(id) }
        return { success: false, message: 'One or more cards are no longer on the board' }
      end
      
      # Check if it's a valid set
      unless Rules.is_set?(card_ids[0], card_ids[1], card_ids[2])
        return { success: false, message: 'Not a valid set' }
      end
      
      # Remove cards from board
      card_ids.each { |id| @board.delete(id) }
      
      # Deal replacement cards (3 cards)
      deal_cards(3)
      
      # If no set exists and we have cards left, add more
      while @board.length < 18 && !Rules.set_exists?(@board) && !@deck.empty?
        deal_cards(3)
      end
      
      # Award point
      @scores[player_id] ||= 0
      @scores[player_id] += 1
      
      # Check if round is over (deck empty and no sets on board)
      if @deck.empty? && !Rules.set_exists?(@board)
        @status = 'round_over'
        # Schedule new round after 5 seconds
        Thread.new do
          sleep 5
          start_new_round
          broadcast_state
        end
      end
      
      {
        success: true,
        message: 'Set claimed!',
        new_state: current_state
      }
    end
  end
  
  # Get current game state
  def current_state
    {
      board: @board,
      deck_count: @deck.length,
      scores: @scores.dup,
      status: @status
    }
  end
  
  # Broadcast state to all connected clients
  def broadcast_state
    # This will be called from the channel
    current_state
  end
end

