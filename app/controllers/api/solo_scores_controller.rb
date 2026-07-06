# frozen_string_literal: true

module Api
  class SoloScoresController < BaseController
    def create
      game = SoloGame.find_by(id: params[:game_id])
      events = normalize_events(params[:events])

      verification = SoloReplay::Verifier.new(
        solo_game: game,
        player_id: current_player_id,
        elapsed_ms: params[:elapsed_ms],
        events: events
      ).call

      unless verification[:ok]
        return render json: { error: verification[:error] }, status: :unprocessable_entity
      end

      display_name = sanitize_name(params[:display_name])

      score = SoloScore.create!(
        solo_game: game,
        player_id: current_player_id,
        display_name: display_name,
        elapsed_ms: params[:elapsed_ms].to_i,
        completed_at: Time.current,
        events: events
      )
      game.mark_completed!

      personal = SoloScore.personal_bests(player_id: current_player_id)
      render json: {
        ok: true,
        score: serialize_score(score),
        personal_bests: {
          daily: personal[:daily]&.elapsed_ms,
          weekly: personal[:weekly]&.elapsed_ms,
          monthly: personal[:monthly]&.elapsed_ms,
          all_time: personal[:all_time]&.elapsed_ms
        },
        is_personal_best: {
          daily: personal[:daily]&.id == score.id,
          weekly: personal[:weekly]&.id == score.id,
          monthly: personal[:monthly]&.id == score.id
        }
      }
    rescue ActiveRecord::RecordInvalid => e
      render json: { error: "invalid_score", message: e.message }, status: :unprocessable_entity
    end

    def leaderboard
      period = params[:period].to_s
      unless SoloScore::PERIODS.include?(period)
        return render json: { error: "invalid_period" }, status: :bad_request
      end

      limit = [[params.fetch(:limit, 20).to_i, 1].max, 100].min
      rows = SoloScore.leaderboard(period: period, limit: limit)

      render json: {
        period: period,
        entries: rows.map { |s| serialize_score(s) }
      }
    end

    def personal_bests
      personal = SoloScore.personal_bests(player_id: current_player_id)
      render json: {
        daily: personal[:daily] && serialize_score(personal[:daily]),
        weekly: personal[:weekly] && serialize_score(personal[:weekly]),
        monthly: personal[:monthly] && serialize_score(personal[:monthly]),
        all_time: personal[:all_time] && serialize_score(personal[:all_time])
      }
    end

    private

    def serialize_score(score)
      {
        player_id: score.player_id,
        display_name: score.display_name,
        elapsed_ms: score.elapsed_ms,
        completed_at: score.completed_at.iso8601
      }
    end

    def sanitize_name(name)
      return nil if name.blank?

      name = name.to_s.strip
      return nil if name.length < 1 || name.length > 20
      return nil unless name.match?(/\A[\p{L}\p{Nd} _\-]+\z/u)

      name
    end

    def normalize_events(raw)
      Array(raw).map do |e|
        h = e.respond_to?(:to_unsafe_h) ? e.to_unsafe_h : e.to_h
        h = h.deep_stringify_keys
        {
          "type" => h["type"],
          "cards" => Array(h["cards"]).map(&:to_i),
          "t_ms" => h["t_ms"].to_i
        }
      end
    end
  end
end
