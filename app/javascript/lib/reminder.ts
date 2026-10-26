import { apiFetch, headers } from './solo_api'

const CHANGE_EVENT = 'setgame:reminder'
export const DEFAULT_REMINDER_MINUTES = 480
/** Half-hourly, minutes after local midnight. Must match Reminder::TIMES. */
export const REMINDER_TIMES = Array.from({ length: 48 }, (_, i) => i * 30)

export function reminderLabel(minutes: number): string {
  const hour = Math.floor(minutes / 60)
  return `${((hour + 11) % 12) + 1}:${String(minutes % 60).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`
}

export function browserTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return undefined
  }
}

export type ReminderSetting = { enabled: boolean; minutes: number }

/** The signed-in account's reminder, from the page (see HomeController); null when signed out. */
export function getReminder(): ReminderSetting | null {
  const content = document.querySelector<HTMLMetaElement>('meta[name="setgame-reminder"]')?.content
  if (content === undefined) return null
  // "480" when on, "off:480" when off (keeping the last time chosen).
  const enabled = !content.startsWith('off')
  const minutes = Number(content.replace(/^off:?/, ''))
  return { enabled, minutes: REMINDER_TIMES.includes(minutes) && content !== 'off' ? minutes : DEFAULT_REMINDER_MINUTES }
}

function remember(setting: ReminderSetting): void {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="setgame-reminder"]')
  if (meta) meta.content = setting.enabled ? String(setting.minutes) : `off:${setting.minutes}`
  window.dispatchEvent(new CustomEvent<ReminderSetting>(CHANGE_EVENT, { detail: setting }))
}

export function onReminderChange(listener: (setting: ReminderSetting) => void): () => void {
  const handler = (event: Event) => listener((event as CustomEvent<ReminderSetting>).detail)
  window.addEventListener(CHANGE_EVENT, handler)
  return () => window.removeEventListener(CHANGE_EVENT, handler)
}

export async function saveReminder(setting: ReminderSetting): Promise<boolean> {
  try {
    const res = await apiFetch('/api/reminder', {
      method: 'PATCH',
      headers: headers(),
      credentials: 'same-origin',
      body: JSON.stringify({ enabled: setting.enabled, minutes: setting.minutes, time_zone: browserTimeZone() }),
      signal: AbortSignal.timeout(8000)
    })
    if (!res.ok) return false
    const data = await res.json()
    remember({ enabled: Boolean(data.enabled), minutes: Number(data.minutes) })
    return true
  } catch {
    return false
  }
}
