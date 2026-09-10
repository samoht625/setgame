import React from 'react'
import { useMediaQuery } from '../hooks/useSidePanel'

/**
 * The compact strip above the board. It has a fixed height so the board never
 * shifts when its contents change (status chips, announcements, countdowns).
 */
export const Hud: React.FC<{ children: React.ReactNode; actions?: React.ReactNode }> = ({ children, actions }) => (
  <div className="mb-3 flex h-11 items-center justify-between gap-2 sm:gap-4">
    <div className="flex min-w-0 flex-1 items-center gap-2.5 sm:gap-4">{children}</div>
    {actions && <div className="flex shrink-0 items-center gap-0.5">{actions}</div>}
  </div>
)

/** A number with a label; the label shortens on narrow phones. */
export const HudStat: React.FC<{ value: React.ReactNode; label: string; shortLabel?: string }> = ({ value, label, shortLabel }) => {
  const roomy = useMediaQuery('(min-width: 640px)')
  return (
    <span className="whitespace-nowrap text-xs text-neutral-500 dark:text-neutral-400 sm:text-sm">
      <span className="font-semibold tabular-nums text-neutral-900 dark:text-neutral-100">{value}</span>
      {' '}
      {roomy || !shortLabel ? label : shortLabel}
    </span>
  )
}

export const HudDivider: React.FC = () => (
  <span aria-hidden="true" className="hidden h-4 w-px bg-neutral-200 dark:bg-neutral-800 sm:block" />
)

type ChipTone = 'neutral' | 'amber' | 'emerald' | 'rose'

const CHIP_TONES: Record<ChipTone, string> = {
  neutral: 'bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200',
  amber: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
  emerald: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  rose: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200'
}

export const HudChip: React.FC<{ tone?: ChipTone; children: React.ReactNode }> = ({ tone = 'neutral', children }) => (
  <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${CHIP_TONES[tone]}`}>{children}</span>
)

interface HudIconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  active?: boolean
  badge?: number
  children: React.ReactNode
}

export const HudIconButton: React.FC<HudIconButtonProps> = ({ label, active = false, badge, className = '', children, ...rest }) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    className={`relative flex h-10 w-10 items-center justify-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-100 disabled:cursor-not-allowed disabled:opacity-40 dark:focus-visible:ring-offset-neutral-950 ${
      active
        ? 'bg-neutral-900 text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300'
        : 'text-neutral-500 hover:bg-neutral-200/70 hover:text-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100'
    } ${className}`}
    {...rest}
  >
    {children}
    {badge !== undefined && badge > 0 && (
      <span
        aria-hidden="true"
        className={`absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums ring-2 ring-neutral-100 dark:ring-neutral-950 ${
          active ? 'bg-emerald-500 text-white' : 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900'
        }`}
      >
        {badge}
      </span>
    )}
  </button>
)

const iconProps = {
  xmlns: 'http://www.w3.org/2000/svg',
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  className: 'h-5 w-5'
}

export const PauseIcon: React.FC = () => (
  <svg {...iconProps} fill="currentColor" stroke="none"><path d="M6 5h4v14H6zM14 5h4v14h-4z" /></svg>
)

export const PlayIcon: React.FC = () => (
  <svg {...iconProps} fill="currentColor" stroke="none"><path d="M8 5v14l11-7z" /></svg>
)

export const RestartIcon: React.FC = () => (
  <svg {...iconProps}><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" /></svg>
)

export const TrophyIcon: React.FC = () => (
  <svg {...iconProps}>
    <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z" />
    <path d="M7 6H4.5a1.5 1.5 0 0 0-1.5 1.5C3 9.5 4.5 11 7 11M17 6h2.5A1.5 1.5 0 0 1 21 7.5C21 9.5 19.5 11 17 11" />
  </svg>
)

export const PeopleIcon: React.FC = () => (
  <svg {...iconProps}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
)

export const CloseIcon: React.FC = () => (
  <svg {...iconProps} strokeWidth={2}><path d="M18 6 6 18M6 6l12 12" /></svg>
)
