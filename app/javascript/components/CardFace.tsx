import React, { memo } from 'react'
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

export function describeCard(cardId: number): string {
  const { number, color, shape, shading } = cardAttributes(cardId)
  return `${number + 1} ${SHADINGS[shading]} ${COLORS[color].name} ${SHAPES[shape]}${number === 0 ? '' : 's'}`
}

// Mount once outside the board; hidden/display:none can hide SVG paint servers.
export const CardSymbols = memo(function CardSymbols() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" aria-hidden="true" focusable="false" className="pointer-events-none absolute h-0 w-0 overflow-hidden">
      <defs>
        <path
          id="set-card-squiggle"
          d="M-21-50 C-12-57 6-54 17-40 C28-25 23-10 18 2 C12 16 18 27 23 35 C34 51 11 55-3 49 C-29 43-28 23-19 1 C-11-18-10-22-20-39 C-25-47-26-46-21-50 Z"
        />
        <path id="set-card-diamond" d="M0-59 28 0 0 59-28 0Z" />
        <rect id="set-card-oval" x="-26.5" y="-55" width="53" height="110" rx="26.5" />
        {COLORS.map(({ name, ink }) => (
          <pattern key={name} id={`set-card-stripes-${name}`} width="12" height="12" patternUnits="userSpaceOnUse">
            <path d="M0 3H12" fill="none" stroke={ink} strokeWidth="3.5" />
          </pattern>
        ))}
      </defs>
    </svg>
  )
})

const CardFace = memo(function CardFace({ cardId, className = 'h-auto w-full', decorative = false }: CardFaceProps) {
  const { number, color, shape, shading } = cardAttributes(cardId)
  const { name, ink } = COLORS[color]
  const fill = shading === 0 ? ink : shading === 1 ? `url(#set-card-stripes-${name})` : 'none'

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
      fill={fill}
      stroke={ink}
      strokeWidth={shading === 0 ? 0 : shading === 1 ? 4.5 : 6}
      strokeLinejoin="round"
    >
      {Array.from({ length: number + 1 }, (_, index) => (
        <use
          key={index}
          href={`#set-card-${SHAPES[shape]}`}
          transform={`translate(${129 + (index - number / 2) * SHAPE_SPACING[shape]} 83.5)`}
        />
      ))}
    </svg>
  )
})

export default CardFace
