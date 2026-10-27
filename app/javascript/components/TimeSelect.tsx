import React from 'react'
import { REMINDER_TIMES, reminderLabel } from '../lib/reminder'

interface TimeSelectProps {
  value: number
  onChange: (minutes: number) => void
  label?: string
  disabled?: boolean
  /** xs for inline card copy, sm for dialogs. */
  size?: 'xs' | 'sm'
}

/**
 * A half-hourly time picker drawn as a flat neutral chip sized to its text.
 * A transparent native <select> sits on top, so phones show their own wheel
 * and keyboards work as usual.
 */
const TimeSelect: React.FC<TimeSelectProps> = ({ value, onChange, label = 'Reminder time', disabled = false, size = 'sm' }) => (
  <span
    className={`relative inline-flex items-center gap-1 rounded-md bg-neutral-100 align-middle font-medium tabular-nums text-neutral-900 transition-colors hover:bg-neutral-200 focus-within:ring-2 focus-within:ring-neutral-400 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700 ${
      size === 'xs' ? 'h-6 px-1.5 text-xs' : 'h-7 px-2 text-sm'
    } ${disabled ? 'opacity-50' : ''}`}
  >
    <span aria-hidden="true">{reminderLabel(value)}</span>
    <svg aria-hidden="true" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
      className={`text-neutral-400 dark:text-neutral-500 ${size === 'xs' ? 'h-2.5 w-2.5' : 'h-3 w-3'}`}>
      <path d="M3 4.5 6 7.5 9 4.5" />
    </svg>
    <select
      aria-label={label}
      value={value}
      disabled={disabled}
      onChange={event => onChange(Number(event.target.value))}
      data-1p-ignore
      data-lpignore="true"
      data-bwignore="true"
      data-form-type="other"
      autoComplete="off"
      className="absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0 focus:outline-none disabled:cursor-default"
    >
      {REMINDER_TIMES.map(minutes => (
        <option key={minutes} value={minutes}>{reminderLabel(minutes)}</option>
      ))}
    </select>
  </span>
)

export default TimeSelect
