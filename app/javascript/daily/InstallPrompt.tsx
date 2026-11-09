import React, { useEffect, useId, useRef, useState } from 'react'
import { track } from '../lib/analytics'
import { primaryButton } from '../lib/buttons'
import { dailyDate } from '../lib/daily'
import { installMemory, promptInstall, rememberInstall, type InstallKind } from '../lib/install'

const DELAY_MS = 1200
const quietButton = 'min-h-10 w-full cursor-pointer rounded-full text-sm font-medium text-neutral-500 transition-colors hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100'

/**
 * A sheet a moment after a finished result, from a player's second day: put
 * Set on the home screen, so tomorrow's deal is one tap away. Chrome gets its
 * install dialog; Safari on iOS, which has none, gets the two taps to make.
 * Styled and dismissed like the reminder prompt.
 */
const InstallPrompt: React.FC<{ kind: InstallKind }> = ({ kind }) => {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDialogElement | null>(null)
  const touchY = useRef<number | null>(null)
  const titleId = useId()

  useEffect(() => {
    const timer = setTimeout(() => {
      rememberInstall({ shownOn: dailyDate() })
      setOpen(true)
      track('install_prompt', { action: 'shown', kind })
    }, DELAY_MS)
    return () => clearTimeout(timer)
  }, [kind])

  useEffect(() => {
    const dialog = ref.current
    if (!open || !dialog || dialog.open) return
    dialog.showModal()
    dialog.focus()
  }, [open])

  // Not now, the scrim, Escape or a swipe count as turning it down; Got it and an accepted install end it.
  const close = (how: string, turnedDown = true) => {
    rememberInstall(turnedDown ? { closedAt: Date.now(), dismissals: (installMemory().dismissals ?? 0) + 1 } : { done: true })
    ref.current?.close()
    setOpen(false)
    track('install_prompt', { action: how, kind })
  }

  const install = async () => {
    const accepted = await promptInstall()
    close(accepted ? 'accepted' : 'declined', !accepted)
  }

  if (!open) return null

  return (
    <dialog
      ref={ref}
      tabIndex={-1}
      aria-labelledby={titleId}
      onCancel={event => { event.preventDefault(); close('escape') }}
      onClick={event => { if (event.target === ref.current) close('outside') }}
      onTouchStart={event => { touchY.current = event.touches[0]?.clientY ?? null }}
      onTouchEnd={event => {
        const start = touchY.current
        touchY.current = null
        const end = event.changedTouches[0]?.clientY
        if (start !== null && end !== undefined && end - start > 48) close('swipe')
      }}
      className="animate-sheet-in m-0 mt-auto w-full max-w-none rounded-t-2xl border-0 border-t border-neutral-200 bg-white p-0 text-center text-neutral-900 shadow-2xl outline-none backdrop:bg-neutral-900/30 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:backdrop:bg-black/55 sm:m-auto sm:w-[min(24rem,calc(100vw-2rem))] sm:rounded-2xl sm:border"
    >
      <div className="px-6 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:pb-5 sm:pt-6">
        <div aria-hidden="true" className="mx-auto mb-4 h-1 w-9 rounded-full bg-neutral-300 dark:bg-neutral-700 sm:hidden" />
        <img src="/icon-192.png" alt="" width={56} height={56} className="mx-auto mb-3 h-14 w-14 rounded-[14px] shadow-sm" />
        <h2 id={titleId} className="text-lg font-semibold tracking-tight">Add Set to your Home Screen</h2>
        <p className="mt-1 text-balance text-sm text-neutral-500 dark:text-neutral-400">Tomorrow’s deal, one tap away.</p>
        {kind === 'ios' ? (
          <>
            <ol className="mx-auto mt-4 w-fit space-y-2 text-left text-sm text-neutral-700 dark:text-neutral-200">
              <li className="flex items-center gap-2">
                <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-xs font-semibold dark:bg-neutral-800">1</span>
                <span>Tap <ShareIcon /> <span className="font-medium">Share</span> in Safari</span>
              </li>
              <li className="flex items-center gap-2">
                <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-xs font-semibold dark:bg-neutral-800">2</span>
                <span>Choose <span className="font-medium">Add to Home Screen</span></span>
              </li>
            </ol>
            <button type="button" onClick={() => close('ok', false)} className={`${primaryButton} mt-4 w-full cursor-pointer`}>Got it</button>
          </>
        ) : (
          <button type="button" onClick={() => void install()} className={`${primaryButton} mt-4 w-full cursor-pointer`}>Add to Home Screen</button>
        )}
        <button type="button" onClick={() => close('not_now')} className={`${quietButton} mt-1`}>Not now</button>
      </div>
    </dialog>
  )
}

const ShareIcon: React.FC = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="inline h-4 w-4 -translate-y-px text-blue-600 dark:text-blue-400">
    <path d="M12 3v12M8 7l4-4 4 4" />
    <path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
  </svg>
)

export default InstallPrompt
