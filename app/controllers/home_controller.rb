# frozen_string_literal: true

class HomeController < ApplicationController
  include CurrentAccount
  include KnownPlayer

  before_action :load_known_player

  def solo
  end

  def multiplayer
  end

  # The front door (/) and /puzzle. ?r= carries a shared result for link
  # previews; the page is always today's puzzle.
  def puzzle
    @shared_result = DailyShare.verify(params[:r], kind: "puzzle")
    # The Daily Deal was the front door once: a Deal result shared from there
    # still opens the Deal, with everything else the link carried.
    return redirect_to("#{daily_path}?#{request.query_string}", status: :moved_permanently) if @shared_result.nil? && DailyShare.verify(params[:r])

    load_boot_statuses
  end

  # /daily. ?r= carries a shared result for link previews; the page is always today's deal.
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
    @boot_statuses = { player_id: @known_player_id, daily: DailyStatus.for(player_id), puzzle: PuzzleStatus.for(player_id), shared: shared_boot }
  end

  # The result a shared link (?r=) carries, so a friend who opens it is asked to beat it.
  def shared_boot
    result = @shared_result
    result && { kind: result.kind, number: result.number, elapsed_ms: result.elapsed_ms, rank: result.rank, total: result.total }
  end
end
