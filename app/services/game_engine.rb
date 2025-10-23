# frozen_string_literal: true

require 'set'

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
    @last_seen = {} # player_id => Time
    @presence_timeout_seconds = 15
    @online_player_ids = Set.new
    @status = 'playing'
    @mutex = Mutex.new
    @broadcaster = nil
    @countdown = 0
    @placements = []
    # Store only player_id and cards so UI always resolves latest name
    @recent_claims = [] # { player_id:, cards: [] }
    start_new_round
    
    # Start presence sweeper thread after all initialization is complete
    @presence_sweeper_thread = Thread.new do
      loop do
        sleep 5
        @mutex.synchronize { update_online_set! }
      end
    end
  end
  
  # Start a new round: shuffle deck, deal initial board
  def start_new_round
    @mutex.synchronize do
      # Reset scores for a fresh game as requested
      @scores = {}

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
      @countdown = 0
      @placements = []
      @recent_claims = []
    end
  end
  
  # Deal cards from deck to board
  def deal_cards(count)
    count.times do
      break if @deck.empty?
      @board << @deck.shift
    end
  end
  
  # Replace given card ids at their indices with new cards from the deck.
  # If deck is exhausted, delete those positions so the board shrinks.
  def replace_cards_in_place(card_ids)
    positions = card_ids.map { |id| @board.index(id) }
    return false if positions.any?(&:nil?)
    
    missing = []
    positions.each do |pos|
      if @deck.any?
        @board[pos] = @deck.shift
      else
        missing << pos
      end
    end
    
    # Remove positions where deck was empty (delete from end to preserve indices)
    missing.sort.reverse.each { |pos| @board.delete_at(pos) }
    true
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
      
      # If we were at 15 cards, collapse back to 12 by removing the set
      # (It's okay to re-arrange the board in this case.)
      pre_length = @board.length
      if pre_length >= 15
        remove_cards_from_board(card_ids)
      else
        # Otherwise, replace cards in place (preserve positions when possible)
        replace_cards_in_place(card_ids)
      end
      
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
      
      # Add to recent claims (newest first)
      Rails.logger.info "[GameEngine] Adding recent claim: player=#{player_id}, cards=#{card_ids.inspect}"
      @recent_claims.unshift({
        player_id: player_id,
        cards: card_ids
      })
      Rails.logger.info "[GameEngine] Recent claims count: #{@recent_claims.length}"
      
      # Check if round is over (deck empty and no sets on board)
      if @deck.empty? && !Rules.set_exists?(@board)
        @status = 'round_over'
        # Compute placements (top 3 if available)
        @placements = compute_top_placements(3)
        # Begin a 10-second countdown and broadcast each second
        @countdown = 10
        @broadcaster&.call(current_state)

        Thread.new do
          loop do
            sleep 1
            should_start = false
            @mutex.synchronize do
              @countdown -= 1 if @countdown > 0
              should_start = @countdown <= 0
              @broadcaster&.call(current_state)
            end
            break if should_start
          end

          # Call start_new_round outside of a held mutex to avoid deadlock
          # since start_new_round acquires @mutex internally.
          start_new_round
          @mutex.synchronize do
            @broadcaster&.call(current_state)
          end
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
      status: @status,
      online_player_ids: @online_player_ids.to_a,
      countdown: @countdown,
      placements: @placements,
      recent_claims: @recent_claims
    }
  end
  
  # Broadcast state to all connected clients
  def broadcast_state
    # This will be called from the channel
    current_state
  end

  # Register a connection for a player
  # Increments connection count only. Does NOT mark presence or create a name.
  # Presence (and lazy name creation) are established on heartbeat from a JS client.
  def register_connection(player_id)
    @mutex.synchronize do
      @active_connections[player_id] += 1
      connection_count = @active_connections[player_id]
      
      Rails.logger.info "[GameEngine] Registered connection for player_id=#{player_id}, total connections=#{connection_count}"
      
      # Update online set and broadcast if changed
      update_online_set!
    end
  end
  
  # Unregister a connection for a player
  # Decrements connection count and removes player when last connection closes
  def unregister_connection(player_id)
    @mutex.synchronize do
      old_count = @active_connections[player_id] || 0
      @active_connections[player_id] -= 1
      new_count = @active_connections[player_id]
      
      Rails.logger.info "[GameEngine] Unregistered connection for player_id=#{player_id}, connections: #{old_count} -> #{new_count}"
      
      # Remove player from active connections when all connections are closed
      # BUT keep their score and name so they persist across reconnections
      if @active_connections[player_id] <= 0
        @active_connections.delete(player_id)
        @last_seen.delete(player_id)
        Rails.logger.info "[GameEngine] Removed player_id=#{player_id} from active connections (last connection closed)"
        # Don't delete scores and names - they should persist across reconnections
        # @scores.delete(player_id)
        # @names.delete(player_id)
      end
      
      # Update online set and broadcast if changed
      update_online_set!
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

  # Mark heartbeat and update online set
  # Creates a default name lazily on first heartbeat so non-JS clients aren't registered
  # Returns true if presence set changed
  def heartbeat(player_id)
    @mutex.synchronize do
      # Ensure default name exists only when a real client heartbeats
      old_name = @names[player_id]
      @names[player_id] ||= default_name_for(player_id)
      
      # Log name creation with alert for "Bold Raven"
      if !old_name && @names[player_id]
        Rails.logger.info "[GameEngine] Created name for player #{player_id}: #{@names[player_id]}"
        if @names[player_id].include?('Bold Raven')
          Rails.logger.warn "[GameEngine] *** PHANTOM PLAYER ALERT: Bold Raven detected! player_id=#{player_id} ***"
        end
      end
      
      @last_seen[player_id] = Time.now
      update_online_set!
    end
  end

  # Recompute online set (active connection AND recent heartbeat)
  # Returns true if changed
  def update_online_set!
    cutoff = Time.now - @presence_timeout_seconds
    next_online = @active_connections.keys.select { |pid|
      @active_connections[pid] > 0 && (@last_seen[pid] && @last_seen[pid] >= cutoff)
    }
    changed = next_online.sort != @online_player_ids.to_a.sort
    @online_player_ids = Set.new(next_online)
    @broadcaster&.call(current_state) if changed
    changed
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
    
    Rails.logger.info "[GameEngine] Generating name for player_id=#{player_id}, uuid_bytes[0]=#{uuid_bytes[0]}, uuid_bytes[1]=#{uuid_bytes[1]}, adj_index=#{adj_index}, animal_index=#{animal_index}"
    
    name = "#{adjectives[adj_index]} #{animals[animal_index]}"
    
    # Ensure uniqueness by appending short UUID if name already exists
    if @names.values.include?(name)
      short = player_id.to_s.split('-').first.to_s.upcase
      name = "#{adjectives[adj_index]} #{animals[animal_index]} #{short}"
      Rails.logger.info "[GameEngine] Name collision, appending UUID: #{name}"
    end
    
    Rails.logger.info "[GameEngine] Generated name '#{name}' for player_id=#{player_id}"
    name
  end
  
  # Remove the given card ids from the board without drawing replacements
  # Used to collapse from 15 -> 12 after a successful set claim
  def remove_cards_from_board(card_ids)
    card_ids.each do |id|
      idx = @board.index(id)
      @board.delete_at(idx) if idx
    end
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

  # Return array of up to `limit` placement hashes sorted by score desc
  # Each element: { player_id:, name:, score:, place: }
  def compute_top_placements(limit)
    # Sort by score desc, then by name for deterministic order
    sorted = @scores.to_a.sort_by { |(pid, score)| [-score, (@names[pid] || '')] }
    placements = []
    place = 1
    sorted.first(limit).each do |(pid, score)|
      placements << {
        player_id: pid,
        name: @names[pid] || pid,
        score: score,
        place: place
      }
      place += 1
    end
    placements
  end
end

