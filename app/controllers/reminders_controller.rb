# frozen_string_literal: true

# Links in the reminder email: Play (opens the game, offering to sign this
# browser in first) and Unsubscribe (also the List-Unsubscribe one-click
# POST target).
class RemindersController < ApplicationController
  include CurrentAccount

  POSTS_PER_MINUTE = 30

  layout "sign_in"
  # Mail providers POST List-Unsubscribe=One-Click without a form token; the
  # signed token in the URL is the authorization.
  skip_forgery_protection only: :unsubscribe
  before_action :limit_posts!, only: %i[sign_in_and_play unsubscribe resubscribe]

  # Where a Play link's `to` opens: it names the game. Emails sent while the
  # Daily Deal was the home page said "/" for the Deal and "/puzzle" for the
  # Puzzle, and still open the same game. Anything else opens the home page.
  PLAY_PATHS = { "daily" => "/daily", "puzzle" => "/", "/" => "/daily", "/puzzle" => "/" }.freeze

  # A browser already signed in to the account goes straight to the game.
  # Any other browser is asked first, naming the account, so nobody can sign
  # a stranger in to theirs by sending them their own Play link.
  def play
    @path = play_path
    @to = params[:to].to_s
    @token = params[:t].to_s
    account = Reminder.account_for(:play, @token)
    return redirect_to @path, status: :see_other if account.nil? || current_account == account

    @email = account.email
    @merges = current_account.nil?
  end

  def sign_in_and_play
    account = Reminder.account_for(:play, params[:t])
    if account && current_account != account
      cookie_player = cookies.signed[:player_id].to_s
      AccountSignIn.call(email: account.email, browser_player_id: PlayerResolver.uuid?(cookie_player) ? cookie_player : nil, signed_in_account: current_account)
      end_account_session! if current_account_session
      start_account_session!(account)
    end
    redirect_to play_path, status: :see_other
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
    @token = params[:t].to_s
    render :unsubscribed
  end

  # "Turn back on" from the page above: same token, same time as before.
  def resubscribe
    @account = Reminder.account_for(:unsubscribe, params[:t])
    return render :invalid, status: :not_found unless @account

    @account.update!(reminder_enabled: true)
    Rails.logger.info("[Reminder] resubscribed account=#{@account.id}")
    @next_at = Reminder.next_at(@account)
    render :resubscribed
  end

  private

  def limit_posts!
    return unless RateLimit.exceeded?("reminders-post", request.remote_ip, to: POSTS_PER_MINUTE, within: 1.minute)

    head :too_many_requests
  end

  def play_path
    PLAY_PATHS.fetch(params[:to].to_s, "/")
  end
end
