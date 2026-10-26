import React, { useState } from 'react'
import { ReminderLine } from './SignInForm'
import { saveReminder, reminderLabel, DEFAULT_REMINDER_MINUTES } from '../lib/reminder'
import { secondaryButton } from '../lib/buttons'
import { track } from '../lib/analytics'

/** On a result card for a signed-in player with the reminder off: the time and Turn on. */
const ReminderOffer: React.FC<{ initialMinutes?: number }> = ({ initialMinutes = DEFAULT_REMINDER_MINUTES }) => {
  const [minutes, setMinutes] = useState(initialMinutes)
  const [state, setState] = useState<'idle' | 'saving' | 'on' | 'failed'>('idle')

  if (state === 'on') {
    return <p role="status" className="text-sm text-neutral-700 dark:text-neutral-200">Reminder on for {reminderLabel(minutes)}.</p>
  }

  return (
    <div>
      <ReminderLine minutes={minutes} onChange={setMinutes} />
      <button
        type="button"
        disabled={state === 'saving'}
        onClick={async () => {
          setState('saving')
          const ok = await saveReminder({ enabled: true, minutes })
          setState(ok ? 'on' : 'failed')
          track('reminder_on', { source: 'card', ok })
        }}
        className={`${secondaryButton} w-full`}
      >
        Turn on
      </button>
      {state === 'failed' && <p role="status" className="mt-1.5 text-xs text-rose-700 dark:text-rose-300">Couldn’t save. Try again.</p>}
    </div>
  )
}

export default ReminderOffer
