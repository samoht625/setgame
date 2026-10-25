# frozen_string_literal: true

require "test_helper"

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

  private

  def with_env(values)
    previous = values.keys.to_h { |key| [key, ENV[key]] }
    values.each { |key, value| ENV[key] = value }
    yield
  ensure
    previous.each { |key, value| ENV[key] = value }
  end
end
