# frozen_string_literal: true

require "test_helper"

module Api
  class RequestGuardsTest < ActionDispatch::IntegrationTest
    test "writes from another origin are refused, even another host on the same site" do
      %w[https://evil.tido.site https://evil.example null].each do |origin|
        post "/api/solo/games", headers: { "X-Player-Id" => SecureRandom.uuid, "Origin" => origin }
        assert_response :forbidden, origin
      end
      delete "/api/sign_in", headers: { "Origin" => "https://evil.tido.site" }
      assert_response :forbidden
      assert_equal 0, SoloGame.count
    end

    test "the site's own pages can write" do
      post "/api/solo/games", headers: { "X-Player-Id" => SecureRandom.uuid, "Origin" => "http://www.example.com" }
      assert_response :created
    end

    test "reads don't need an origin check" do
      get "/api/daily", headers: { "Origin" => "https://evil.example" }
      assert_response :success
    end

    test "a flood of new games from one client is cut off" do
      player = { "X-Player-Id" => SecureRandom.uuid }
      BaseController::CREATES_PER_MINUTE.times do
        post "/api/solo/games", headers: player
        assert_response :created
      end
      post "/api/solo/games", headers: player
      assert_response :too_many_requests

      travel 61.seconds do
        post "/api/solo/games", headers: player
        assert_response :created
      end
    end
  end
end
