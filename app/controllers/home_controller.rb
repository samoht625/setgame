# frozen_string_literal: true

class HomeController < ApplicationController
  include CurrentAccount

  before_action :load_known_player

  def solo
  end

  def multiplayer
  end

  def puzzle
    @shared_result = DailyShare.verify(params[:r], kind: "puzzle")
  end

  # The front door (/) and /daily. ?r= carries a shared result for link
  # previews; the page is always today's deal.
  def daily
    @shared_result = DailyShare.verify(params[:r])
  end

  private

  # The player this browser's cookie names, if any. The page hands it to the
  # client so a browser whose storage was wiped (in-app browsers, private
  # tabs that keep cookies) gets its identity back instead of a new one.
  # A signed-in browser gets its account's player and email instead, and
  # every browser it's signed in on plays as that one player.
  def load_known_player
    @sign_in_enabled = SignInMailer.enabled?
    account = current_account
    id = account ? account.player_id : cookies.signed[:player_id].to_s
    return unless PlayerResolver.uuid?(id)
    return if account.nil? && Account.owns_player?(id)

    @account_email = account&.email
    @reminder = account && (account.reminder_enabled ? account.reminder_minutes.to_s : "off:#{account.reminder_minutes}")
    @known_player_id = id
    @known_player_key = PlayerKey.for(id)
    @known_player_name = PlayerIdentity.last_name(id)
  end
end
