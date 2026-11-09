# frozen_string_literal: true

require "test_helper"

module Api
  class PlayerSourceTest < ActionDispatch::IntegrationTest
    setup do
      @player_id = SecureRandom.uuid
    end

    def start(path, source: nil, landing: "/", player_id: @player_id)
      headers = { "X-Player-Id" => player_id, "X-Player-New" => "1" }
      headers["X-Player-Source"] = source if source
      headers["X-Player-Landing"] = landing if landing
      post path, headers: headers, as: :json
    end

    test "a player's first game records where they first came from, once" do
      start "/api/daily/games", source: "ref:dib2", landing: "/puzzle"
      assert_response :created
      recorded = PlayerSource.find_by!(player_id: @player_id)
      assert_equal "ref:dib2", recorded.source
      assert_equal "/puzzle", recorded.landing

      start "/api/puzzle/games", source: "reddit"
      start "/api/solo/games", source: "share"
      assert_equal ["ref:dib2"], PlayerSource.where(player_id: @player_id).pluck(:source), "the first touch is kept"
    end

    test "every game start can record it, and nothing is recorded without a source" do
      start "/api/solo/games"
      assert_response :success
      refute PlayerSource.exists?(player_id: @player_id)

      start "/api/puzzle/games", source: "Wikipedia", landing: "/daily?r=x"
      recorded = PlayerSource.find_by!(player_id: @player_id)
      assert_equal "wikipedia", recorded.source
      assert_nil recorded.landing, "only a plain path is kept"
    end

    test "a source that isn't a short tag is ignored" do
      ["<script>", "a b", "x" * 49, ""].each do |source|
        id = SecureRandom.uuid
        start "/api/solo/games", source: source, player_id: id
        refute PlayerSource.exists?(player_id: id), "#{source.inspect} should not be recorded"
      end
    end
  end
end
