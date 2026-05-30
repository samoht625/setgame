# frozen_string_literal: true

# Lightweight presence endpoint so solo players can see whether anyone is at
# the multiplayer table without opening a WebSocket (which would mark them as
# online). The payload is a tiny array of player ids so the client can exclude
# itself; ids are already public via the game broadcast.
class PresenceController < ApplicationController
  def show
    render json: { player_ids: GAME_ENGINE.online_player_ids_snapshot }
  end
end
