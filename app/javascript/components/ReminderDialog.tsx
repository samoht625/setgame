import React, { useEffect, useRef, useState } from 'react'
import TimeSelect from './TimeSelect'
import { CloseIcon } from './Hud'
import { getReminder, saveReminder, DEFAULT_REMINDER_MINUTES, type ReminderSetting } from '../lib/reminder'
import { primaryButtonSmall, secondaryButtonSmall } from '../lib/buttons'

const OPEN_EVENT = 'setgame:reminder-settings'

export function openReminderDialog(): void {
  window.dispatchEvent(new Event(OPEN_EVENT))
}

/** "Reminder" from the header menu (signed in). Every change saves as it's made. */
const ReminderDialog: React.FC = () => {
  const ref = useRef<HTMLDialogElement | null>(null)
  const [open, setOpen] = useState(false)
  const [setting, setSetting] = useState<ReminderSetting>({ enabled: false, minutes: DEFAULT_REMINDER_MINUTES })
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const onOpen = () => {
      setSetting(getReminder() ?? { enabled: false, minutes: DEFAULT_REMINDER_MINUTES })
      setFailed(false)
      setOpen(true)
      if (ref.current && !ref.current.open) ref.current.showModal()
    }
    window.addEventListener(OPEN_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_EVENT, onOpen)
  }, [])

  const close = () => ref.current?.close()
  const apply = async (next: ReminderSetting) => {
    const previous = setting
    setSetting(next)
    setSaving(true)
    setFailed(false)
    const ok = await saveReminder(next)
    setSaving(false)
    if (!ok) {
      setSetting(previous)
      setFailed(true)
    }
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby="reminder-dialog-title"
      onClose={() => setOpen(false)}
      onClick={event => { if (event.target === ref.current) close() }}
      className="m-auto w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-neutral-200 bg-white p-0 text-neutral-900 shadow-xl backdrop:bg-black/40 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
    >
      {open && (
        <div className="relative p-5">
          <h2 id="reminder-dialog-title" className="pr-8 text-base font-semibold">
            Daily reminder
            <span className="ml-1.5 text-sm font-normal text-neutral-400 dark:text-neutral-500">{setting.enabled ? 'On' : 'Off'}</span>
          </h2>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
          >
            <CloseIcon />
          </button>
          <p className={`mt-2 text-balance text-sm leading-7 transition-colors ${setting.enabled ? 'text-neutral-700 dark:text-neutral-200' : 'text-neutral-500 dark:text-neutral-400'}`}>
            Email me at{' '}
            <TimeSelect
              value={setting.minutes}
              disabled={saving}
              onChange={minutes => (setting.enabled ? void apply({ ...setting, minutes }) : setSetting({ ...setting, minutes }))}
            />
            {' '}if I haven’t played.
          </p>
          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              disabled={saving}
              onClick={() => void apply({ ...setting, enabled: !setting.enabled })}
              className={setting.enabled ? secondaryButtonSmall : primaryButtonSmall}
            >
              {setting.enabled ? 'Turn off' : 'Turn on'}
            </button>
            {failed && <p role="status" className="text-xs text-rose-700 dark:text-rose-300">Couldn’t save. Try again.</p>}
          </div>
        </div>
      )}
    </dialog>
  )
}

export default ReminderDialog
