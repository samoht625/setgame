# frozen_string_literal: true

module Api
  # The signed-in account's reminder email: on/off and the local time.
  class RemindersController < BaseController
    def update
      account = current_account
      return render json: { error: "not_signed_in" }, status: :unauthorized unless account

      attrs = {}
      attrs[:reminder_enabled] = ActiveModel::Type::Boolean.new.cast(params[:enabled]) unless params[:enabled].nil?
      if params.key?(:minutes)
        minutes = Reminder.valid_minutes(params[:minutes])
        return render json: { error: "invalid_time" }, status: :unprocessable_entity unless minutes

        attrs[:reminder_minutes] = minutes
      end
      zone = SignInToken.valid_time_zone(params[:time_zone])
      attrs[:time_zone] = zone if zone
      account.update!(attrs)
      render json: { enabled: account.reminder_enabled, minutes: account.reminder_minutes }
    end
  end
end
