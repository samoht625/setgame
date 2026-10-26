import React from 'react'
import { REMINDER_TIMES, reminderLabel } from '../lib/reminder'

interface TimeSelectProps {
  value: number
  onChange: (minutes: number) => void
  label?: string
  disabled?: boolean
}

/** A half-hourly time picker in the site's pill shape. */
const TimeSelect: React.FC<TimeSelectProps> = ({ value, onChange, label = 'Reminder time', disabled = false }) => (
  <select
    aria-label={label}
    value={value}
    disabled={disabled}
    onChange={event => onChange(Number(event.target.value))}
    data-1p-ignore
    data-lpignore="true"
    data-bwignore="true"
    autoComplete="off"
    className="min-h-9 cursor-pointer rounded-full border border-neutral-300 bg-white px-3 text-xs font-medium tabular-nums text-neutral-800 focus:border-neutral-500 focus:outline-none disabled:opacity-50 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100"
  >
    {REMINDER_TIMES.map(minutes => (
      <option key={minutes} value={minutes}>{reminderLabel(minutes)}</option>
    ))}
  </select>
)

export default TimeSelect
