import React, { Fragment, memo } from 'react'
import { cardAttributes } from '../lib/rules'

interface CardFaceProps {
  cardId: number
  className?: string
  decorative?: boolean
}

const COLORS = [
  { name: 'red', ink: '#ea1c2d' },
  { name: 'purple', ink: '#613394' },
  { name: 'green', ink: '#009b4d' }
] as const
const SHAPES = ['squiggle', 'diamond', 'oval'] as const
const SHADINGS = ['solid', 'striped', 'open'] as const
const SHAPE_SPACING = [66, 72, 72] as const
// Solid shapes carry the open outline too, so every shading shares one silhouette.
const OUTLINE_WIDTH = [6, 4.5, 6] as const
// Eight stripes, 12 apart and mirrored about the shape's center.
const STRIPES = [-42, -30, -18, -6, 6, 18, 30, 42].map(y => `M-32 ${y}H32`).join('')

export function describeCard(cardId: number): string {
  const { number, color, shape, shading } = cardAttributes(cardId)
  return `${number + 1} ${SHADINGS[shading]} ${COLORS[color].name} ${SHAPES[shape]}${number === 0 ? '' : 's'}`
}

// Mount once outside the board; hidden/display:none can hide SVG paint servers.
export const CardSymbols = memo(function CardSymbols() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" aria-hidden="true" focusable="false" className="pointer-events-none absolute h-0 w-0 overflow-hidden">
      <defs>
        {/* Every shape is centered on its origin, and the squiggle is point-symmetric about it. */}
        <path
          id="set-card-squiggle"
          d="M-8-52.25 C10-52.25 23-40.25 23-20.75 C23-5.5 14.25 4.5 14.25 14.75 C14.25 27 25 36.25 25 42.5 C25 48.75 16 52.25 8 52.25 C-10 52.25-23 40.25-23 20.75 C-23 5.5-14.25-4.5-14.25-14.75 C-14.25-27-25-36.25-25-42.5 C-25-48.75-16-52.25-8-52.25 Z"
        />
        <path id="set-card-diamond" d="M0-59 28 0 0 59-28 0Z" />
        <rect id="set-card-oval" x="-26.5" y="-55" width="53" height="110" rx="26.5" />
        {/* Stripes are clipped lines rather than a pattern fill: renderers rasterize pattern tiles, which blurs the lines and leaves seams between tiles. */}
        <path id="set-card-stripes" d={STRIPES} fill="none" strokeWidth="3.5" />
        {SHAPES.map(shape => (
          <Fragment key={shape}>
            <clipPath id={`set-card-${shape}-clip`}>
              <use href={`#set-card-${shape}`} />
            </clipPath>
            <g id={`set-card-${shape}-striped`}>
              <use href="#set-card-stripes" clipPath={`url(#set-card-${shape}-clip)`} />
              <use href={`#set-card-${shape}`} />
            </g>
          </Fragment>
        ))}
      </defs>
    </svg>
  )
})

const CardFace = memo(function CardFace({ cardId, className = 'h-auto w-full', decorative = false }: CardFaceProps) {
  const { number, color, shape, shading } = cardAttributes(cardId)
  const { ink } = COLORS[color]
  const symbol = `#set-card-${SHAPES[shape]}${shading === 1 ? '-striped' : ''}`

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 258 167"
      width="258"
      height="167"
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : describeCard(cardId)}
      aria-hidden={decorative ? true : undefined}
      focusable="false"
      className={`block aspect-[258/167] bg-white dark:bg-[#f1f0ec] ${className}`}
      fill={shading === 0 ? ink : 'none'}
      stroke={ink}
      strokeWidth={OUTLINE_WIDTH[shading]}
      strokeLinejoin="round"
    >
      {Array.from({ length: number + 1 }, (_, index) => (
        <use
          key={index}
          href={symbol}
          transform={`translate(${129 + (index - number / 2) * SHAPE_SPACING[shape]} 83.5)`}
        />
      ))}
    </svg>
  )
})

export default CardFace
