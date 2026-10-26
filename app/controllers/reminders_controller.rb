# frozen_string_literal: true

# Links in the reminder email: Play (signs this browser in, then opens the
# game) and Unsubscribe (also the List-Unsubscribe one-click POST target).
class RemindersController < ApplicationController
  include CurrentAccount

  layout "sign_in"
  # Mail providers POST List-Unsubscribe=One-Click without a form token; the
  # signed token in the URL is the authorization.
  skip_forgery_protection only: :unsubscribe

  PLAY_PATHS = %w[/ /puzzle].freeze

  def play
    path = PLAY_PATHS.include?(params[:to]) ? params[:to] : "/"
    account = Reminder.account_for(:play, params[:t])
    if account && current_account != account
      cookie_player = cookies.signed[:player_id].to_s
      AccountSignIn.call(email: account.email, browser_player_id: PlayerResolver.uuid?(cookie_player) ? cookie_player : nil, signed_in_account: current_account)
      end_account_session! if current_account_session
      start_account_session!(account)
    end
    redirect_to path, status: :see_other
  end

  def confirm_unsubscribe
    @token = params[:t].to_s
    @account = Reminder.account_for(:unsubscribe, @token)
    render :invalid, status: :not_found unless @account
  end

  def unsubscribe
    account = Reminder.account_for(:unsubscribe, params[:t])
    return render :invalid, status: :not_found unless account

    account.update!(reminder_enabled: false)
    Rails.logger.info("[Reminder] unsubscribed account=#{account.id}")
    render :unsubscribed
  end
end
