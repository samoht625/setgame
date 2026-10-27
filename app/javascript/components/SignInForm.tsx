import React, { useId, useState } from 'react'
import { EMAIL_PATTERN, requestSignIn, type SignInRequest } from '../lib/account'
import { track } from '../lib/analytics'
import { primaryButton, secondaryButton } from '../lib/buttons'
import { DEFAULT_REMINDER_MINUTES } from '../lib/reminder'
import TimeSelect from './TimeSelect'

interface SignInFormProps {
  /** Where the form sits, for analytics. */
  source: 'card' | 'menu'
  /** The quieter outlined button (result cards). */
  quiet?: boolean
  autoFocus?: boolean
  /** Also turn on the reminder email (result cards): adds the time picker. */
  reminder?: boolean
}

const MESSAGES: Record<Exclude<SignInRequest, 'sent'>, string> = {
  invalid_email: 'That doesn’t look like an email.',
  rate_limited: 'Too many tries. Try again in a bit.',
  failed: 'Couldn’t send. Try again.'
}

/** An email field and a button that emails a one-tap sign-in link. Email only: no password, so it isn't a login form to password managers. */
const SignInForm: React.FC<SignInFormProps> = ({ source, quiet = false, autoFocus = false, reminder = false }) => {
  const [email, setEmail] = useState('')
  const [minutes, setMinutes] = useState(DEFAULT_REMINDER_MINUTES)
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | Exclude<SignInRequest, 'sent'>>('idle')
  const messageId = useId()

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const value = email.trim()
    if (!EMAIL_PATTERN.test(value)) return setState('invalid_email')
    setState('sending')
    const outcome = await requestSignIn(value, reminder ? minutes : undefined)
    setState(outcome)
    track('sign_in_request', { source, outcome, reminder })
  }

  if (state === 'sent') {
    return (
      <p role="status" className="text-sm text-neutral-700 dark:text-neutral-200">
        {reminder ? 'Check your email to turn it on.' : 'Check your email for a sign-in link.'}
      </p>
    )
  }

  const message = state === 'idle' || state === 'sending' ? null : MESSAGES[state]

  return (
    <form onSubmit={submit} noValidate aria-label="Sign in by email" data-form-type="other" data-1p-ignore data-lpignore="true" data-bwignore="true">
      {reminder && <ReminderLine minutes={minutes} onChange={setMinutes} />}
      <div className="flex min-w-0 items-center gap-1.5">
        <input
          type="email"
          name="setgame-email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          autoFocus={autoFocus}
          data-1p-ignore
          data-lpignore="true"
          data-bwignore="true"
          data-form-type="other"
          value={email}
          onChange={event => { setEmail(event.target.value); if (state !== 'sending') setState('idle') }}
          placeholder="Email"
          aria-label="Email"
          aria-invalid={state === 'invalid_email' || undefined}
          aria-describedby={message ? messageId : undefined}
          className="min-h-11 min-w-0 flex-1 rounded-full border border-neutral-300 bg-white px-4 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-500 focus:outline-none dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100"
        />
        <button type="submit" disabled={state === 'sending' || email.trim() === ''} className={`${quiet ? secondaryButton : primaryButton} shrink-0`}>
          {state === 'sending' ? 'Sending…' : reminder ? 'Remind me' : 'Send link'}
        </button>
      </div>
      {message && <p id={messageId} role="status" className="mt-1.5 text-xs text-rose-700 dark:text-rose-300">{message}</p>}
    </form>
  )
}

/** "Email me at [8:00 AM] if I haven't played" */
export const ReminderLine: React.FC<{ minutes: number; onChange: (minutes: number) => void }> = ({ minutes, onChange }) => (
  <p className="mb-2 text-xs leading-6 text-neutral-500 dark:text-neutral-400">
    Email me at <TimeSelect value={minutes} onChange={onChange} size="xs" /> if I haven’t played
  </p>
)

export default SignInForm
