import React, { useEffect, useId, useRef, useState } from 'react'
import { EMAIL_PATTERN, requestSignIn, type SignInRequest } from '../lib/account'
import { track } from '../lib/analytics'
import { primaryButton, secondaryButtonSmall } from '../lib/buttons'
import { dailyDate } from '../lib/daily'
import { DEFAULT_REMINDER_MINUTES } from '../lib/reminder'

const STORAGE_KEY = 'setgame_reminder_prompt_v1'
/** After "Not now", offer again once this long has passed... */
export const PROMPT_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000
/** ...until it has been turned down this many times; then only the menu's Sign in offers it. */
export const PROMPT_MAX_DISMISSALS = 3
const DELAY_MS = 1200
const RESEND_SECONDS = 30

type Memory = { shownOn?: string; closedAt?: number; dismissals?: number }

function recall(): Memory {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as Memory
  } catch {
    return {}
  }
}

function remember(update: Memory): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...recall(), ...update }))
  } catch {
    // Storage unavailable: it just offers again next time.
  }
}

/** At most once a day (across the Daily Deal and the Puzzle), not within the cooldown after it was closed, and never after three Not nows. */
function due(): boolean {
  const memory = recall()
  if ((memory.dismissals ?? 0) >= PROMPT_MAX_DISMISSALS) return false
  if (memory.shownOn === dailyDate()) return false
  return !memory.closedAt || Date.now() - memory.closedAt >= PROMPT_COOLDOWN_MS
}

const ERRORS: Record<Exclude<SignInRequest, 'sent'> | 'empty', string> = {
  empty: 'Enter your email.',
  invalid_email: 'That doesn’t look like an email.',
  rate_limited: 'Too many tries. Try again in a few minutes.',
  failed: 'Couldn’t send the email. Try again.'
}

const ignore = { 'data-1p-ignore': true, 'data-lpignore': 'true', 'data-bwignore': 'true', 'data-form-type': 'other' } as const
const quietButton = 'min-h-10 w-full cursor-pointer rounded-full text-sm font-medium text-neutral-500 transition-colors hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100'

/**
 * A one-time sheet a moment after a finished result shows, for signed-out
 * players: their email, sent as a link that confirms the 8 AM reminder (and
 * signs in). A modal over a light scrim, attached to the bottom edge on phones
 * and centered on wider screens; closes with Not now, a tap on the scrim, a
 * swipe down or Escape. The time can be changed later from the menu.
 */
const ReminderPrompt: React.FC = () => {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [step, setStep] = useState<'form' | 'sending' | 'sent'>('form')
  const [error, setError] = useState<keyof typeof ERRORS | null>(null)
  const [cooldown, setCooldown] = useState(0)
  const [resent, setResent] = useState(false)
  const [resending, setResending] = useState(false)
  const ref = useRef<HTMLDialogElement | null>(null)
  const touchY = useRef<number | null>(null)
  const titleId = useId()
  const errorId = useId()

  useEffect(() => {
    if (!due()) return
    const timer = setTimeout(() => {
      if (!due()) return
      remember({ shownOn: dailyDate() })
      setOpen(true)
      track('reminder_prompt', { action: 'shown' })
    }, DELAY_MS)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    const dialog = ref.current
    if (!open || !dialog || dialog.open) return
    // Focus the sheet itself, not the email field, so a phone doesn't throw up its keyboard uninvited.
    dialog.showModal()
    dialog.focus()
  }, [open])

  // Closing it without sending (Not now, the scrim, Escape, a swipe) counts as turning it down.
  const close = (how: string) => {
    remember(step === 'sent' ? { closedAt: Date.now() } : { closedAt: Date.now(), dismissals: (recall().dismissals ?? 0) + 1 })
    ref.current?.close()
    setOpen(false)
    track('reminder_prompt', { action: how })
  }

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setTimeout(() => setCooldown(value => value - 1), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])

  const send = async (resend = false) => {
    const value = email.trim()
    if (value === '') return setError('empty')
    if (!EMAIL_PATTERN.test(value)) return setError('invalid_email')
    if (resend) setResending(true)
    else setStep('sending')
    setError(null)
    const outcome = await requestSignIn(value, DEFAULT_REMINDER_MINUTES)
    setResending(false)
    track('sign_in_request', { source: 'prompt', outcome, reminder: true, resend })
    if (outcome === 'sent') {
      setStep('sent')
      setCooldown(RESEND_SECONDS)
      setResent(resend)
      remember({ closedAt: Date.now() })
    } else {
      if (!resend) setStep('form')
      setError(outcome)
    }
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
        {step === 'sent' ? (
          <div role="status">
            <h2 id={titleId} className="text-lg font-semibold tracking-tight">Check your email to confirm</h2>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              We sent a link to <span className="break-all font-medium text-neutral-900 dark:text-neutral-100">{email.trim()}</span>.
            </p>
            {error && <p role="alert" className="mt-2 text-xs text-rose-700 dark:text-rose-300">{ERRORS[error]}</p>}
            <div className="mt-4 flex justify-center gap-2">
              <button type="button" onClick={() => { setStep('form'); setError(null) }} className={`${secondaryButtonSmall} cursor-pointer`}>
                Use a different email
              </button>
              <button type="button" disabled={cooldown > 0 || resending} onClick={() => void send(true)} className={`${secondaryButtonSmall} cursor-pointer disabled:cursor-default`}>
                {resending ? 'Sending…' : cooldown > 0 ? (resent ? `Sent · resend in ${cooldown}s` : `Resend in ${cooldown}s`) : 'Resend'}
              </button>
            </div>
            <button type="button" onClick={() => close('done')} className={`${quietButton} mt-2`}>Done</button>
          </div>
        ) : (
          <form onSubmit={event => { event.preventDefault(); void send() }} noValidate aria-label="Daily reminder" {...ignore}>
            <h2 id={titleId} className="text-lg font-semibold tracking-tight">Keep your streak going</h2>
            <p className="mt-1 text-balance text-sm text-neutral-500 dark:text-neutral-400">We’ll email you at 8 AM if you haven’t played.</p>
            <input
              type="email"
              name="setgame-email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              {...ignore}
              value={email}
              onChange={event => { setEmail(event.target.value); setError(null) }}
              placeholder="Email"
              aria-label="Email"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
              className={`email-field mt-4 min-h-11 w-full rounded-full border bg-white px-4 text-center text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none dark:bg-neutral-900 dark:text-neutral-100 ${
                error ? 'border-rose-400 focus:border-rose-500 dark:border-rose-500' : 'border-neutral-300 focus:border-neutral-500 dark:border-neutral-600 dark:focus:border-neutral-400'
              }`}
            />
            {error && <p id={errorId} role="alert" className="mt-1.5 text-xs text-rose-700 dark:text-rose-300">{ERRORS[error]}</p>}
            <button type="submit" disabled={step === 'sending'} className={`${primaryButton} mt-3 w-full cursor-pointer`}>
              {step === 'sending' ? 'Sending…' : 'Remind me'}
            </button>
            <button type="button" onClick={() => close('not_now')} className={`${quietButton} mt-1`}>Not now</button>
          </form>
        )}
      </div>
    </dialog>
  )
}

export default ReminderPrompt
