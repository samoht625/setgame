# frozen_string_literal: true

class OgImagesController < ApplicationController
  def daily
    result = DailyShare.verify(params[:token])
    return head :not_found unless result

    path = OgImage.daily(result)
    return redirect_to "/og-image.png" unless path

    expires_in 1.year, public: true, immutable: true
    send_file path, type: "image/png", disposition: "inline"
  end
end
