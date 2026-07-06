# frozen_string_literal: true

module SoloReplay
  # Replays solitaire deal/claim/win rules for rules_version 1.
  # Must stay aligned with app/javascript/solitaire deal logic.
  class Simulator
    attr_reader :board, :deck

    def initialize(seed)
      @rng = SoloRng.new(seed.is_a?(Integer) ? seed : seed.to_i)
      @board = []
      @deck = []
      @status = "playing"
      deal_initial!
    end

    def apply_claim!(card_ids)
      card_ids = Array(card_ids).map(&:to_i)
      raise "must_select_three" unless card_ids.length == 3
      raise "not_a_set" unless Rules.is_set?(card_ids[0], card_ids[1], card_ids[2])
      raise "cards_not_on_board" unless card_ids.all? { |id| @board.include?(id) }

      pre_length = @board.length
      if pre_length >= 15
        remove_cards!(card_ids)
      else
        replace_in_place!(card_ids)
      end

      ensure_sets_exist!

      @status = "round_over" if @deck.empty? && !Rules.set_exists?(@board)
      true
    end

    def finished?
      @status == "round_over"
    end

    private

    def deal_initial!
      @deck = @rng.shuffle((1..81).to_a)
      @board = []
      deal!(12)
      ensure_sets_exist!
    end

    def deal!(count)
      [count, @deck.length].min.times { @board << @deck.shift }
    end

    def ensure_sets_exist!
      while @board.length < 18 && !Rules.set_exists?(@board) && !@deck.empty?
        deal!(3)
      end

      return unless @board.length >= 18 && !Rules.set_exists?(@board)

      # Canonical order: board first, then deck
      pool = @board + @deck
      @rng.shuffle!(pool)
      @deck = pool
      @board = []
      deal!(12)

      while @board.length < 18 && !Rules.set_exists?(@board) && !@deck.empty?
        deal!(3)
      end
    end

    def remove_cards!(card_ids)
      card_ids.each do |id|
        idx = @board.index(id)
        @board.delete_at(idx) if idx
      end
    end

    def replace_in_place!(card_ids)
      card_ids.each do |id|
        idx = @board.index(id)
        next unless idx

        if @deck.any?
          @board[idx] = @deck.shift
        else
          @board.delete_at(idx)
        end
      end
    end
  end
end
