#!/usr/bin/env ruby
# frozen_string_literal: true

require 'minitest/autorun'
require_relative '../app/services/rules'
require_relative '../app/services/game_engine'

class GameEngineTest < Minitest::Test
  def setup
    @engine = GameEngine.new(
      reveal_seconds: 0.05,
      reset_seconds: 0.05,
      start_presence_sweeper: false,
      snapshot_store: nil
    )
    @engine.instance_variable_set(:@board, (1..12).to_a)
    @engine.instance_variable_set(:@deck, (13..81).to_a)
    @engine.instance_variable_set(:@scores, {})
    @engine.instance_variable_set(:@recent_claims, [])
  end

  def test_valid_set_stays_visible_before_replacement
    original_board = @engine.board.dup
    original_deck_count = @engine.deck.length

    result = @engine.claim_set('player-one', [1, 2, 3])

    assert result[:success]
    assert_equal original_board, result[:new_state][:board]
    assert_equal original_deck_count, result[:new_state][:deck_count]
    assert_equal(
      { player_id: 'player-one', cards: [1, 2, 3] },
      result[:new_state][:active_claim]
    )
    assert_equal 1, result[:new_state][:scores]['player-one']

    blocked = @engine.claim_set('player-two', [1, 2, 3])
    refute blocked[:success]
    assert_match(/new cards are coming/, blocked[:message])

    resolved_state = wait_until { @engine.current_state if @engine.current_state[:active_claim].nil? }

    refute_nil resolved_state
    assert_empty resolved_state[:board] & [1, 2, 3]
    assert_nil resolved_state[:active_claim]
    assert_operator resolved_state[:deck_count], :<, original_deck_count
  end

  def test_round_ends_only_after_final_set_is_revealed
    @engine.instance_variable_set(:@board, [1, 2, 3])
    @engine.instance_variable_set(:@deck, [])

    result = @engine.claim_set('winner', [1, 2, 3])

    assert result[:success]
    assert_equal 'playing', result[:new_state][:status]
    assert_equal [1, 2, 3], result[:new_state][:board]
    refute_nil result[:new_state][:active_claim]

    resolved_state = wait_until do
      state = @engine.current_state
      state if state[:status] == 'round_over'
    end

    refute_nil resolved_state
    assert_empty resolved_state[:board]
    assert_nil resolved_state[:active_claim]
    assert_equal 10, resolved_state[:countdown]
    assert_equal 'winner', resolved_state[:placements].first[:player_id]
  end

  def test_any_player_can_stop_a_scheduled_reset
    original_board = @engine.board.dup
    @engine.instance_variable_set(:@scores, { 'player-one' => 3 })

    requested = @engine.request_reset('player-one')

    assert requested[:success]
    assert_equal 1, requested[:new_state][:reset_countdown]
    assert_equal 'player-one', requested[:new_state][:reset_requested_by]
    refute @engine.request_reset('player-three')[:success]

    cancelled = @engine.cancel_reset('player-two')

    assert cancelled[:success]
    assert_equal 0, cancelled[:new_state][:reset_countdown]
    assert_nil cancelled[:new_state][:reset_requested_by]

    sleep 0.08
    assert_equal original_board, @engine.current_state[:board]
    assert_equal 3, @engine.current_state[:scores]['player-one']
  end

  def test_scheduled_reset_starts_a_fresh_game
    @engine.instance_variable_set(:@scores, { 'player-one' => 3 })
    @engine.instance_variable_set(
      :@recent_claims,
      [{ player_id: 'player-one', cards: [1, 2, 3] }]
    )
    broadcasts = []
    @engine.broadcaster = ->(state) { broadcasts << state }

    requested = @engine.request_reset('player-one')
    assert requested[:success]

    reset_state = wait_until do
      state = @engine.current_state
      state if state[:reset_countdown].zero? && state[:reset_requested_by].nil?
    end

    refute_nil reset_state
    assert_empty reset_state[:scores]
    assert_empty reset_state[:recent_claims]
    assert_equal 'playing', reset_state[:status]
    assert_includes [12, 15, 18], reset_state[:board].length
    assert Rules.set_exists?(reset_state[:board])
    assert(broadcasts.any? { |state| state[:reset_countdown].zero? })
  end

  def test_outgoing_names_include_only_players_referenced_by_current_state
    historical_names = 1000.times.to_h { |index| ["historical-#{index}", "Past #{index}"] }
    referenced_names = {
      'online' => 'Online Player',
      'scorer' => 'Offline Scorer',
      'recent' => 'Recent Claimant',
      'active' => 'Active Claimant',
      'placed' => 'Placed Player',
      'reset' => 'Reset Requester'
    }
    all_names = historical_names.merge(referenced_names)
    @engine.instance_variable_set(:@names, all_names)
    @engine.instance_variable_set(:@online_player_ids, Set['online'])
    @engine.instance_variable_set(:@scores, { 'scorer' => 2 })
    @engine.instance_variable_set(:@recent_claims, [{ player_id: 'recent', cards: [4, 5, 6] }])
    @engine.instance_variable_set(:@active_claim, { player_id: 'active', cards: [1, 2, 3] })
    @engine.instance_variable_set(:@placements, [{ player_id: 'placed', name: 'Placed Player', score: 3, place: 1 }])
    @engine.instance_variable_set(:@reset_requested_by, 'reset')

    state = @engine.current_state
    assert_equal referenced_names, state.fetch(:names)
    assert_equal all_names, @engine.snapshot_payload.fetch('names')
    state.fetch(:names).delete('online')
    assert_equal 'Online Player', @engine.names.fetch('online')
  end

  def test_offline_claim_names_remain_until_a_new_round_and_reconnect_history_survives_restore
    @engine.register_connection('player-one')
    assert @engine.update_name('player-one', 'Remember Me')[:success]
    assert @engine.claim_set('player-one', [1, 2, 3])[:success]
    @engine.unregister_connection('player-one')

    state = @engine.current_state
    assert_empty state.fetch(:online_player_ids)
    assert_equal 'Remember Me', state.fetch(:names).fetch('player-one')
    assert_equal 'player-one', state.fetch(:recent_claims).first.fetch(:player_id)

    @engine.start_new_round
    assert_empty @engine.current_state.fetch(:names)
    snapshot = @engine.snapshot_payload
    assert_equal 'Remember Me', snapshot.fetch('names').fetch('player-one')

    restored = GameEngine.new(auto_start: false, start_presence_sweeper: false)
    restored.restore_from!(snapshot)
    assert_empty restored.current_state.fetch(:names)
    restored.register_connection('player-one')
    assert_equal 'Remember Me', restored.current_state.fetch(:names).fetch('player-one')
    restored.unregister_connection('player-one')
    assert_empty restored.current_state.fetch(:names)
    assert_equal 'Remember Me', restored.snapshot_payload.fetch('names').fetch('player-one')
  end

  private

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
