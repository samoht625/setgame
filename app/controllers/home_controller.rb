# frozen_string_literal: true

class HomeController < ApplicationController
  include CurrentAccount
  include KnownPlayer

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
end
