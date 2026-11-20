# frozen_string_literal: true

class OgImagesController < ApplicationController
  MISSES_PER_MINUTE = 30
  RETRY_AFTER_SECONDS = 5

  def daily
    serve(DailyShare.verify(params[:token]))
  end

  def puzzle
    serve(DailyShare.verify(params[:token], kind: "puzzle"))
  end

  private

  def serve(result)
    return head :not_found unless result

    path = OgImage.cached_path(result)
    unless path
      if RateLimit.exceeded?("og-image-misses", request.remote_ip, to: MISSES_PER_MINUTE, within: 1.minute)
        response.set_header("Retry-After", "60")
        return head :too_many_requests
      end
      path = OgImage.daily(result)
    end
    return redirect_to "/og-image.png" unless path

    expires_in 1.year, public: true, immutable: true
    send_file path, type: "image/png", disposition: "inline"
  rescue OgImage::BusyError
    response.set_header("Retry-After", RETRY_AFTER_SECONDS.to_s)
    head :service_unavailable
  end
end
