import React from 'react'
import { useNow } from '../hooks/useNow'
import { secondaryButtonSmall } from '../lib/buttons'
import { formatCountdown } from '../lib/daily'

interface NextDealCountdownProps {
  nextAt: string
  noun?: string
  stale?: boolean
  onNextDeal?: () => void
  variant?: 'card' | 'panel'
}

/**
 * Isolated countdown leaf so the 30s tick never re-renders the game root,
 * Board, or SVG CardFace nodes.
 */
const NextDealCountdown: React.FC<NextDealCountdownProps> = ({
  nextAt,
  noun = 'deal',
  stale = false,
  onNextDeal,
  variant = 'card'
}) => {
  const nowMs = useNow(30_000)
  const msLeft = Date.parse(nextAt) - nowMs

  if (variant === 'panel') {
    return <>{msLeft > 0 ? `Next ${noun} in ${formatCountdown(msLeft)}` : `A new ${noun} is ready`}</>
  }

  if (!stale && msLeft > 0) {
    return (
      <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
        Next {noun} in {formatCountdown(msLeft)}
      </span>
    )
  }

  return (
    <button type="button" onClick={onNextDeal} className={secondaryButtonSmall}>
      Play today’s {noun}
    </button>
  )
}

export default NextDealCountdown
