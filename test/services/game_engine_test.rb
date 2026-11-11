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
end
