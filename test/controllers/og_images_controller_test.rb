# frozen_string_literal: true

require "test_helper"
require "minitest/mock"
require "timeout"

class OgImagesControllerTest < ActionDispatch::IntegrationTest
  setup { FileUtils.rm_rf(OgImage::CACHE_DIR) }

  test "a shared daily result gets its own cached 1200x630 preview image" do
    token = DailyShare.token(number: 12, elapsed_ms: 161_400)

    get "/og/daily/#{token}.png"
    assert_response :success
    assert_equal "image/png", response.media_type
    assert_includes response.headers["Cache-Control"], "immutable"
    assert_equal [1200, 630], response.body.byteslice(16, 8).unpack("NN")
    assert_equal 1, Dir[OgImage::CACHE_DIR.join("daily-v#{OgImage::VERSION}-*.png")].length
  end

  test "a shared Puzzle result with rank, streak and grid gets its own preview" do
    token = DailyShare.token(kind: "puzzle", number: 1, elapsed_ms: 41_000, rank: 2, total: 9, streak: 3, marks: "hhmhhhh")
    get "/og/puzzle/#{token}.png"
    assert_response :success
    assert_equal [1200, 630], response.body.byteslice(16, 8).unpack("NN")
    get "/og/daily/#{token}.png"
    assert_response :not_found
  end

  test "an unsigned result is not rendered" do
    get "/og/daily/c-3gk0-abcdefghijkl.png"
    assert_response :not_found
  end

  test "falls back to the static image when rendering fails" do
    token = DailyShare.token(number: 12, elapsed_ms: 99_000)
    with_env("NODE_BINARY" => "/nonexistent/node") { get "/og/daily/#{token}.png" }
    assert_redirected_to "/og-image.png"
  end

  test "concurrent requests for the same uncached result render only once" do
    result = DailyShare.verify(DailyShare.token(number: 14, elapsed_ms: 88_000))
    entered = Queue.new
    release = Queue.new
    calls = 0
    fake_png = "\x89PNG\r\n\x1a\nfake".b

    fake_render = lambda do |_kind, _args|
      calls += 1
      entered << true
      release.pop
      fake_png
    end

    OgImage.stub(:render, fake_render) do
      first = Thread.new { OgImage.daily(result) }
      Timeout.timeout(2) { entered.pop }
      second = Thread.new { OgImage.daily(result) }
      sleep 0.05
      release << true

      path1 = Timeout.timeout(2) { first.value }
      path2 = Timeout.timeout(2) { second.value }
      assert_equal path1, path2
      assert path1.file?
      assert_equal 1, calls
    end
  ensure
    release << true if release
  end

  test "renders beyond max concurrency return 503 with Retry-After" do
    t1 = DailyShare.token(number: 21, elapsed_ms: 71_000)
    t2 = DailyShare.token(number: 22, elapsed_ms: 72_000)
    t3 = DailyShare.token(number: 23, elapsed_ms: 73_000)
    r1 = DailyShare.verify(t1)
    r2 = DailyShare.verify(t2)
    r3 = DailyShare.verify(t3)

    entered = Queue.new
    release = Queue.new
    fake_png = "\x89PNG\r\n\x1a\nfake".b

    fake_render = lambda do |_kind, _args|
      entered << true
      release.pop
      fake_png
    end

    threads = []
    OgImage.stub(:render, fake_render) do
      threads << Thread.new { OgImage.daily(r1) }
      threads << Thread.new { OgImage.daily(r2) }
      2.times { Timeout.timeout(2) { entered.pop } }

      assert_raises(OgImage::BusyError) { OgImage.daily(r3) }

      get "/og/daily/#{t3}.png"
      assert_response :service_unavailable
      assert_equal OgImagesController::RETRY_AFTER_SECONDS.to_s, response.headers["Retry-After"]
    end
  ensure
    2.times { release << true } if release
    threads&.each { |t| Timeout.timeout(2) { t.join } }
  end

  test "cache misses are rate-limited while cache hits still succeed" do
    cached_token = DailyShare.token(number: 30, elapsed_ms: 60_000)
    cached_result = DailyShare.verify(cached_token)
    cached_path = OgImage.path_for(cached_result)
    FileUtils.mkdir_p(OgImage::CACHE_DIR)
    File.binwrite(cached_path, "\x89PNG\r\n\x1a\ncached".b)

    OgImage.stub(:daily, nil) do
      OgImagesController::MISSES_PER_MINUTE.times do |i|
        token = DailyShare.token(number: 100 + i, elapsed_ms: 50_000 + i * 1000)
        get "/og/daily/#{token}.png"
        assert_redirected_to "/og-image.png"
      end

      overflow = DailyShare.token(number: 999, elapsed_ms: 55_000)
      get "/og/daily/#{overflow}.png"
      assert_response :too_many_requests
      assert_equal "60", response.headers["Retry-After"]
    end

    get "/og/daily/#{cached_token}.png"
    assert_response :success
    assert_equal "image/png", response.media_type
  end

  private

  def with_env(values)
    previous = values.keys.to_h { |key| [key, ENV[key]] }
    values.each { |key, value| ENV[key] = value }
    yield
  ensure
    previous.each { |key, value| ENV[key] = value }
  end
end
