import React, { useEffect, useId, useRef, useState } from 'react'
import { CloseIcon } from './Hud'
import TimeSelect from './TimeSelect'
import { EMAIL_PATTERN, requestSignIn, type SignInRequest } from '../lib/account'
import { track } from '../lib/analytics'
import { primaryButton, secondaryButtonSmall } from '../lib/buttons'
import { DEFAULT_REMINDER_MINUTES, reminderLabel } from '../lib/reminder'

const OPEN_EVENT = 'setgame:sign-in'
const RESEND_SECONDS = 30

type OpenOptions = { reminder?: boolean; source?: 'menu' | 'card' | 'expired' }

/** Opens the sign-in dialog; with reminder, signing in also turns on the reminder email. */
export function openSignInDialog(options: OpenOptions = {}): void {
  window.dispatchEvent(new CustomEvent<OpenOptions>(OPEN_EVENT, { detail: options }))
}

const ERRORS: Record<Exclude<SignInRequest, 'sent'> | 'empty', string> = {
  empty: 'Enter your email.',
  invalid_email: 'That doesn’t look like an email.',
  rate_limited: 'Too many tries. Try again in a few minutes.',
  failed: 'Couldn’t send the email. Try again.'
}

/**
 * Email-only sign-in: one field, a link by email, then "Check your email".
 * No password field, so password managers don't treat it as a login form.
 */
const SignInDialog: React.FC = () => {
  const ref = useRef<HTMLDialogElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [options, setOptions] = useState<OpenOptions | null>(null)
  const [email, setEmail] = useState('')
  const [minutes, setMinutes] = useState(DEFAULT_REMINDER_MINUTES)
  const [step, setStep] = useState<'form' | 'sent'>('form')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<keyof typeof ERRORS | null>(null)
  const [cooldown, setCooldown] = useState(0)
  const [resent, setResent] = useState(false)
  const titleId = useId()
  const errorId = useId()

  useEffect(() => {
    const onOpen = (event: Event) => {
      setOptions((event as CustomEvent<OpenOptions>).detail ?? {})
      setStep('form')
      setError(null)
      setSending(false)
      setResent(false)
      if (ref.current && !ref.current.open) ref.current.showModal()
    }
    window.addEventListener(OPEN_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_EVENT, onOpen)
  }, [])

  // Focus the field whenever the form shows (on open, and after "Use a different email").
  useEffect(() => {
    if (options && step === 'form') inputRef.current?.focus()
  }, [options, step])

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setTimeout(() => setCooldown(value => value - 1), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])

  const close = () => ref.current?.close()

  const send = async (resend = false): Promise<void> => {
    const value = email.trim()
    if (value === '') return setError('empty')
    if (!EMAIL_PATTERN.test(value)) return setError('invalid_email')
    setSending(true)
    setError(null)
    const outcome = await requestSignIn(value, options?.reminder ? minutes : undefined)
    setSending(false)
    track('sign_in_request', { source: options?.source ?? 'menu', outcome, reminder: Boolean(options?.reminder), resend })
    if (outcome === 'sent') {
      setStep('sent')
      setCooldown(RESEND_SECONDS)
      setResent(resend)
    } else if (resend) {
      setResent(false)
      setError(outcome)
    } else {
      setError(outcome)
    }
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={() => setOptions(null)}
      onClick={event => { if (event.target === ref.current) close() }}
      className="m-auto w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-neutral-200 bg-white p-0 text-neutral-900 shadow-xl backdrop:bg-black/40 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
    >
      {options && (
        <div className="relative p-5">
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
          >
            <CloseIcon />
          </button>
          {step === 'form' ? (
            <form
              onSubmit={event => { event.preventDefault(); void send() }}
              noValidate
              aria-label="Sign in by email"
              data-form-type="other"
              data-1p-ignore
              data-lpignore="true"
              data-bwignore="true"
            >
              <h2 id={titleId} className="text-base font-semibold">{options.reminder ? 'Daily reminder' : 'Sign in'}</h2>
              {options.reminder ? (
                <p className="mt-1 text-balance text-sm leading-7 text-neutral-600 dark:text-neutral-300">
                  Email me at <TimeSelect value={minutes} onChange={setMinutes} /> if I haven’t played.
                </p>
              ) : (
                <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">Keep your streak on any device.</p>
              )}
              <input
                ref={inputRef}
                type="email"
                name="setgame-email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                data-1p-ignore
                data-lpignore="true"
                data-bwignore="true"
                data-form-type="other"
                value={email}
                onChange={event => { setEmail(event.target.value); setError(null) }}
                placeholder="you@example.com"
                aria-label="Email"
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? errorId : undefined}
                className={`email-field mt-4 min-h-11 w-full rounded-full border bg-white px-4 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none dark:bg-neutral-900 dark:text-neutral-100 ${
                  error ? 'border-rose-400 focus:border-rose-500 dark:border-rose-500' : 'border-neutral-300 focus:border-neutral-500 dark:border-neutral-600 dark:focus:border-neutral-400'
                }`}
              />
              {error && <p id={errorId} role="alert" className="mt-1.5 px-4 text-xs text-rose-700 dark:text-rose-300">{ERRORS[error]}</p>}
              <button type="submit" disabled={sending} className={`${primaryButton} mt-3 w-full`}>
                {sending ? 'Sending…' : 'Email me a link'}
              </button>
            </form>
          ) : (
            <div role="status">
              <h2 id={titleId} className="text-base font-semibold">Check your email</h2>
              <p className="mt-1 text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">
                We sent a link to <span className="break-all font-medium text-neutral-900 dark:text-neutral-100">{email.trim()}</span>.
                {options.reminder ? ` Open it to sign in and get the reminder at ${reminderLabel(minutes)}.` : ' Open it to sign in.'}
              </p>
              {error && <p role="alert" className="mt-2 text-xs text-rose-700 dark:text-rose-300">{ERRORS[error]}</p>}
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" onClick={() => { setStep('form'); setError(null) }} className={secondaryButtonSmall}>
                  Use a different email
                </button>
                <button type="button" disabled={cooldown > 0 || sending} onClick={() => void send(true)} className={secondaryButtonSmall}>
                  {sending ? 'Sending…' : cooldown > 0 ? (resent ? `Sent · resend in ${cooldown}s` : `Resend in ${cooldown}s`) : 'Resend'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </dialog>
  )
}

export default SignInDialog
