# frozen_string_literal: true

class HomeController < ApplicationController
  def solo
  end

  def multiplayer
  end

  # ?r= carries a shared result for link previews; the page is always today's deal.
  def daily
    @shared_result = DailyShare.verify(params[:r])
  end
end
