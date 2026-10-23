# frozen_string_literal: true

module StatsHelper
  INKS = [%w[red #ea1c2d], %w[purple #613394], %w[green #009b4d]].freeze
  SHAPES = %w[squiggle diamond oval].freeze
  SPACING = [66, 72, 72].freeze

  def set_card_svg(id)
    a = Rules.card_attributes(id)
    name, ink = INKS[a[:color]]
    fill = [ink, "url(#st-#{name})", "none"][a[:shading]]
    n = a[:number]
    uses = (0..n).map do |i|
      tag.use(href: "#st-#{SHAPES[a[:shape]]}", transform: "translate(#{129 + (i - n / 2.0) * SPACING[a[:shape]]} 83.5)")
    end
    tag.svg(safe_join(uses), class: "c", viewBox: "0 0 258 167", fill: fill, stroke: ink,
      "stroke-width": [0, 4.5, 6][a[:shading]], "stroke-linejoin": "round", role: "img",
      "aria-label": "#{n + 1} #{%w[solid striped open][a[:shading]]} #{name} #{SHAPES[a[:shape]]}#{n.zero? ? '' : 's'}")
  end

  def set_cards(cards)
    tag.span(safe_join(cards.map { |c| set_card_svg(c) }), class: "set")
  end

  def secs(ms)
    return "–" unless ms
    ms < 60_000 ? format("%.1fs", ms / 1000.0) : format("%d:%02d", ms / 60_000, (ms / 1000) % 60)
  end
end
