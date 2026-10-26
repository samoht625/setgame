import { headers, apiFetch } from './solo_api'
import { switchPlayer } from './player_id'
import { browserTimeZone } from './reminder'

export type SignInRequest = 'sent' | 'invalid_email' | 'rate_limited' | 'failed'

/** Emails a one-tap sign-in link. The answer never says whether the email has an account. */
/** With reminderMinutes, opening the link also turns on the reminder email at that local time. */
export async function requestSignIn(email: string, reminderMinutes?: number): Promise<SignInRequest> {
  try {
    const res = await apiFetch('/api/sign_in', {
      method: 'POST',
      headers: headers(),
      credentials: 'same-origin',
      body: JSON.stringify({
        email,
        return_to: window.location.pathname,
        time_zone: browserTimeZone(),
        reminder_minutes: reminderMinutes
      }),
      signal: AbortSignal.timeout(15000)
    })
    if (res.ok) return 'sent'
    if (res.status === 422) return 'invalid_email'
    if (res.status === 429) return 'rate_limited'
    return 'failed'
  } catch {
    return 'failed'
  }
}

/** Signs this browser out; it continues as a new anonymous player. */
export async function signOut(): Promise<boolean> {
  try {
    const res = await apiFetch('/api/sign_in', { method: 'DELETE', headers: headers(), credentials: 'same-origin' })
    if (!res.ok) return false
    const data = await res.json()
    switchPlayer(data.player_id, data.player_key, { forgetRuns: 'all' })
    window.location.reload()
    return true
  } catch {
    return false
  }
}

export const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
