# frozen_string_literal: true

# Game engine manages the state of the Set game
class GameEngine
  include Rules
  
  attr_reader :board, :deck, :scores, :status, :names
  attr_writer :broadcaster
  
  def initialize
    @board = []
    @deck = []
    @scores = {} # player_id => score
    @names = {}  # player_id => display name
    @active_connections = Hash.new(0) # player_id => connection count
    @status = 'playing'
    @mutex = Mutex.new
    @broadcaster = nil
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
      
      # If still no sets at 18 cards, reshuffle and redeal
      if @board.length >= 18 && !Rules.set_exists?(@board)
        reshuffle_and_redeal_12!
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
      
      # If still no sets at 18 cards, reshuffle and redeal
      if @board.length >= 18 && !Rules.set_exists?(@board)
        reshuffle_and_redeal_12!
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
          @broadcaster&.call(current_state)
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
      names: @names.dup,
      status: @status
    }
  end
  
  # Broadcast state to all connected clients
  def broadcast_state
    # This will be called from the channel
    current_state
  end

  # Register a connection for a player
  # Increments connection count and ensures default name exists
  def register_connection(player_id)
    @mutex.synchronize do
      @active_connections[player_id] += 1
      
      # Ensure default name exists if this is the first connection
      if @active_connections[player_id] == 1 && !@names[player_id]
        @names[player_id] = default_name_for(player_id)
      end
      
      # Broadcast updated state to all clients
      @broadcaster&.call(current_state)
    end
  end
  
  # Unregister a connection for a player
  # Decrements connection count and removes player when last connection closes
  def unregister_connection(player_id)
    @mutex.synchronize do
      @active_connections[player_id] -= 1
      
      # Remove player from active connections when all connections are closed
      # BUT keep their score and name so they persist across reconnections
      if @active_connections[player_id] <= 0
        @active_connections.delete(player_id)
        # Don't delete scores and names - they should persist across reconnections
        # @scores.delete(player_id)
        # @names.delete(player_id)
      end
      
      # Broadcast updated state to all clients
      @broadcaster&.call(current_state)
    end
  end

  # Update a player's display name
  # Returns: { success: bool, message: string, new_state: hash }
  def update_name(player_id, new_name)
    @mutex.synchronize do
      name = new_name.to_s.strip
      if name.length < 1 || name.length > 20
        return { success: false, message: 'Name must be between 1 and 20 characters' }
      end

      # Allow letters, numbers, spaces, underscore and hyphen
      unless name.match?(/\A[\p{L}\p{Nd} _\-]+\z/u)
        return { success: false, message: 'Name contains invalid characters' }
      end

      @names[player_id] = name
      { success: true, message: 'Name updated', new_state: current_state }
    end
  end

  private

  def default_name_for(player_id)
    # Generate adjective-animal name based on UUID
    adjectives = %w[Wily Clever Swift Bold Bright Quick Silent Brave Noble Wise Fierce Gentle Mighty Agile Sharp Keen Bold Quick Silent Brave Noble Wise Fierce Gentle Mighty Agile Sharp Keen]
    animals = %w[Coyote Cheetah Wolf Eagle Falcon Hawk Panther Tiger Lion Bear Fox Deer Elk Moose Raven Owl Hawk Panther Tiger Lion Bear Fox Deer Elk Moose Raven Owl]
    
    # Use UUID to deterministically select adjective and animal
    uuid_bytes = player_id.to_s.gsub('-', '').scan(/../).map { |hex| hex.to_i(16) }
    adj_index = uuid_bytes[0] % adjectives.length
    animal_index = uuid_bytes[1] % animals.length
    
    name = "#{adjectives[adj_index]} #{animals[animal_index]}"
    
    # Ensure uniqueness by appending short UUID if name already exists
    if @names.values.include?(name)
      short = player_id.to_s.split('-').first.to_s.upcase
      name = "#{adjectives[adj_index]} #{animals[animal_index]} #{short}"
    end
    
    name
  end
  
  # Reshuffle board + deck and redeal 12 cards
  # Used when board reaches 18 cards with no sets
  def reshuffle_and_redeal_12!
    # Combine board and deck, shuffle
    pool = (@board + @deck).shuffle
    @deck = pool
    @board = []
    
    # Deal 12 cards
    deal_cards(12)
    
    # If still no sets, add more cards up to 18
    while @board.length < 18 && !Rules.set_exists?(@board) && !@deck.empty?
      deal_cards(3)
    end
  end
end

