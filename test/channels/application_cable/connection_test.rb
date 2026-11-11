# frozen_string_literal: true

require "test_helper"

module ApplicationCable
  # Player ids are broadcast to every multiplayer client, so the cable must
  # not let a stranger connect as someone by putting their id in the URL.
  class ConnectionTest < ActionCable::Connection::TestCase
    setup { @rose = SecureRandom.uuid }

    teardown { disconnect if connection }

    test "an id in the URL alone connects as a new player" do
      connect params: { player_id: @rose }
      refute_equal @rose, connection.player_id
      assert PlayerResolver.uuid?(connection.player_id)
    end

    test "the player's key proves the id" do
      connect params: { player_id: @rose, key: PlayerKey.for(@rose) }
      assert_equal @rose, connection.player_id
    end

    test "the signed cookie proves the id" do
      cookies.signed[:player_id] = @rose
      connect params: { player_id: @rose }
      assert_equal @rose, connection.player_id
    end

    test "one client can only hold so many connections open" do
      Connection::OPEN_PER_IP.times do
        connect
        @held = (@held || []) << @connection
        @connection = nil
      end
      assert_reject_connection { connect }

      @held.pop.disconnect
      connect
      assert connection.player_id
    ensure
      @held&.each(&:disconnect)
    end

    test "connecting over and over is cut off" do
      Connection::CONNECTS_PER_MINUTE.times do
        connect
        disconnect
      end
      assert_reject_connection { connect }
      travel 61.seconds do
        connect
        assert connection.player_id
      end
    end
  end
end
