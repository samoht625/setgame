# frozen_string_literal: true

require "test_helper"
require "minitest/mock"

# Optional email sign-in: request a link, open it, play as the account's
# player on every browser signed in to it.
class SignInFlowTest < ActionDispatch::IntegrationTest
  # Midday Oct 20 in Los Angeles.
  NOON = Time.utc(2026, 10, 20, 19)

  setup do
    SignInMailer.deliveries.clear
  end

  test "requesting a link emails it without saying whether the email is known" do
    phone = SecureRandom.uuid
    post "/api/sign_in", params: { email: " Rose@Example.com ", return_to: "/puzzle", time_zone: "Europe/Paris" }, headers: { "X-Player-Id" => phone }, as: :json
    assert_response :success
    assert_equal({ "ok" => true }, JSON.parse(response.body))
    Account.create!(email: "known@example.com", player_id: SecureRandom.uuid)
    post "/api/sign_in", params: { email: "known@example.com" }, headers: { "X-Player-Id" => phone }, as: :json
    assert_equal({ "ok" => true }, JSON.parse(response.body), "same answer for a known email")

    mail = SignInMailer.deliveries.first
    assert_equal ["rose@example.com"], mail[:to]
    assert_equal "Sign in to Set", mail[:subject]
    assert_match %r{/signin\?token=}, mail[:text]
    assert_match %r{/signin\?token=}, mail[:html]
    refute_match(/free/i, mail[:html])
    token = SignInToken.where(email: "rose@example.com").sole
    assert_equal ["/puzzle", "Europe/Paris"], [token.return_to, token.time_zone]
  end

  test "bad emails are refused and repeated requests are rate limited" do
    post "/api/sign_in", params: { email: "not-an-email" }, as: :json
    assert_response :unprocessable_entity

    SignInToken::PER_EMAIL_PER_HOUR.times do
      post "/api/sign_in", params: { email: "rose@example.com" }, as: :json
      assert_response :success
    end
    post "/api/sign_in", params: { email: "rose@example.com" }, as: :json
    assert_response :too_many_requests
    assert_equal SignInToken::PER_EMAIL_PER_HOUR, SignInMailer.deliveries.length
  end

  test "opening the link doesn't spend it; posting it signs in once" do
    phone = SecureRandom.uuid
    get "/api/daily", headers: { "X-Player-Id" => phone }
    token = request_link("rose@example.com", phone)

    get "/signin", params: { token: token }
    assert_response :success
    assert_select "form[action='/signin'] input[name='token'][value=?]", token
    refute SignInToken.last.used_at, "a GET (mail scanners prefetch links) leaves the token unused"

    post "/signin", params: { token: token }
    assert_redirected_to "/?signed_in=1"
    account = Account.find_by!(email: "rose@example.com")
    assert_equal phone, account.player_id, "the first sign-in keeps this browser's player"
    session_cookie = response.headers["Set-Cookie"].to_s
    assert_match(/setgame_session=/, session_cookie)
    assert_match(/httponly/i, session_cookie)
    assert_match(/samesite=lax/i, session_cookie)

    get "/"
    assert_select "meta[name='setgame-account'][content='rose@example.com']"
    assert_select "meta[name='setgame-player-id'][content=?]", phone

    reset!
    post "/signin", params: { token: token }
    assert_response :unprocessable_entity
    assert_match "expired", response.body
  end

  test "an expired link doesn't sign in" do
    token = request_link("rose@example.com")
    travel 21.minutes do
      post "/signin", params: { token: token }
      assert_response :unprocessable_entity
    end
    assert_nil Account.find_by(email: "rose@example.com")
  end

  test "a second browser's history merges into the account, one run per day" do
    phone = SecureRandom.uuid
    laptop = SecureRandom.uuid
    travel_to NOON do
      # Phone: Daily Deal on the 18th and 19th (finished at 10:00), Puzzle on the 19th.
      daily(phone, Date.new(2026, 10, 18), elapsed_ms: 90_000, completed_at: 2.days.ago)
      phone_19 = daily(phone, Date.new(2026, 10, 19), elapsed_ms: 80_000, completed_at: 1.day.ago - 2.hours)
      puzzle(phone, Date.new(2026, 10, 19), elapsed_ms: 40_000, completed_at: 1.day.ago)
      # Laptop: the 19th again (finished later and faster: a second look), today, and a practice game.
      laptop_19 = daily(laptop, Date.new(2026, 10, 19), elapsed_ms: 60_000, completed_at: 1.day.ago)
      daily(laptop, Date.new(2026, 10, 20), elapsed_ms: 70_000, completed_at: 1.hour.ago)
      laptop_puzzle = puzzle(laptop, Date.new(2026, 10, 19), elapsed_ms: 30_000, completed_at: 1.day.ago + 1.hour)
      practice = SoloGame.create!(id: SecureRandom.uuid, player_id: laptop, seed: "5", status: "completed", started_at: 3.hours.ago)
      SoloScore.create!(solo_game: practice, player_id: laptop, elapsed_ms: 200_000, completed_at: 3.hours.ago)

      sign_in_as("rose@example.com", phone)
      account = Account.find_by!(email: "rose@example.com")
      reset!
      sign_in_as("rose@example.com", laptop)

      assert_equal phone, account.reload.player_id
      assert_equal 0, SoloScore.where(player_id: laptop).count + SoloGame.where(player_id: laptop).count + PuzzleRun.where(player_id: laptop).count
      assert_equal [Date.new(2026, 10, 18), Date.new(2026, 10, 19), Date.new(2026, 10, 20)], SoloScore.where(player_id: phone).where.not(daily_on: nil).order(:daily_on).pluck(:daily_on)
      assert SoloGame.exists?(phone_19.id), "the first finished run of the day is kept"
      refute SoloGame.exists?(laptop_19.id), "the later run of the same deal is dropped"
      refute PuzzleRun.exists?(laptop_puzzle.id)
      assert_equal 1, SoloScore.where(daily_on: Date.new(2026, 10, 19)).count, "no duplicate leaderboard entry"
      assert SoloScore.exists?(player_id: phone, daily_on: nil), "practice scores move over"
      merge = PlayerMerge.sole
      assert_equal [laptop, phone], [merge.from_player_id, merge.to_player_id]
      assert_equal [laptop_19.id], merge.dropped["daily"].map { |d| d["game_id"] }

      # The laptop now plays as the account, whatever id its storage still sends.
      get "/api/daily", headers: { "X-Player-Id" => laptop }
      status = JSON.parse(response.body)
      assert_equal phone, response.headers["X-Player-Id"]
      assert_equal 3, status.dig("me", "streak"), "streak recomputed over both browsers' days"
      assert_equal 70_000, status.dig("me", "result", "elapsed_ms")
    end
  end

  test "an unfinished run gives way to a finished one on the same day" do
    phone = SecureRandom.uuid
    laptop = SecureRandom.uuid
    travel_to NOON do
      unfinished = SoloGame.create!(id: SecureRandom.uuid, player_id: phone, seed: "1", status: "open", started_at: 5.hours.ago, daily_on: Date.new(2026, 10, 20))
      finished = daily(laptop, Date.new(2026, 10, 20), elapsed_ms: 70_000, completed_at: 1.hour.ago)
      sign_in_as("rose@example.com", phone)
      reset!
      sign_in_as("rose@example.com", laptop)
      refute SoloGame.exists?(unfinished.id)
      assert_equal phone, finished.reload.player_id
    end
  end

  test "a browser signed in to one account switches without merging into another" do
    a = SecureRandom.uuid
    sign_in_as("a@example.com", a)
    token = request_link("b@example.com", a)
    post "/signin", params: { token: token }
    b = Account.find_by!(email: "b@example.com")
    refute_equal a, b.player_id
    assert_equal a, Account.find_by!(email: "a@example.com").player_id
    assert_empty PlayerMerge.all
  end

  test "signing out hands the browser a new anonymous player and the account's id stops working" do
    phone = SecureRandom.uuid
    sign_in_as("rose@example.com", phone)
    delete "/api/sign_in", headers: { "X-Player-Id" => phone }
    assert_response :success
    fresh = JSON.parse(response.body).fetch("player_id")
    refute_equal phone, fresh
    assert_equal fresh, response.headers["X-Player-Id"]

    # Even with the key, an account's player needs a session.
    get "/api/daily", headers: { "X-Player-Id" => phone }
    refute_equal phone, response.headers["X-Player-Id"]
    get "/"
    assert_select "meta[name='setgame-account']", false
  end

  test "sign-in is hidden when the site can't send email" do
    SignInMailer.stub(:enabled?, false) do
      get "/"
      assert_select "meta[name='setgame-sign-in']", false
      post "/api/sign_in", params: { email: "rose@example.com" }, as: :json
      assert_response :service_unavailable
    end
    get "/"
    assert_select "meta[name='setgame-sign-in'][content='1']"
  end

  private

  def request_link(email, player_id = SecureRandom.uuid)
    post "/api/sign_in", params: { email: email }, headers: { "X-Player-Id" => player_id }, as: :json
    assert_response :success
    SignInMailer.deliveries.last[:text][/token=([\w\-%]+)/, 1].then { |t| CGI.unescape(t) }
  end

  def sign_in_as(email, player_id)
    get "/api/daily", headers: { "X-Player-Id" => player_id }
    token = request_link(email, player_id)
    post "/signin", params: { token: token }
    assert_response :see_other
  end

  def daily(player_id, date, elapsed_ms:, completed_at:)
    game = SoloGame.create!(id: SecureRandom.uuid, player_id: player_id, seed: "1", status: "completed",
                            started_at: completed_at - (elapsed_ms / 1000.0).seconds, completed_at: completed_at, daily_on: date)
    SoloScore.create!(solo_game: game, player_id: player_id, elapsed_ms: elapsed_ms, completed_at: completed_at, daily_on: date)
    game
  end

  def puzzle(player_id, date, elapsed_ms:, completed_at:)
    PuzzleRun.create!(id: SecureRandom.uuid, player_id: player_id, puzzle_on: date, cards: ClassicPuzzle.new(date).cards,
                      started_at: completed_at - 60.seconds, completed_at: completed_at, elapsed_ms: elapsed_ms)
  end
end
