# frozen_string_literal: true

# The account a signed-in browser belongs to, from its session cookie.
module CurrentAccount
  SESSION_COOKIE = :setgame_session

  private

  def current_account_session
    return @current_account_session if defined?(@current_account_session)

    @current_account_session = AccountSession.authenticate(cookies.signed[SESSION_COOKIE])
  end

  def current_account
    current_account_session&.account
  end

  def start_account_session!(account)
    _session, token = AccountSession.start!(account, user_agent: request.user_agent)
    cookies.signed[SESSION_COOKIE] = secure_cookie(token, AccountSession::LIFETIME)
    remember_player!(account.player_id)
  end

  def end_account_session!
    current_account_session&.destroy
    @current_account_session = nil
    cookies.delete(SESSION_COOKIE)
  end

  def remember_player!(player_id)
    cookies.signed[:player_id] = secure_cookie(player_id, 1.year)
  end

  # HttpOnly, SameSite=Lax, and Secure wherever the site is served over HTTPS.
  def secure_cookie(value, lifetime)
    { value: value, expires: lifetime.from_now, httponly: true, same_site: :lax, secure: Rails.env.production? }
  end
end
