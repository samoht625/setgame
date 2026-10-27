# frozen_string_literal: true

class StatsController < ApplicationController
  include CurrentAccount
  include KnownPlayer

  layout "stats"
  before_action :load_known_player

  def show
    @stats = SetStats.cached
  end
end
