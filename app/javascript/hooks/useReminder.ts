import { useEffect, useState } from 'react'
import { getReminder, onReminderChange, type ReminderSetting } from '../lib/reminder'

/** The signed-in account's reminder setting, kept current as it's changed. */
export function useReminder(): ReminderSetting | null {
  const [setting, setSetting] = useState(getReminder)
  useEffect(() => onReminderChange(setSetting), [])
  return setting
}
