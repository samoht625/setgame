# frozen_string_literal: true

class HomeController < ApplicationController
  before_action :load_known_player

  def solo
  end

  def multiplayer
  end

  def puzzle
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
  def load_known_player
    id = cookies.signed[:player_id].to_s
    return unless id.match?(Api::BaseController::UUID_PATTERN)

    @known_player_id = id
    @known_player_name = PlayerIdentity.last_name(id)
  end
end
