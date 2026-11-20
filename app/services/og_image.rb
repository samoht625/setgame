# frozen_string_literal: true

require "open3"

# Renders per-result daily share images with script/og_image.cjs (SVG → PNG via
# resvg) and caches them on disk. Each image depends only on the deal number
# and the time, so a rendered file never goes stale; bump VERSION when the
# layout changes.
class OgImage
  class BusyError < StandardError; end

  VERSION = 7
  CACHE_DIR = Rails.root.join("tmp/cache/og")
  RENDERER = Rails.root.join("script/og_image.cjs")
  TIMEOUT_SECONDS = 10
  MAX_CONCURRENT_RENDERS = 2

  Flight = Struct.new(:cond, :done, :path, :error, keyword_init: true)
  private_constant :Flight

  @lock = Mutex.new
  @in_flight = {}
  @active_renders = 0

  class << self
    def path_for(result)
      key = Digest::SHA256.hexdigest([result.kind, result.number, result.elapsed_ms, result.rank, result.total, result.streak, result.marks].join("|"))[0, 20]
      CACHE_DIR.join("#{result.kind}-v#{VERSION}-#{key}.png")
    end

    def cached_path(result)
      path = path_for(result)
      path if path.file?
    end

    # Path to the cached PNG, or nil when rendering failed.
    # Raises BusyError when MAX_CONCURRENT_RENDERS distinct renders are already running.
    def daily(result)
      path = path_for(result)
      return path if path.file?

      key = path.basename.to_s
      flight = nil
      owner = false

      @lock.synchronize do
        return path if path.file?

        if (existing = @in_flight[key])
          flight = existing
        elsif @active_renders >= MAX_CONCURRENT_RENDERS
          raise BusyError, "OG image renderer is busy"
        else
          flight = Flight.new(cond: ConditionVariable.new, done: false)
          @in_flight[key] = flight
          @active_renders += 1
          owner = true
        end
      end

      unless owner
        @lock.synchronize do
          flight.cond.wait(@lock) until flight.done
        end
        raise flight.error if flight.error

        return flight.path
      end

      rendered_path = nil
      render_error = nil
      begin
        rendered_path = render_and_cache(result, path)
      rescue Exception => e
        render_error = e
        raise
      ensure
        @lock.synchronize do
          @in_flight.delete(key)
          @active_renders -= 1
          flight.path = rendered_path
          flight.error = render_error
          flight.done = true
          flight.cond.broadcast
        end
      end
    end

    private

    def render_and_cache(result, path)
      png = render("daily", title: result.title, time: result.time, standing: result.standing, marks: result.marks)
      return unless png

      FileUtils.mkdir_p(CACHE_DIR)
      partial = path.sub_ext(".#{SecureRandom.hex(4)}.tmp")
      File.binwrite(partial, png)
      File.rename(partial, path)
      path
    end

    def render(kind, args)
      png = nil
      Open3.popen2(node, RENDERER.to_s, kind, args.to_json, chdir: Rails.root.to_s) do |stdin, stdout, process|
        stdin.close
        stdout.binmode
        reader = Thread.new do
          stdout.read
        rescue IOError
          nil
        end
        unless process.join(TIMEOUT_SECONDS)
          begin
            Process.kill("KILL", process.pid)
          rescue Errno::ESRCH
            nil
          end
          process.join(1)
          stdout.close unless stdout.closed?
          reader.join(1)
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
