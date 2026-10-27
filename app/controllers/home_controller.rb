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
    load_boot_statuses
  end

  # The front door (/) and /daily. ?r= carries a shared result for link
  # previews; the page is always today's deal.
  def daily
    @shared_result = DailyShare.verify(params[:r])
    load_boot_statuses
  end

  private

  # Both dailies' status for this browser's player, inlined so the first
  # paint shows the start or result card (and the result card's next game)
  # instead of a loading card that swaps out. With no known player it's what
  # a brand-new player sees; the client only uses it for that player.
  def load_boot_statuses
    player_id = @known_player_id || SecureRandom.uuid
    @boot_statuses = { player_id: @known_player_id, daily: DailyStatus.for(player_id), puzzle: PuzzleStatus.for(player_id) }
  end
end
