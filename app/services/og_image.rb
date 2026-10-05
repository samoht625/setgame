# frozen_string_literal: true

require "open3"

# Renders per-result daily share images with script/og_image.cjs (SVG → PNG via
# resvg) and caches them on disk. Each image depends only on the time, so a
# rendered file never goes stale; bump VERSION when the layout changes.
class OgImage
  VERSION = 2
  CACHE_DIR = Rails.root.join("tmp/cache/og")
  RENDERER = Rails.root.join("script/og_image.cjs")
  TIMEOUT_SECONDS = 10

  class << self
    # Path to the cached PNG, or nil when rendering failed.
    def daily(result)
      path = CACHE_DIR.join("daily-v#{VERSION}-#{result.number}-#{result.elapsed_ms}.png")
      return path if path.file?

      png = render("daily", time: result.time)
      return unless png

      FileUtils.mkdir_p(CACHE_DIR)
      partial = path.sub_ext(".#{SecureRandom.hex(4)}.tmp")
      File.binwrite(partial, png)
      File.rename(partial, path)
      path
    end

    private

    def render(kind, args)
      png = nil
      Open3.popen2(node, RENDERER.to_s, kind, args.to_json, chdir: Rails.root.to_s) do |stdin, stdout, process|
        stdin.close
        stdout.binmode
        reader = Thread.new { stdout.read }
        unless process.join(TIMEOUT_SECONDS)
          Process.kill("KILL", process.pid)
          Rails.logger.warn("OgImage: #{kind} render timed out")
          return
        end
        png = reader.value if process.value.success?
      end
      return png if png&.start_with?("\x89PNG".b)

      Rails.logger.warn("OgImage: #{kind} render failed")
      nil
    rescue SystemCallError => error
      Rails.logger.warn("OgImage: could not run #{node}: #{error.message}")
      nil
    end

    def node
      ENV["NODE_BINARY"].presence || "node"
    end
  end
end
