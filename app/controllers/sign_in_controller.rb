# frozen_string_literal: true

# Where the emailed link lands. Opening it (GET) doesn't use the link up, so
# mail scanners that prefetch links can't spend it; the page posts the token
# straight back, which signs this browser in.
class SignInController < ApplicationController
  include CurrentAccount

  layout "sign_in"

  def show
    @token = params[:token].to_s
    @reminder = SignInToken.peek(@token)&.reminder_minutes.present?
  end

  def create
    record = SignInToken.redeem(params[:token].to_s)
    unless record
      @reminder = SignInToken.peek(params[:token].to_s)&.reminder_minutes.present?
      return render :expired, status: :unprocessable_entity
    end

    cookie_player = cookies.signed[:player_id].to_s
    account = AccountSignIn.call(
      email: record.email,
      browser_player_id: PlayerResolver.uuid?(cookie_player) ? cookie_player : nil,
      signed_in_account: current_account,
      time_zone: record.time_zone
    )
    # Asked for from a result card: opening the link proves the address, so
    # the reminder goes on now, in the zone the browser asked from.
    if record.reminder_minutes
      account.update!(reminder_enabled: true, reminder_minutes: record.reminder_minutes, time_zone: record.time_zone.presence || account.time_zone)
    end
    end_account_session! if current_account_session
    start_account_session!(account)
    redirect_to with_signed_in_flag(record.return_to.presence || "/", reminder: record.reminder_minutes), status: :see_other
  end

  private

  # The game shows a brief "Signed in as …" when it sees ?signed_in=1 (or
  # "Reminder on · 8:00 AM" with &reminder=480), then drops them from the URL.
  def with_signed_in_flag(path, reminder: nil)
    uri = URI.parse(path)
    uri.query = [uri.query.presence, "signed_in=1", ("reminder=#{reminder.to_i}" if reminder)].compact.join("&")
    uri.to_s
  rescue URI::InvalidURIError
    "/?signed_in=1"
  end
end
