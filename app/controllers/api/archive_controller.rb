# frozen_string_literal: true

module Api
  # What this player did on closed days, for the archive: their ranked
  # results from the days themselves. Read-only. A practice run of an
  # archived day is played and kept in the browser and never sent anywhere.
  class ArchiveController < BaseController
    # The days on one page of /archive that this player finished when they
    # were live, by game and day number, each with their time. The page's
    # HTML is the same for everyone; its script marks the played days from this.
    def index
      index = DailyArchive::Index.new(DailyArchive.all)
      page = index.page_number(params[:page])
      return render json: { error: "not_found" }, status: :not_found unless page

      render json: { page: page }.merge(played_on(index.rows(page)))
    end

    def show
      day = ArchivedDay.find(params[:kind], params[:number])
      return render json: { error: "not_found" }, status: :not_found unless day

      render json: { kind: day.kind, number: day.number, date: day.date.iso8601, result: day.result_for(current_player_id) }
    end

    private

    def played_on(rows)
      dates = rows.map(&:date)
      times = {
        "daily" => SoloScore.where(player_id: current_player_id, daily_on: dates).group(:daily_on).minimum(:elapsed_ms),
        "puzzle" => PuzzleRun.finished.where(player_id: current_player_id, puzzle_on: dates).group(:puzzle_on).minimum(:elapsed_ms)
      }.transform_values { |by_date| by_date.transform_keys(&:to_date) }
      DailyArchive::KINDS.to_h do |kind|
        played = rows.filter_map do |row|
          day = row.days[kind]
          elapsed_ms = day && times.fetch(kind)[day.date]
          [day.number.to_s, { elapsed_ms: elapsed_ms }] if elapsed_ms
        end
        [kind, played.to_h]
      end
    end
  end
end
