# frozen_string_literal: true

module SoloReplay
  class Verifier
    MIN_ELAPSED_MS = 30_000
    MAX_ELAPSED_MS = 2 * 60 * 60 * 1000
    MIN_CLAIM_GAP_MS = 200
    ELAPSED_TOLERANCE_MS = 250
    WALL_CLOCK_SLACK_MS = 2_000

    def initialize(solo_game:, player_id:, elapsed_ms:, events:)
      @game = solo_game
      @player_id = player_id
      @elapsed_ms = elapsed_ms.to_i
      @events = Array(events)
    end

    def call
      return failure("game_not_found") unless @game
      return failure("wrong_player") unless @game.player_id == @player_id
      return failure("already_completed") if @game.status == "completed"
      return failure("expired") if @game.expired? || @game.status == "expired"
      return failure("unsupported_rules_version") unless @game.rules_version == SoloGame::RULES_VERSION
      return failure("invalid_elapsed") unless @elapsed_ms.between?(MIN_ELAPSED_MS, MAX_ELAPSED_MS)

      wall_ms = ((Time.current - @game.started_at) * 1000).to_i + WALL_CLOCK_SLACK_MS
      return failure("wall_clock_exceeded") if @elapsed_ms > wall_ms

      claims = []
      @events.each_with_index do |event, idx|
        type = event["type"] || event[:type]
        return failure("pause_not_allowed") if type.to_s == "pause" || type.to_s == "resume"
        return failure("invalid_event") unless type.to_s == "claim"

        cards = event["cards"] || event[:cards]
        t_ms = (event["t_ms"] || event[:t_ms]).to_i
        return failure("invalid_claim") unless cards.is_a?(Array) && cards.length == 3
        return failure("invalid_timestamp") if t_ms < 0

        if claims.any?
          prev = claims.last[:t_ms]
          return failure("timestamps_not_increasing") if t_ms < prev + MIN_CLAIM_GAP_MS
        end

        claims << { cards: cards.map(&:to_i), t_ms: t_ms }
      end

      return failure("no_claims") if claims.empty?

      last_t = claims.last[:t_ms]
      return failure("elapsed_mismatch") if (@elapsed_ms - last_t).abs > ELAPSED_TOLERANCE_MS

      sim = Simulator.new(@game.seed.to_i)
      claims.each do |claim|
        begin
          sim.apply_claim!(claim[:cards])
        rescue StandardError => e
          return failure(e.message)
        end
      end

      return failure("game_not_complete") unless sim.finished?

      success
    rescue StandardError => e
      Rails.logger.warn("[SoloReplay::Verifier] #{e.class}: #{e.message}")
      failure("verification_error")
    end

    private

    def success
      { ok: true }
    end

    def failure(code)
      { ok: false, error: code }
    end
  end
end
