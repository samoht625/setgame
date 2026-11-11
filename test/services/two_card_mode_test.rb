# frozen_string_literal: true

require "test_helper"

class TwoCardModeTest < ActiveSupport::TestCase
  PAIR = [1, 2].freeze
  THIRD = Rules.third_card(1, 2)
  OTHERS = ((4..81).to_a - [THIRD]).first(10).freeze

  setup do
    @engine = GameEngine.new(start_presence_sweeper: false, auto_start: false, logger: Logger.new(nil))
    @player = SecureRandom.uuid
  end

  test "the allowlisted names match ignoring case and extra spaces" do
    %w[Rose rose ROSE Yaniv tido].each { |name| assert TwoCardMode.enabled_for?(name), name }
    assert TwoCardMode.enabled_for?("  Tido ")
    [nil, "", " ", "Rosemary", "Ros", "Rose Smith", "Wily Coyote"].each { |name| refute TwoCardMode.enabled_for?(name), name.inspect }
  end

  test "a flagged player's pair is completed with the third card on the board" do
    deal(board: [*PAIR, THIRD, *OTHERS.first(9)], name: "rose")

    result = @engine.claim_set(@player, PAIR)

    assert result[:success], result[:message]
    assert_equal [*PAIR, THIRD], @engine.current_state[:active_claim][:cards]
    assert_equal 1, @engine.scores[@player]
    assert_equal [*PAIR, THIRD], @engine.current_state[:recent_claims].first[:cards]
  end

  test "a flagged player's pair is a miss when its third card isn't on the board" do
    deal(board: [*PAIR, *OTHERS], name: "Yaniv")
    refute_includes @engine.board, THIRD

    result = @engine.claim_set(@player, PAIR)

    refute result[:success]
    assert_equal TwoCardMode::THIRD_CARD_MISSING, result[:message]
    assert_nil @engine.current_state[:active_claim]
    assert_nil @engine.scores[@player]
  end

  test "a pair from a player who isn't flagged is refused, even when the third card is there" do
    deal(board: [*PAIR, THIRD, *OTHERS.first(9)], name: "Wily Coyote")

    result = @engine.claim_set(@player, PAIR)

    refute result[:success]
    assert_equal "Must select exactly 3 different cards", result[:message]
    assert_nil @engine.scores[@player]
  end

  test "a flagged player can still claim all three cards, and the server still checks the pair" do
    deal(board: [*PAIR, THIRD, *OTHERS.first(9)], name: "Tido")
    off_board = (1..81).find { |id| !@engine.board.include?(id) }

    refute @engine.claim_set(@player, [PAIR.first, off_board])[:success], "a card that isn't on the board"
    refute @engine.claim_set(@player, [PAIR.first])[:success], "a single card"
    assert @engine.claim_set(@player, [*PAIR, THIRD])[:success]
  end

  private

  def deal(board:, name:)
    @engine.restore_from!("board" => board, "deck" => (1..81).to_a - board, "status" => "playing", "names" => {})
    @engine.register_connection(@player)
    assert @engine.update_name(@player, name)[:success]
  end
end
