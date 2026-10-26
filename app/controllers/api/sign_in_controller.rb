# frozen_string_literal: true

module Api
  # Optional email sign-in. The response never says whether an email already
  # has an account.
  class SignInController < BaseController
    # Emails a one-tap sign-in link.
    def create
      return render json: { error: "unavailable" }, status: :service_unavailable unless SignInMailer.enabled?

      email = Account.normalize_email(params[:email])
      return render json: { error: "invalid_email" }, status: :unprocessable_entity unless email
      return render json: { error: "rate_limited" }, status: :too_many_requests if SignInToken.rate_limited?(email: email, ip: request.remote_ip)

      _record, token = SignInToken.issue!(email: email, ip: request.remote_ip, return_to: params[:return_to].to_s, time_zone: params[:time_zone])
      sent = SignInMailer.deliver(to: email, url: sign_in_url(token: token))
      return render json: { error: "send_failed" }, status: :bad_gateway unless sent

      render json: { ok: true }
    end

    # Signs this browser out and gives it a fresh anonymous player, so the
    # next person on it doesn't play as the account.
    def destroy
      end_account_session!
      @player_id = SecureRandom.uuid
      remember_player!(@player_id)
      expose_player!(@player_id)
      render json: { ok: true, player_id: @player_id, player_key: PlayerKey.for(@player_id) }
    end

    private

    def sign_in_url(token:)
      base = Rails.env.production? ? ApplicationHelper::SITE_URL : request.base_url
      "#{base}/signin?#{{ token: token }.to_query}"
    end
  end
end
