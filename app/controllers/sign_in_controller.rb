# frozen_string_literal: true

# Where the emailed link lands. Opening it (GET) doesn't use the link up, so
# mail scanners that prefetch links can't spend it; the page posts the token
# straight back, which signs this browser in.
class SignInController < ApplicationController
  include CurrentAccount

  layout "sign_in"

  def show
    @token = params[:token].to_s
  end

  def create
    record = SignInToken.consume(params[:token].to_s)
    return render :expired, status: :unprocessable_entity unless record

    cookie_player = cookies.signed[:player_id].to_s
    account = AccountSignIn.call(
      email: record.email,
      browser_player_id: PlayerResolver.uuid?(cookie_player) ? cookie_player : nil,
      signed_in_account: current_account,
      time_zone: record.time_zone
    )
    end_account_session! if current_account_session
    start_account_session!(account)
    redirect_to record.return_to.presence || "/", status: :see_other
  end
end
