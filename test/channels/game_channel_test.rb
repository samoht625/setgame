# frozen_string_literal: true

require "test_helper"
require "minitest/mock"

class GameChannelTest < ActionCable::Channel::TestCase
  setup do
    @player = SecureRandom.uuid
    stub_connection player_id: @player
    subscribe
  end

  test "a claim is made with the player's own two-card setting" do
    assert_equal [nil], claim_choices, "no choice yet: the engine uses the default for the player's name"

    PlayerSetting.choose_two_card!(@player, true)
    assert_equal [true], claim_choices

    PlayerSetting.choose_two_card!(@player, false)
    PlayerSetting.choose_two_card!(SecureRandom.uuid, true)
    assert_equal [false], claim_choices
  end

  private

  # The two_card: the engine was handed for one claim from this connection.
  def claim_choices
    seen = []
    claim = lambda do |player_id, card_ids, two_card:|
      assert_equal [@player, [1, 2]], [player_id, card_ids]
      seen << two_card
      { success: false, message: "Must select exactly 3 different cards" }
    end
    GAME_ENGINE.stub(:claim_set, claim) { perform :claim_set, card_ids: [1, 2] }
    assert_equal({ "error" => "Must select exactly 3 different cards" }, transmissions.last)
    seen
  end
end
