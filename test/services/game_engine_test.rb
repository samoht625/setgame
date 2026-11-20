# frozen_string_literal: true

require "test_helper"
require "minitest/mock"

class GameEngineTest < ActiveSupport::TestCase
  setup do
    @engine = GameEngine.new(start_presence_sweeper: false, logger: Logger.new(nil))
  end

  test "players who leave without scoring don't leave their names behind" do
    drifters = Array.new(50) { SecureRandom.uuid }
    drifters.each do |id|
      @engine.register_connection(id)
      @engine.unregister_connection(id)
    end
    stayer = SecureRandom.uuid
    @engine.register_connection(stayer)

    assert_equal [stayer], @engine.names.keys
    assert_equal [stayer], @engine.snapshot_payload["names"].keys
  end

  test "a scorer's name stays after they leave, until the next round" do
    scorer = SecureRandom.uuid
    @engine.register_connection(scorer)
    set = @engine.board.combination(3).find { |a, b, c| Rules.is_set?(a, b, c) }
    assert @engine.claim_set(scorer, set)[:success]
    @engine.unregister_connection(scorer)
    assert @engine.names.key?(scorer)

    @engine.start_new_round
    refute @engine.names.key?(scorer)
  end

  test "a player can't keep the table in a reset countdown" do
    player = SecureRandom.uuid
    @engine.register_connection(player)
    assert @engine.request_reset(player)[:success]
    assert @engine.cancel_reset(player)[:success]
    refute @engine.request_reset(player)[:success], "asking again right away is refused"

    other = SecureRandom.uuid
    assert @engine.request_reset(other)[:success], "someone else may still ask"
    @engine.cancel_reset(other)

    now = Process.clock_gettime(Process::CLOCK_MONOTONIC)
    Process.stub(:clock_gettime, now + GameEngine::RESET_COOLDOWN_SECONDS) do
      assert @engine.request_reset(player)[:success]
    end
    @engine.cancel_reset(player)
  end

  test "update_name short-circuits when the sanitized name did not change" do
    saves = 0
    store = Object.new
    store.define_singleton_method(:save) { |_payload| saves += 1 }
    engine = GameEngine.new(auto_start: false, start_presence_sweeper: false, snapshot_store: store, logger: Logger.new(nil))
    engine.register_connection("player-one")

    first = engine.update_name("player-one", "  Rose  ")
    assert first[:success]
    refute first[:unchanged]
    engine.flush_snapshots
    assert_equal 1, saves

    repeat = engine.update_name("player-one", "Rose")
    assert repeat[:success]
    assert repeat[:unchanged]
    engine.flush_snapshots
    assert_equal 1, saves, "unchanged name does not enqueue a snapshot write"
  end

  test "valid set stays visible during reveal phase before replacement, blocking competing claims" do
    engine = build_timed_engine
    original_board = engine.board.dup
    original_deck_count = engine.deck.length

    result = engine.claim_set("player-one", [1, 2, 3])
    assert result[:success]
    assert_equal original_board, result[:new_state][:board]
    assert_equal original_deck_count, result[:new_state][:deck_count]
    assert_equal({ player_id: "player-one", cards: [1, 2, 3] }, result[:new_state][:active_claim])
    assert_equal 1, result[:new_state][:scores]["player-one"]

    blocked = engine.claim_set("player-two", [1, 2, 3])
    refute blocked[:success]
    assert_match(/new cards are coming/, blocked[:message])

    resolved_state = wait_until { engine.current_state if engine.current_state[:active_claim].nil? }
    refute_nil resolved_state
    assert_empty resolved_state[:board] & [1, 2, 3]
    assert_nil resolved_state[:active_claim]
    assert_operator resolved_state[:deck_count], :<, original_deck_count
  end

  test "round ends only after the final set is revealed" do
    engine = build_timed_engine(board: [1, 2, 3], deck: [])
    # Prevent the 10s round-over countdown thread from running in the background.
    engine.define_singleton_method(:start_round_countdown) {}

    result = engine.claim_set("winner", [1, 2, 3])
    assert result[:success]
    assert_equal "playing", result[:new_state][:status]
    assert_equal [1, 2, 3], result[:new_state][:board]
    refute_nil result[:new_state][:active_claim]

    resolved_state = wait_until do
      state = engine.current_state
      state if state[:status] == "round_over"
    end
    refute_nil resolved_state
    assert_empty resolved_state[:board]
    assert_nil resolved_state[:active_claim]
    assert_equal 10, resolved_state[:countdown]
    assert_equal "winner", resolved_state[:placements].first[:player_id]
  end

  test "any player can stop a scheduled reset" do
    engine = build_timed_engine
    original_board = engine.board.dup
    engine.instance_variable_set(:@scores, { "player-one" => 3 })

    requested = engine.request_reset("player-one")
    assert requested[:success]
    assert_equal 1, requested[:new_state][:reset_countdown]
    assert_equal "player-one", requested[:new_state][:reset_requested_by]
    refute engine.request_reset("player-three")[:success]

    cancelled = engine.cancel_reset("player-two")
    assert cancelled[:success]
    assert_equal 0, cancelled[:new_state][:reset_countdown]
    assert_nil cancelled[:new_state][:reset_requested_by]

    sleep 0.08
    assert_equal original_board, engine.current_state[:board]
    assert_equal 3, engine.current_state[:scores]["player-one"]
  end

  test "scheduled reset starts a fresh game and broadcasts completion" do
    engine = build_timed_engine
    engine.instance_variable_set(:@scores, { "player-one" => 3 })
    engine.instance_variable_set(:@recent_claims, [{ player_id: "player-one", cards: [1, 2, 3] }])
    broadcasts = []
    engine.broadcaster = ->(state) { broadcasts << state }

    assert engine.request_reset("player-one")[:success]
    reset_state = wait_until do
      state = engine.current_state
      state if state[:reset_countdown].zero? && state[:reset_requested_by].nil?
    end
    refute_nil reset_state
    assert_empty reset_state[:scores]
    assert_empty reset_state[:recent_claims]
    assert_equal "playing", reset_state[:status]
    assert_includes [12, 15, 18], reset_state[:board].length
    assert Rules.set_exists?(reset_state[:board])
    assert(broadcasts.any? { |state| state[:reset_countdown].zero? })
  end

  test "outgoing names include only players referenced by current state" do
    historical_names = 100.times.to_h { |index| ["historical-#{index}", "Past #{index}"] }
    referenced_names = {
      "online" => "Online Player",
      "scorer" => "Offline Scorer",
      "recent" => "Recent Claimant",
      "active" => "Active Claimant",
      "placed" => "Placed Player",
      "reset" => "Reset Requester"
    }
    all_names = historical_names.merge(referenced_names)
    @engine.instance_variable_set(:@names, all_names)
    @engine.instance_variable_set(:@online_player_ids, Set["online"])
    @engine.instance_variable_set(:@scores, { "scorer" => 2 })
    @engine.instance_variable_set(:@recent_claims, [{ player_id: "recent", cards: [4, 5, 6] }])
    @engine.instance_variable_set(:@active_claim, { player_id: "active", cards: [1, 2, 3] })
    @engine.instance_variable_set(:@placements, [{ player_id: "placed", name: "Placed Player", score: 3, place: 1 }])
    @engine.instance_variable_set(:@reset_requested_by, "reset")

    state = @engine.current_state
    assert_equal referenced_names, state.fetch(:names)
    assert_equal all_names, @engine.snapshot_payload.fetch("names")
    state.fetch(:names).delete("online")
    assert_equal "Online Player", @engine.names.fetch("online")
  end

  private

  def build_timed_engine(board: (1..12).to_a, deck: (13..81).to_a)
    engine = GameEngine.new(
      reveal_seconds: 0.05,
      reset_seconds: 0.05,
      start_presence_sweeper: false,
      snapshot_store: nil,
      logger: Logger.new(nil)
    )
    engine.instance_variable_set(:@board, board)
    engine.instance_variable_set(:@deck, deck)
    engine.instance_variable_set(:@scores, {})
    engine.instance_variable_set(:@recent_claims, [])
    engine
  end

  def wait_until(timeout: 1)
    deadline = Process.clock_gettime(Process::CLOCK_MONOTONIC) + timeout
    loop do
      result = yield
      return result if result
      return nil if Process.clock_gettime(Process::CLOCK_MONOTONIC) >= deadline

      sleep 0.01
    end
  end
end
