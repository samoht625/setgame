# frozen_string_literal: true

module Api
  # What this player did on a closed day, for that day's archive page: their
  # ranked result if they finished it then. Read-only. A practice run of an
  # archived day is played and kept in the browser and never sent anywhere.
  class ArchiveController < BaseController
    def show
      day = ArchivedDay.find(params[:kind], params[:number])
      return render json: { error: "not_found" }, status: :not_found unless day

      render json: { kind: day.kind, number: day.number, date: day.date.iso8601, result: day.result_for(current_player_id) }
    end
  end
end
