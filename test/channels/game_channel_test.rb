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

  test "two-card choice is cached on the channel until a setting changes" do
    PlayerSetting.choose_two_card!(@player, true)
    lookups = 0
    lookup = lambda do |player_id|
      lookups += 1
      assert_equal @player, player_id
      true
    end

    PlayerSetting.stub(:two_card_choice, lookup) do
      assert_equal [true], claim_choices
      assert_equal [true], claim_choices
    end
    assert_equal 1, lookups, "second claim reuses cached setting"

    PlayerSetting.choose_two_card!(@player, false)
    assert_equal [false], claim_choices, "changing a setting invalidates the channel cache"
  end

  test "claim_set is rate-limited per connection" do
    calls = 0
    claim = lambda do |_player_id, _card_ids, two_card:|
      calls += 1
      { success: false, message: "Must select exactly 3 different cards" }
    end

    GAME_ENGINE.stub(:claim_set, claim) do
      GameChannel::CLAIM_LIMIT[:to].times { perform :claim_set, card_ids: [1, 2] }
      perform :claim_set, card_ids: [1, 2]
    end

    assert_equal GameChannel::CLAIM_LIMIT[:to], calls
    assert_match(/Too many requests/, transmissions.last["error"])
  end

  test "update_name is rate-limited and skips broadcast when unchanged" do
    broadcasts = 0
    ActionCable.server.stub(:broadcast, ->(*_) { broadcasts += 1 }) do
      GAME_ENGINE.stub(:update_name, ->(*_) { { success: true, unchanged: true, message: "Name unchanged", new_state: {} } }) do
        perform :update_name, name: "Rose"
      end
      assert_equal 0, broadcasts, "no-op name update does not broadcast"

      GAME_ENGINE.stub(:update_name, ->(*_) { { success: true, message: "Name updated", new_state: {} } }) do
        (GameChannel::UPDATE_NAME_LIMIT[:to] - 1).times { perform :update_name, name: "Ada" }
        assert_equal GameChannel::UPDATE_NAME_LIMIT[:to] - 1, broadcasts

        perform :update_name, name: "Ada"
        assert_equal GameChannel::UPDATE_NAME_LIMIT[:to] - 1, broadcasts
        assert_match(/Too many name changes/, transmissions.last["error"])
      end
    end
  end

  test "cancel_reset and heartbeat are rate-limited per connection" do
    cancel_calls = 0
    GAME_ENGINE.stub(:cancel_reset, ->(_) { cancel_calls += 1; { success: false, message: "none" } }) do
      GameChannel::CANCEL_RESET_LIMIT[:to].times { perform :cancel_reset }
      perform :cancel_reset
    end
    assert_equal GameChannel::CANCEL_RESET_LIMIT[:to], cancel_calls
    assert_equal "reset", transmissions.last["action"]
    assert_match(/Too many requests/, transmissions.last["error"])

    hb_calls = 0
    GAME_ENGINE.stub(:heartbeat, ->(_) { hb_calls += 1 }) do
      (GameChannel::HEARTBEAT_LIMIT[:to] + 3).times { perform :heartbeat }
    end
    assert_equal GameChannel::HEARTBEAT_LIMIT[:to], hb_calls
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
