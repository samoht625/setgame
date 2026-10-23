# frozen_string_literal: true

class StatsController < ApplicationController
  layout "stats"

  def show
    @stats = SetStats.cached
  end
end
