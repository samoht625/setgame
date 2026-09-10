import React, { useEffect, useRef, useState } from 'react'
import { Hud, HudDivider, HudIconButton, HudStat, PeopleIcon, RestartIcon } from './Hud'

interface MultiplayerHudProps {
  playerId: string
  names: Record<string, string>
  scores: Record<string, number>
  deckCount: number
  onlineCount: number
  isConnected: boolean
  announcement: string | null
  resetCountdown: number
  resetRequestedBy: string | null
  panelOpen: boolean
  onTogglePanel: () => void
  onUpdateName: (name: string) => void
  onRequestReset: () => void
  onCancelReset: () => void
}

/**
 * Your name and score, how many cards are left, whether you're connected, and
 * the controls. Set announcements briefly take over the strip so they never
 * need a row of their own.
 */
const MultiplayerHud: React.FC<MultiplayerHudProps> = ({
  playerId,
  names,
  scores,
  deckCount,
  onlineCount,
  isConnected,
  announcement,
  resetCountdown,
  resetRequestedBy,
  panelOpen,
  onTogglePanel,
  onUpdateName,
  onRequestReset,
  onCancelReset
}) => {
  const [isEditing, setIsEditing] = useState(false)
  const [tempName, setTempName] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  const startEditing = () => {
    setTempName(names[playerId] || '')
    setIsEditing(true)
  }

  const commit = () => {
    const next = tempName.trim().slice(0, 20)
    if (next) onUpdateName(next)
    setIsEditing(false)
  }

  const isResetPending = resetCountdown > 0
  const resetRequesterName = resetRequestedBy === playerId
    ? 'You'
    : names[resetRequestedBy || ''] || 'A player'
  const resetSeconds = Math.max(1, Math.ceil(resetCountdown))
  const resetLabel = isResetPending
    ? `${resetRequesterName} requested a reset. Stop reset with ${resetSeconds} seconds remaining`
    : 'Reset game'

  return (
    <Hud
      actions={
        <>
          <button
            type="button"
            onClick={isResetPending ? onCancelReset : onRequestReset}
            disabled={!isConnected}
            aria-label={resetLabel}
            title={isResetPending ? `${resetRequesterName} requested a reset` : 'Reset game'}
            className={`flex h-10 items-center gap-1.5 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-100 disabled:cursor-not-allowed disabled:opacity-40 dark:focus-visible:ring-offset-neutral-950 ${
              isResetPending
                ? 'bg-rose-100 px-3 text-xs font-semibold text-rose-700 hover:bg-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:hover:bg-rose-950'
                : 'w-10 justify-center text-neutral-500 hover:bg-neutral-200/70 hover:text-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100'
            }`}
          >
            <RestartIcon />
            {isResetPending && (
              <span aria-live="assertive" className="whitespace-nowrap tabular-nums">Stop · {resetSeconds}s</span>
            )}
          </button>
          <HudIconButton
            label="Players"
            onClick={onTogglePanel}
            active={panelOpen}
            aria-expanded={panelOpen}
            badge={onlineCount}
          >
            <PeopleIcon />
          </HudIconButton>
        </>
      }
    >
      <div aria-live="polite" aria-atomic="true" className={announcement ? 'min-w-0' : 'sr-only'}>
        {announcement && (
          <div
            role="status"
            className="flex items-center gap-2 truncate rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100"
          >
            <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" aria-hidden="true" />
            <span className="truncate">{announcement}</span>
          </div>
        )}
      </div>

      {!announcement && (
        <>
          <div className="flex min-w-0 items-center gap-2">
            {isEditing ? (
              <input
                ref={inputRef}
                value={tempName}
                onChange={(e) => setTempName(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commit()
                  if (e.key === 'Escape') setIsEditing(false)
                }}
                placeholder="Your name"
                aria-label="Your name"
                maxLength={20}
                className="w-32 rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm focus:border-neutral-500 focus:outline-none dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100 dark:focus:border-neutral-400"
              />
            ) : (
              <button
                type="button"
                onClick={startEditing}
                disabled={!playerId}
                title="Click to edit your name"
                className="group flex min-w-0 items-center gap-1.5 rounded-md text-sm font-medium text-neutral-900 hover:text-neutral-600 dark:text-neutral-100 dark:hover:text-neutral-300"
              >
                <span className="truncate">{names[playerId] || 'You'}</span>
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-3 w-3 shrink-0 text-neutral-400 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                >
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </button>
            )}
            <span className="text-xl font-semibold tabular-nums tracking-tight text-neutral-900 dark:text-neutral-100 sm:text-2xl" aria-label="Your score">
              {scores[playerId] || 0}
            </span>
          </div>
          <HudDivider />
          <HudStat value={deckCount} label="cards left" shortLabel="left" />
          <span className="flex items-center gap-1.5 whitespace-nowrap text-xs text-neutral-400 dark:text-neutral-500">
            <span className={`h-1.5 w-1.5 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-rose-500'}`} aria-hidden="true" />
            {isConnected ? 'Live' : 'Reconnecting…'}
          </span>
        </>
      )}
    </Hud>
  )
}

export default MultiplayerHud
