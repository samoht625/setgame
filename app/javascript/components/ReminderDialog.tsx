import React, { useEffect, useRef, useState } from 'react'
import TimeSelect from './TimeSelect'
import { getReminder, saveReminder, DEFAULT_REMINDER_MINUTES } from '../lib/reminder'
import { primaryButton, secondaryButton } from '../lib/buttons'

const OPEN_EVENT = 'setgame:reminder-settings'

export function openReminderDialog(): void {
  window.dispatchEvent(new Event(OPEN_EVENT))
}

/** "Reminder" from the header menu (signed in): on/off and the time. */
const ReminderDialog: React.FC = () => {
  const ref = useRef<HTMLDialogElement | null>(null)
  const [openCount, setOpenCount] = useState(0)
  const [enabled, setEnabled] = useState(false)
  const [minutes, setMinutes] = useState(DEFAULT_REMINDER_MINUTES)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const onOpen = () => {
      const current = getReminder()
      setEnabled(current?.enabled ?? false)
      setMinutes(current?.minutes ?? DEFAULT_REMINDER_MINUTES)
      setFailed(false)
      setOpenCount(count => count + 1)
      if (ref.current && !ref.current.open) ref.current.showModal()
    }
    window.addEventListener(OPEN_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_EVENT, onOpen)
  }, [])

  const close = () => ref.current?.close()
  const save = async () => {
    setSaving(true)
    const ok = await saveReminder({ enabled, minutes })
    setSaving(false)
    if (ok) close()
    else setFailed(true)
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby="reminder-dialog-title"
      onClick={event => { if (event.target === ref.current) close() }}
      className="m-auto w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-neutral-200 bg-white p-0 text-neutral-900 shadow-xl backdrop:bg-black/40 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
    >
      {openCount > 0 && (
        <div className="p-5">
          <h2 id="reminder-dialog-title" className="text-base font-semibold">Reminder email</h2>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">Only on days you haven’t played.</p>
          <div className="mt-4 flex items-center justify-between gap-3">
            <label htmlFor="reminder-enabled" className="text-sm">Email me at</label>
            <div className="flex items-center gap-2">
              <TimeSelect value={minutes} onChange={setMinutes} disabled={!enabled} />
              <button
                id="reminder-enabled"
                type="button"
                role="switch"
                aria-checked={enabled}
                aria-label="Reminder email"
                onClick={() => setEnabled(value => !value)}
                className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${enabled ? 'bg-emerald-500' : 'bg-neutral-300 dark:bg-neutral-600'}`}
              >
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${enabled ? 'left-[1.125rem]' : 'left-0.5'}`} />
              </button>
            </div>
          </div>
          {failed && <p role="status" className="mt-2 text-xs text-rose-700 dark:text-rose-300">Couldn’t save. Try again.</p>}
          <div className="mt-5 flex gap-2">
            <button type="button" onClick={close} className={`${secondaryButton} flex-1`}>Cancel</button>
            <button type="button" onClick={() => void save()} disabled={saving} className={`${primaryButton} flex-1`}>Save</button>
          </div>
        </div>
      )}
    </dialog>
  )
}

export default ReminderDialog
