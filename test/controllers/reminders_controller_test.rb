# frozen_string_literal: true

require "test_helper"

class RemindersControllerTest < ActionDispatch::IntegrationTest
  setup do
    ResendMail.deliveries.clear
    @account = Account.create!(email: "rose@example.com", player_id: SecureRandom.uuid, reminder_enabled: true, reminder_minutes: 480)
  end

  test "the unsubscribe link asks nothing of a scanner and one POST turns the reminder off" do
    token = Reminder.unsubscribe_token(@account)
    get "/reminders/unsubscribe", params: { t: token }
    assert_response :success
    assert_select "form[action='/reminders/unsubscribe'] input[name='t'][value=?]", token
    assert @account.reload.reminder_enabled, "opening the page alone changes nothing"

    # What Gmail and others send for List-Unsubscribe-Post (no form token).
    post "/reminders/unsubscribe?#{{ t: token }.to_query}", params: { "List-Unsubscribe" => "One-Click" }
    assert_response :success
    refute @account.reload.reminder_enabled
  end

  test "the off page has a one-tap Turn back on, which doesn't send a catch-up email" do
    token = Reminder.unsubscribe_token(@account)
    post "/reminders/unsubscribe", params: { t: token }
    assert_select "h1", "Daily emails are off"
    assert_select "form[action='/reminders/resubscribe'] input[name='t'][value=?]", token
    assert_select "form[action='/reminders/resubscribe'] button", "Turn back on"

    post "/reminders/resubscribe", params: { t: token }
    assert_response :success
    assert_select "h1", "Daily emails are on"
    assert @account.reload.reminder_enabled
    assert_nil Reminder.due(@account, now: Time.current + 1.minute) unless Reminder.next_at(@account) <= Time.current + 1.minute

    post "/reminders/resubscribe", params: { t: "nope" }
    assert_response :not_found
  end

  test "a bad unsubscribe token does nothing" do
    post "/reminders/unsubscribe", params: { t: "nope" }
    assert_response :not_found
    get "/reminders/unsubscribe", params: { t: "nope" }
    assert_response :not_found
    assert @account.reload.reminder_enabled
  end

  test "Play signs this browser in and opens the game left to play" do
    get "/play", params: { t: Reminder.play_token(@account, Date.current), to: "/puzzle" }
    assert_redirected_to "/puzzle"
    get "/"
    assert_select "meta[name='setgame-account'][content='rose@example.com']"
    assert_select "meta[name='setgame-player-id'][content=?]", @account.player_id
    assert_select "meta[name='setgame-reminder'][content='480']"
  end

  test "an expired or forged Play link just opens the game, signed out" do
    token = Reminder.play_token(@account, Date.current)
    travel 3.days do
      get "/play", params: { t: token, to: "https://evil.example/" }
      assert_redirected_to "/"
    end
    get "/"
    assert_select "meta[name='setgame-account']", false
  end

  test "a sign-in link asked for from a result card turns the reminder on once opened" do
    phone = SecureRandom.uuid
    get "/api/daily", headers: { "X-Player-Id" => phone }
    post "/api/sign_in", params: { email: "new@example.com", reminder_minutes: 450, time_zone: "Europe/Paris" }, headers: { "X-Player-Id" => phone }, as: :json
    assert_response :success
    mail = ResendMail.deliveries.last
    assert_match "reminder at 7:30 AM", mail[:text]
    assert_nil Account.find_by(email: "new@example.com"), "nothing is sent to an unproven address"

    token = mail[:text][/token=([\w\-%]+)/, 1]
    post "/signin", params: { token: CGI.unescape(token) }
    account = Account.find_by!(email: "new@example.com")
    assert_equal [true, 450, "Europe/Paris"], [account.reminder_enabled, account.reminder_minutes, account.time_zone]
  end

  test "reminder settings need a signed-in browser" do
    patch "/api/reminder", params: { enabled: true, minutes: 480 }, as: :json
    assert_response :unauthorized

    get "/play", params: { t: Reminder.play_token(@account, Date.current) }
    patch "/api/reminder", params: { enabled: false, minutes: 1290, time_zone: "Asia/Tokyo" }, as: :json
    assert_response :success
    assert_equal({ "enabled" => false, "minutes" => 1290 }, JSON.parse(response.body))
    assert_equal [false, 1290, "Asia/Tokyo"], @account.reload.slice(:reminder_enabled, :reminder_minutes, :time_zone).values
    get "/"
    assert_select "meta[name='setgame-reminder'][content='off:1290']"

    patch "/api/reminder", params: { minutes: 7 }, as: :json
    assert_response :unprocessable_entity
  end
end
