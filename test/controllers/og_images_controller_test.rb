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
    assert OgImage::CACHE_DIR.join("daily-v#{OgImage::VERSION}-12-161400.png").file?
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
