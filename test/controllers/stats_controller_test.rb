# frozen_string_literal: true

require "test_helper"

class StatsControllerTest < ActionDispatch::IntegrationTest
  test "stats page counts finished and unfinished finds" do
    Rails.cache.clear
    finished = SoloGame.create!(id: SecureRandom.uuid, player_id: "player-secret-xyz", seed: "1", started_at: 1.hour.ago, status: "completed", completed_at: Time.current)
    SoloScore.create!(solo_game: finished, player_id: "player-secret-xyz", elapsed_ms: 9000, completed_at: Time.current,
      events: [{ "type" => "claim", "cards" => [1, 2, 3], "t_ms" => 2000 }, { "type" => "claim", "cards" => [4, 5, 6], "t_ms" => 9000 }])
    SoloGame.create!(id: SecureRandom.uuid, player_id: "p2", seed: "2", started_at: 1.hour.ago, sets_found: 1,
      events: [{ "type" => "claim", "cards" => [1, 2, 3], "t_ms" => 1500 }])

    stats = SetStats.new.compute
    assert_equal 3, stats[:total_finds]
    assert_equal 1500, stats[:fastest_find][:ms]
    assert_equal({ cards: [1, 2, 3], n: 2 }, stats[:most_found].first)
    assert_equal 3, stats[:type_counts][1]

    get "/stats"
    assert_response :success
    assert_includes response.body, "Set stats"
    assert_includes response.body, "Most found"
    refute_includes response.body, "player-secret-xyz"
  end
end
