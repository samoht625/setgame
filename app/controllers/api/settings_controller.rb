# frozen_string_literal: true

module Api
  # The player's own settings, signed in or not.
  class SettingsController < BaseController
    def update
      enabled = params[:two_card_mode]
      return render json: { error: "invalid_setting" }, status: :unprocessable_entity unless [true, false].include?(enabled)

      PlayerSetting.choose_two_card!(current_player_id, enabled)
      render json: { two_card_mode: enabled }
    end
  end
end
