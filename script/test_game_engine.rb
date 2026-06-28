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
      start_presence_sweeper: false
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
