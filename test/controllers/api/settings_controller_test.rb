# frozen_string_literal: true

require "test_helper"

module Api
  class SettingsControllerTest < ActionDispatch::IntegrationTest
    setup do
      SignInMailer.deliveries.clear
      @player = SecureRandom.uuid
      @headers = { "X-Player-Id" => @player }
    end

    test "a player who hasn't chosen has no setting, so the default for their name applies" do
      get "/api/daily", headers: @headers
      assert_nil PlayerSetting.two_card_choice(@player)
      get "/"
      assert_select "meta[name='setgame-two-card']", false
    end

    test "a player's choice is kept and every game page (and /stats) carries it" do
      patch "/api/settings", params: { two_card_mode: true }, headers: @headers, as: :json
      assert_response :success
      assert_equal({ "two_card_mode" => true }, JSON.parse(response.body))
      assert_equal true, PlayerSetting.two_card_choice(@player)
      %w[/ /practice /puzzle /m /stats].each do |path|
        get path
        assert_select "meta[name='setgame-two-card'][content='on']", true, path
      end

      patch "/api/settings", params: { two_card_mode: false }, headers: @headers, as: :json
      assert_response :success
      assert_equal false, PlayerSetting.two_card_choice(@player)
      assert_equal 1, PlayerSetting.where(player_id: @player).count
      get "/m"
      assert_select "meta[name='setgame-two-card'][content='off']"
    end

    test "only on or off is accepted" do
      [nil, "yes", 1, "true"].each do |value|
        patch "/api/settings", params: { two_card_mode: value }, headers: @headers, as: :json
        assert_response :unprocessable_entity, value.inspect
      end
      assert_equal 0, PlayerSetting.count
    end

    test "a choice is the browser's own player's: another player's public id can't change it" do
      patch "/api/settings", params: { two_card_mode: false }, headers: @headers, as: :json
      reset!
      patch "/api/settings", params: { two_card_mode: true }, headers: { "X-Player-Id" => @player, "X-Player-Key" => nil }, as: :json
      assert_response :success
      refute_equal @player, response.headers["X-Player-Id"]
      assert_equal false, PlayerSetting.two_card_choice(@player)

      patch "/api/settings", params: { two_card_mode: true }, headers: @headers.merge("Origin" => "https://evil.tido.site"), as: :json
      assert_response :forbidden
      assert_equal false, PlayerSetting.two_card_choice(@player)
    end

    test "a signed-in player's choice follows them to another browser" do
      sign_in_as("rose@example.com", @player)
      patch "/api/settings", params: { two_card_mode: true }, as: :json
      assert_response :success

      # A second browser with a choice of its own: the account's wins.
      reset!
      laptop = SecureRandom.uuid
      patch "/api/settings", params: { two_card_mode: false }, headers: { "X-Player-Id" => laptop }, as: :json
      sign_in_as("rose@example.com", laptop)
      get "/"
      assert_select "meta[name='setgame-player-id'][content=?]", @player
      assert_select "meta[name='setgame-two-card'][content='on']"
      assert_nil PlayerSetting.two_card_choice(laptop)

      # Changed there, it's changed for the account.
      patch "/api/settings", params: { two_card_mode: false }, as: :json
      assert_equal false, PlayerSetting.two_card_choice(@player)
    end

    test "an account without a choice takes the one made on the browser that signs in" do
      sign_in_as("rose@example.com", @player)
      reset!
      laptop = SecureRandom.uuid
      patch "/api/settings", params: { two_card_mode: true }, headers: { "X-Player-Id" => laptop }, as: :json
      sign_in_as("rose@example.com", laptop)
      assert_equal true, PlayerSetting.two_card_choice(@player)
      assert_nil PlayerSetting.two_card_choice(laptop)
    end

    private

    def sign_in_as(email, player_id)
      headers = { "X-Player-Id" => player_id }
      get "/api/daily", headers: headers
      post "/api/sign_in", params: { email: email }, headers: headers, as: :json
      assert_response :success
      token = CGI.unescape(SignInMailer.deliveries.last[:text][/token=([\w\-%]+)/, 1])
      post "/signin", params: { token: token }
      assert_response :see_other
    end
  end
end
