# frozen_string_literal: true

require "test_helper"

class StatsControllerTest < ActionDispatch::IntegrationTest
  test "stats page counts finished and unfinished finds" do
    Rails.cache.clear
    SoloScore.delete_all
    SoloGame.delete_all
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
    assert_equal [1, 2, 3], stats[:example_by_diff][1]
    assert_equal 2000, stats[:median_all]
    assert_equal({ cards: [1, 2, 3], n: 2, tied: 0 }, stats[:spread][:max])
    assert_equal 0, stats[:spread][:min][:n]
    assert_equal 1077, stats[:spread][:min][:tied]
    assert_equal [[0, 1078], [1, 1], [2, 1]], stats[:spread][:hist]
    assert_equal 10, stats[:spread][:least].length
    assert_equal 0, stats[:spread][:least].first[:n]

    named = SoloGame.create!(id: SecureRandom.uuid, player_id: "p3", seed: "3", started_at: 1.hour.ago, status: "completed", completed_at: Time.current, daily_on: Date.current)
    SoloScore.create!(solo_game: named, player_id: "p3", display_name: "Ada", elapsed_ms: 5000, completed_at: Time.current, daily_on: Date.current, events: [])
    games = SetStats.new.compute[:most_games]
    assert_equal [{ name: "Ada", solo: 0, daily: 1, total: 1 }], games, "only named players are listed"

    get "/stats"
    assert_response :success
    assert_includes response.body, "Set stats"
    assert_includes response.body, "Most found"
    assert_includes response.body, "Most games finished"
    assert_includes response.body, "vs all"
    assert_includes response.body, "hf-dot"
    assert_includes response.body, "Least found"
    refute_includes response.body, "possible sets found at least once"
    refute_includes response.body, "player-secret-xyz"
  end

  test "Puzzle runs never count toward stats" do
    Rails.cache.clear
    before = SetStats.new.compute.except(:generated_at)
    cards = ClassicPuzzle.generate(7)
    claims = ClassicPuzzle.sets_in(cards).each_with_index.map { |set, i| { "cards" => set, "t_ms" => (i + 1) * 1000 } }
    PuzzleRun.create!(id: SecureRandom.uuid, player_id: "puzzler", display_name: "Puzzler", puzzle_on: Date.current, cards: cards,
      claims: claims, started_at: 1.minute.ago, completed_at: Time.current, elapsed_ms: 6000)
    Rails.cache.clear
    assert_equal before, SetStats.new.compute.except(:generated_at)
  end
end
