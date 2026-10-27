import React, { useEffect, useId, useRef, useState } from 'react'
import { EMAIL_PATTERN, requestSignIn, type SignInRequest } from '../lib/account'
import { track } from '../lib/analytics'
import { primaryButton, secondaryButtonSmall } from '../lib/buttons'
import { dailyDate } from '../lib/daily'
import { DEFAULT_REMINDER_MINUTES, reminderLabel } from '../lib/reminder'
import { CloseIcon } from '../components/Hud'
import TimeSelect from '../components/TimeSelect'

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

/**
 * A one-time prompt pinned to the bottom of the screen a moment after a
 * finished result shows, for signed-out players: an email and the reminder
 * time, sent as a sign-in link that turns the reminder on. It floats over the
 * page (no layout shift) and closes with Not now, the close button, Escape, a
 * tap outside or a swipe down.
 */
const ReminderPrompt: React.FC = () => {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [minutes, setMinutes] = useState(DEFAULT_REMINDER_MINUTES)
  const [step, setStep] = useState<'form' | 'sending' | 'sent'>('form')
  const [error, setError] = useState<keyof typeof ERRORS | null>(null)
  const [cooldown, setCooldown] = useState(0)
  const [resent, setResent] = useState(false)
  const [resending, setResending] = useState(false)
  const panelRef = useRef<HTMLDivElement | null>(null)
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

  // Closing it without sending (Not now, close, Escape, a tap outside, a swipe) counts as turning it down.
  const close = (how: string) => {
    remember(step === 'sent' ? { closedAt: Date.now() } : { closedAt: Date.now(), dismissals: (recall().dismissals ?? 0) + 1 })
    setOpen(false)
    track('reminder_prompt', { action: how })
  }

  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) close('outside')
    }
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close('escape') }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, step])

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
    const outcome = await requestSignIn(value, minutes)
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
    <div
      ref={panelRef}
      role="dialog"
      aria-labelledby={titleId}
      onTouchStart={event => { touchY.current = event.touches[0]?.clientY ?? null }}
      onTouchEnd={event => {
        const start = touchY.current
        touchY.current = null
        const end = event.changedTouches[0]?.clientY
        if (start !== null && end !== undefined && end - start > 48) close('swipe')
      }}
      className="animate-sheet-in fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-left sm:bottom-4 sm:left-1/2 sm:right-auto sm:w-[22rem] sm:-translate-x-1/2 sm:px-0 sm:pb-0"
    >
      <div className="relative rounded-2xl border border-neutral-200 bg-white p-4 shadow-2xl shadow-neutral-900/15 dark:border-neutral-700 dark:bg-neutral-900 dark:shadow-black/50">
        <button
          type="button"
          onClick={() => close('close')}
          aria-label="Close"
          className="absolute right-2 top-2 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
        >
          <CloseIcon />
        </button>
        {step === 'sent' ? (
          <div role="status">
            <p id={titleId} className="pr-8 text-base font-semibold text-neutral-900 dark:text-neutral-100">Check your email to confirm</p>
            <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
              We sent a link to <span className="break-all font-medium text-neutral-900 dark:text-neutral-100">{email.trim()}</span>. Open it to get the reminder at {reminderLabel(minutes)}.
            </p>
            {error && <p role="alert" className="mt-2 text-xs text-rose-700 dark:text-rose-300">{ERRORS[error]}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => { setStep('form'); setError(null) }} className={`${secondaryButtonSmall} cursor-pointer`}>
                Use a different email
              </button>
              <button type="button" disabled={cooldown > 0 || resending} onClick={() => void send(true)} className={`${secondaryButtonSmall} cursor-pointer disabled:cursor-default`}>
                {resending ? 'Sending…' : cooldown > 0 ? (resent ? `Sent · resend in ${cooldown}s` : `Resend in ${cooldown}s`) : 'Resend'}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={event => { event.preventDefault(); void send() }} noValidate aria-label="Daily reminder" {...ignore}>
            <p id={titleId} className="pr-8 text-base font-semibold text-neutral-900 dark:text-neutral-100">Keep your streak going</p>
            <p className="mt-1 text-sm leading-7 text-neutral-600 dark:text-neutral-300">
              Email at <TimeSelect value={minutes} onChange={setMinutes} size="xs" /> if you haven’t played.
            </p>
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
              placeholder="you@example.com"
              aria-label="Email"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
              className={`email-field mt-2 min-h-11 w-full rounded-full border bg-white px-4 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none dark:bg-neutral-900 dark:text-neutral-100 ${
                error ? 'border-rose-400 focus:border-rose-500 dark:border-rose-500' : 'border-neutral-300 focus:border-neutral-500 dark:border-neutral-600 dark:focus:border-neutral-400'
              }`}
            />
            {error && <p id={errorId} role="alert" className="mt-1.5 px-4 text-xs text-rose-700 dark:text-rose-300">{ERRORS[error]}</p>}
            <button type="submit" disabled={step === 'sending'} className={`${primaryButton} mt-3 w-full cursor-pointer`}>
              {step === 'sending' ? 'Sending…' : 'Remind me'}
            </button>
            <button
              type="button"
              onClick={() => close('not_now')}
              className="mt-1 min-h-10 w-full cursor-pointer rounded-full text-sm font-medium text-neutral-500 transition-colors hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
            >
              Not now
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

export default ReminderPrompt
