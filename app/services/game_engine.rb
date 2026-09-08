# frozen_string_literal: true

require 'logger'
require 'securerandom'
require 'set'

# Game engine manages the state of the Set game
class GameEngine
  attr_reader :board, :deck, :scores, :status, :names
  attr_writer :broadcaster

  RECENT_CLAIMS_LIMIT = 10
  SET_REVEAL_SECONDS = 2
  RESET_SECONDS = 5

  def initialize(
    reveal_seconds: SET_REVEAL_SECONDS,
    reset_seconds: RESET_SECONDS,
    start_presence_sweeper: true,
    auto_start: true,
    snapshot_store: nil,
    logger: Logger.new($stderr)
  )
    @board = []
    @deck = []
    @scores = {} # player_id => score
    @names = {}  # player_id => display name
    @active_connections = Hash.new(0) # player_id => connection count
    @last_seen = {} # player_id => Time
    @presence_timeout_seconds = 15
    @idle_timeout_seconds = 60
    @online_player_ids = Set.new
    @idle_player_ids = Set.new
    @status = 'playing'
    @mutex = Mutex.new
    @snapshot_store = snapshot_store
    @logger = logger
    @snapshot_mutex = Mutex.new
    @pending_snapshot = nil
    @snapshot_writer = nil
    @snapshot_write_error = nil
    @broadcaster = nil
    @countdown = 0
    @placements = []
    # Store only player_id and cards so UI always resolves latest name
    @recent_claims = [] # { player_id:, cards: [] }
    @active_claim = nil
    @active_claim_token = nil
    @claim_sequence = 0
    @reveal_seconds = reveal_seconds
    @reset_countdown = 0
    @reset_requested_by = nil
    @reset_request_token = nil
    @reset_request_sequence = 0
    @reset_deadline = nil
    @reset_seconds = reset_seconds.to_f
    raise ArgumentError, 'reset_seconds must be positive' unless @reset_seconds.positive?

    start_new_round if auto_start

    # Start presence sweeper thread after all initialization is complete
    if start_presence_sweeper
      @presence_sweeper_thread = Thread.new do
        loop do
          sleep 5
          @mutex.synchronize { update_online_set! }
        end
      end
    end
  end

  # Start a new round: shuffle deck, deal initial board
  def start_new_round
    @mutex.synchronize { start_new_round_locked! }
  end

  # Deal cards from deck to board
  def deal_cards(count)
    count.times do
      break if @deck.empty?
      @board << @deck.shift
    end
  end

  # Replace given card ids at their indices with new cards from the deck.
  # If the deck runs out, the remaining gaps are filled with cards taken from
  # the end of the board (so other cards keep their positions and the board
  # shrinks from the end).
  def replace_cards_in_place(card_ids)
    leftover = []
    card_ids.each do |id|
      pos = @board.index(id)
      next if pos.nil?

      if @deck.any?
        @board[pos] = @deck.shift
      else
        leftover << id
      end
    end

    remove_cards_from_board(leftover) if leftover.any?
    true
  end

  # Player claims a set of three cards
  # Returns: { success: bool, message: string, new_state: hash }
  def claim_set(player_id, card_ids)
    @mutex.synchronize do
      @last_seen[player_id] = Time.now

      # Normalize input: ints, no nils, no duplicates
      card_ids = Array(card_ids).map { |id| Integer(id, exception: false) }.compact.uniq

      if card_ids.length != 3
        return { success: false, message: 'Must select exactly 3 different cards' }
      end

      unless @status == 'playing'
        return { success: false, message: 'Round is over - waiting for the next round' }
      end

      if @active_claim
        return { success: false, message: 'A set was just found - new cards are coming' }
      end

      # Check if cards are still on board
      unless card_ids.all? { |id| @board.include?(id) }
        return { success: false, message: 'One or more cards are no longer on the board' }
      end

      # Check if it's a valid set
      unless Rules.is_set?(card_ids[0], card_ids[1], card_ids[2])
        return { success: false, message: 'Not a valid set' }
      end

      # Award point
      @scores[player_id] ||= 0
      @scores[player_id] += 1

      # Add to recent claims (newest first, capped)
      @recent_claims.unshift({ player_id: player_id, cards: card_ids })
      @recent_claims = @recent_claims.first(RECENT_CLAIMS_LIMIT)

      # Keep the claimed cards on the board briefly so every client can see
      # the set before replacements are dealt. The active claim also locks out
      # competing claims during this short reveal phase.
      @claim_sequence += 1
      @active_claim_token = @claim_sequence
      @active_claim = { player_id: player_id, cards: card_ids.dup }
      enqueue_snapshot_locked!
      schedule_claim_resolution(@active_claim_token)

      {
        success: true,
        message: 'Set claimed!',
        new_state: current_state
      }
    end
  end

  # Schedule a new round. Any connected player may request or cancel a reset.
  def request_reset(player_id)
    @mutex.synchronize do
      @last_seen[player_id] = Time.now

      if @reset_request_token
        return { success: false, message: 'A game reset is already scheduled' }
      end

      @reset_request_sequence += 1
      @reset_request_token = @reset_request_sequence
      @reset_requested_by = player_id
      @reset_deadline = monotonic_time + @reset_seconds
      @reset_countdown = @reset_seconds.ceil
      schedule_reset(@reset_request_token)

      {
        success: true,
        message: 'Game reset scheduled',
        new_state: current_state
      }
    end
  end

  def cancel_reset(player_id)
    @mutex.synchronize do
      @last_seen[player_id] = Time.now

      unless @reset_request_token
        return { success: false, message: 'There is no game reset to stop' }
      end

      clear_reset_request!

      {
        success: true,
        message: 'Game reset stopped',
        new_state: current_state
      }
    end
  end

  # Get current game state
  def current_state
    return build_current_state if @mutex.owned?

    @mutex.synchronize { build_current_state }
  end

  # Thread-safe snapshot of the player ids currently connected to multiplayer.
  # Used by the /presence endpoint and the initial page render to power the
  # "people are playing" jewel without joining the game.
  def online_player_ids_snapshot
    @mutex.synchronize { @online_player_ids.to_a }
  end

  # Register a connection for a player
  # Increments connection count and establishes presence based on open connections.
  # Also ensures a default name exists on first connection.
  def register_connection(player_id)
    @mutex.synchronize do
      @active_connections[player_id] += 1

      # Ensure default name exists on first connection
      @names[player_id] ||= default_name_for(player_id)

      @last_seen[player_id] = Time.now
      @logger.info "[GameEngine] Registered connection for player_id=#{player_id} (#{@active_connections[player_id]} open)"

      # Update online set and broadcast if changed
      update_online_set!
    end
  end

  # Unregister a connection for a player
  # Decrements connection count and removes player when last connection closes
  def unregister_connection(player_id)
    @mutex.synchronize do
      if @active_connections.key?(player_id)
        @active_connections[player_id] -= 1
      end

      # Remove player from active connections when all connections are closed,
      # but keep their score and name so they persist across reconnections.
      if @active_connections[player_id] <= 0
        @active_connections.delete(player_id)
        @last_seen.delete(player_id)
      end

      @logger.info "[GameEngine] Unregistered connection for player_id=#{player_id}"

      # Update online set and broadcast if changed
      update_online_set!
    end
  end

  # Update a player's display name
  # Returns: { success: bool, message: string, new_state: hash }
  def update_name(player_id, new_name)
    @mutex.synchronize do
      @last_seen[player_id] = Time.now
      name = new_name.to_s.strip
      if name.length < 1 || name.length > 20
        return { success: false, message: 'Name must be between 1 and 20 characters' }
      end

      # Allow letters, numbers, spaces, underscore and hyphen
      unless name.match?(/\A[\p{L}\p{Nd} _\-]+\z/u)
        return { success: false, message: 'Name contains invalid characters' }
      end

      @names[player_id] = name
      enqueue_snapshot_locked!
      { success: true, message: 'Name updated', new_state: current_state }
    end
  end

  # Mark heartbeat and update online set
  # Heartbeats are optional; presence is determined by open connections.
  def heartbeat(player_id)
    @mutex.synchronize do
      @last_seen[player_id] = Time.now
      update_online_set!
    end
  end

  # Recompute online set (based solely on active connections)
  # Returns true if changed
  def update_online_set!
    next_online = @active_connections.keys.select { |pid| @active_connections[pid] > 0 }
    changed_online = next_online.sort != @online_player_ids.to_a.sort
    @online_player_ids = Set.new(next_online)

    idle_cutoff = Time.now - @idle_timeout_seconds
    next_idle = next_online.select { |pid|
      last = @last_seen[pid]
      last.nil? || last < idle_cutoff
    }
    changed_idle = next_idle.sort != @idle_player_ids.to_a.sort
    @idle_player_ids = Set.new(next_idle)

    changed = changed_online || changed_idle
    @broadcaster&.call(current_state) if changed
    changed
  end

  # Snapshot of durable multiplayer state (presence and reset requests are not included)
  def snapshot_payload
    @mutex.synchronize { snapshot_payload_unlocked }
  end

  def restore_from!(payload)
    @mutex.synchronize do
      @board = Array(payload["board"] || payload[:board]).map(&:to_i)
      @deck = Array(payload["deck"] || payload[:deck]).map(&:to_i)
      @scores = normalize_scores(payload["scores"] || payload[:scores] || {})
      @names = normalize_names(payload["names"] || payload[:names] || {})
      @status = (payload["status"] || payload[:status] || "playing").to_s
      @countdown = 0
      @placements = []
      @recent_claims = normalize_claims(payload["recent_claims"] || payload[:recent_claims])
      @active_claim = normalize_claims([payload["active_claim"] || payload[:active_claim]]).first
      @active_claim_token = nil
      clear_reset_request!

      if @active_claim
        cards = @active_claim[:cards]
        unless @status == 'playing' && cards.uniq.length == 3 && cards.length == 3 &&
            cards.all? { |id| @board.include?(id) } && Rules.is_set?(*cards)
          raise ArgumentError, 'Invalid pending claim in snapshot'
        end

        # The score and recent claim were committed before the reveal began.
        finish_active_claim_locked!
        enqueue_snapshot_locked!
      end

      if @status == 'round_over'
        @placements = compute_top_placements(3)
        @countdown = 10
        start_round_countdown
      end
    end
  end

  # Wait for queued writes, without holding the game mutex.
  def flush_snapshots
    loop do
      writer, error = @snapshot_mutex.synchronize { [@snapshot_writer, @snapshot_write_error] }
      unless writer
        raise error if error
        return
      end

      writer.join
    end
  end

  private

  def snapshot_payload_unlocked
    {
      "board" => @board.dup,
      "deck" => @deck.dup,
      "scores" => @scores.dup,
      "names" => @names.dup,
      "status" => @status,
      "active_claim" => @active_claim && {
        "player_id" => @active_claim[:player_id],
        "cards" => @active_claim[:cards].dup
      },
      "recent_claims" => @recent_claims.map { |c|
        {
          "player_id" => c[:player_id],
          "cards" => Array(c[:cards]).map(&:to_i)
        }
      }
    }
  end

  def enqueue_snapshot_locked!
    return unless @snapshot_store

    payload = snapshot_payload_unlocked
    @snapshot_mutex.synchronize do
      # Keep only the newest waiting snapshot; an in-flight write always finishes first.
      @pending_snapshot = payload
      @snapshot_writer ||= Thread.new { write_snapshots }
    end
  end

  def write_snapshots
    loop do
      payload = @snapshot_mutex.synchronize do
        unless @pending_snapshot
          @snapshot_writer = nil
          return
        end

        snapshot = @pending_snapshot
        @pending_snapshot = nil
        snapshot
      end

      begin
        @snapshot_store.save(payload)
        @snapshot_mutex.synchronize { @snapshot_write_error = nil }
      rescue StandardError => e
        @snapshot_mutex.synchronize { @snapshot_write_error = e }
        @logger.warn("[GameEngine] persist failed: #{e.class}: #{e.message}")
      end
    end
  end

  def normalize_scores(hash)
    return {} unless hash.is_a?(Hash)

    hash.each_with_object({}) { |(k, v), acc| acc[k.to_s] = v.to_i }
  end

  def normalize_names(hash)
    return {} unless hash.is_a?(Hash)

    hash.each_with_object({}) { |(k, v), acc| acc[k.to_s] = v.to_s }
  end

  def normalize_claims(list)
    Array(list).filter_map do |c|
      next unless c.is_a?(Hash)

      {
        player_id: (c["player_id"] || c[:player_id]).to_s,
        cards: Array(c["cards"] || c[:cards]).map(&:to_i)
      }
    end
  end

  def start_new_round_locked!
    # Reset scores for a fresh game as requested
    @scores = {}

    @deck = (1..81).to_a.shuffle(random: SecureRandom)
    @board = []
    deal_cards(12)

    # If no set exists, add 3 more cards (up to 15, then 18)
    while @board.length < 18 && !Rules.set_exists?(@board)
      deal_cards(3)
    end

    # If still no sets at 18 cards, reshuffle and redeal
    reshuffle_and_redeal_12! if @board.length >= 18 && !Rules.set_exists?(@board)

    @status = 'playing'
    @countdown = 0
    @placements = []
    @recent_claims = []
    @active_claim = nil
    @active_claim_token = nil
    clear_reset_request!
    enqueue_snapshot_locked!
  end

  def build_current_state
    {
      board: @board.dup,
      deck_count: @deck.length,
      scores: @scores.dup,
      names: @names.dup,
      status: @status,
      online_player_ids: @online_player_ids.to_a,
      idle_player_ids: @idle_player_ids.to_a,
      countdown: @countdown,
      placements: @placements.map(&:dup),
      recent_claims: @recent_claims.map { |claim| { player_id: claim[:player_id], cards: claim[:cards].dup } },
      active_claim: @active_claim && {
        player_id: @active_claim[:player_id],
        cards: @active_claim[:cards].dup
      },
      reset_countdown: @reset_countdown,
      reset_requested_by: @reset_requested_by
    }
  end

  def schedule_reset(reset_token)
    Thread.new do
      loop do
        sleep [1.0, @reset_seconds].min

        state = nil
        request_active = false
        reset_complete = false

        @mutex.synchronize do
          if @reset_request_token == reset_token
            request_active = true
            reset_complete = advance_reset_locked!
            state = current_state
          end
        end

        break unless request_active

        @broadcaster&.call(state)
        break if reset_complete
      end
    end
  end

  def advance_reset_locked!
    remaining = (@reset_deadline - monotonic_time).ceil
    if remaining <= 0
      start_new_round_locked!
      true
    else
      @reset_countdown = remaining
      false
    end
  end

  def clear_reset_request!
    @reset_countdown = 0
    @reset_requested_by = nil
    @reset_request_token = nil
    @reset_deadline = nil
  end

  def monotonic_time
    Process.clock_gettime(Process::CLOCK_MONOTONIC)
  end

  def schedule_claim_resolution(claim_token)
    Thread.new do
      sleep @reveal_seconds
      resolve_pending_claim(claim_token)
    end
  end

  def resolve_pending_claim(claim_token)
    state = @mutex.synchronize do
      next unless @active_claim && @active_claim_token == claim_token

      finish_active_claim_locked!
      enqueue_snapshot_locked!
      start_round_countdown if @status == 'round_over'
      current_state
    end

    @broadcaster&.call(state) if state
  end

  def finish_active_claim_locked!
    resolve_claimed_cards!(@active_claim[:cards])
    @active_claim = nil
    @active_claim_token = nil

    if @deck.empty? && !Rules.set_exists?(@board)
      @status = 'round_over'
      @placements = compute_top_placements(3)
      @countdown = 10
    end
  end

  def resolve_claimed_cards!(card_ids)
    # Extra rows collapse after a set; the normal 12-card board gets in-place
    # replacements so unrelated cards stay put.
    if @board.length >= 15
      remove_cards_from_board(card_ids)
    else
      replace_cards_in_place(card_ids)
    end

    while @board.length < 18 && !Rules.set_exists?(@board) && !@deck.empty?
      deal_cards(3)
    end

    reshuffle_and_redeal_12! if @board.length >= 18 && !Rules.set_exists?(@board)
  end

  def start_round_countdown
    Thread.new do
      restart_round = false

      loop do
        sleep 1
        state = nil
        should_start = false

        @mutex.synchronize do
          next unless @status == 'round_over'

          @countdown -= 1 if @countdown > 0
          should_start = @countdown <= 0
          state = current_state
        end

        unless state
          restart_round = false
          break
        end

        @broadcaster&.call(state)
        restart_round = should_start
        break if should_start
      end

      next unless restart_round

      # start_new_round acquires the mutex itself.
      start_new_round
      state = @mutex.synchronize { current_state }
      @broadcaster&.call(state)
    end
  end

  ADJECTIVES = %w[
    Wily Clever Swift Bold Bright Quick Silent Brave Noble Wise
    Fierce Gentle Mighty Agile Sharp Keen Lucky Calm Daring Sly
  ].freeze

  ANIMALS = %w[
    Coyote Cheetah Wolf Eagle Falcon Hawk Panther Tiger Lion Bear
    Fox Deer Elk Moose Raven Owl Otter Lynx Badger Heron
  ].freeze

  def default_name_for(player_id)
    # Use UUID bytes to deterministically select adjective and animal
    uuid_bytes = player_id.to_s.gsub('-', '').scan(/../).map { |hex| hex.to_i(16) }
    adj_index = (uuid_bytes[0] || 0) % ADJECTIVES.length
    animal_index = (uuid_bytes[1] || 0) % ANIMALS.length

    name = "#{ADJECTIVES[adj_index]} #{ANIMALS[animal_index]}"

    # Ensure uniqueness by appending short UUID if name already exists
    if @names.values.include?(name)
      short = player_id.to_s.split('-').first.to_s.upcase
      name = "#{name} #{short}"
    end

    name
  end

  # Remove the given card ids from the board without drawing replacements.
  # Gaps left in the middle of the board are filled with cards taken from the
  # end, so the rest of the board keeps its positions and only the tail
  # disappears (mirrors how extra rows are collapsed in the physical game).
  def remove_cards_from_board(card_ids)
    removing = card_ids.to_set
    final_length = @board.length - @board.count { |id| removing.include?(id) }

    # Cards beyond the new length that aren't being removed fill the gaps
    fillers = (@board[final_length..] || []).reject { |id| removing.include?(id) }

    @board = @board.first(final_length).map do |id|
      removing.include?(id) ? fillers.shift : id
    end.compact
  end

  # Reshuffle board + deck and redeal 12 cards
  # Used when board reaches 18 cards with no sets
  def reshuffle_and_redeal_12!
    # Combine board and deck, shuffle
    pool = (@board + @deck).shuffle(random: SecureRandom)
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
