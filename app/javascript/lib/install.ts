import { track, trackWhenReady } from './analytics'
import { dailyDate } from './daily'

const STORAGE_KEY = 'setgame_install_prompt_v1'
/** Offered from the second day a daily game is finished... */
export const INSTALL_AFTER_DAYS = 2
/** ...not again for a week after Not now... */
export const INSTALL_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000
/** ...and never after it has been turned down twice. */
export const INSTALL_MAX_DISMISSALS = 2

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

type Memory = { days?: string[]; shownOn?: string; closedAt?: number; dismissals?: number; done?: boolean }

export type InstallKind = 'prompt' | 'ios'

let deferred: InstallPromptEvent | null = null

export function installMemory(): Memory {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as Memory
  } catch {
    return {}
  }
}

export function rememberInstall(update: Memory): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...installMemory(), ...update }))
  } catch {
    // Storage unavailable: it just offers again next time.
  }
}

export function isStandalone(): boolean {
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
}

/** Safari on an iPhone or iPad, where Add to Home Screen is in the Share menu. In-app browsers can't add one. */
function isIosSafari(): boolean {
  const ua = navigator.userAgent
  const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  return ios && /Safari\//.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua)
}

/** Chrome's install prompt is kept for our own sheet; launches from the home screen are counted. */
export function listenForInstall(): void {
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault()
    deferred = event as InstallPromptEvent
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    rememberInstall({ done: true })
    track('app_installed')
  })
  if (isStandalone()) trackWhenReady('app_open', { display: 'standalone' })
}

/** How this browser can put Set on the home screen, if it can and hasn't. */
export function installKind(): InstallKind | null {
  if (isStandalone()) return null
  if (deferred) return 'prompt'
  return isIosSafari() ? 'ios' : null
}

/** Records today as a day a daily game was finished. */
export function noteFinishDay(): void {
  const today = dailyDate()
  const days = installMemory().days ?? []
  if (!days.includes(today)) rememberInstall({ days: [...days, today].slice(-5) })
}

/** On a phone that can install, from the second day with a finish, once a day, with a cooldown after Not now. */
export function installDue(): InstallKind | null {
  const kind = installKind()
  if (!kind) return null
  const memory = installMemory()
  if (memory.done || (memory.dismissals ?? 0) >= INSTALL_MAX_DISMISSALS) return null
  if ((memory.days?.length ?? 0) < INSTALL_AFTER_DAYS || memory.shownOn === dailyDate()) return null
  if (memory.closedAt && Date.now() - memory.closedAt < INSTALL_COOLDOWN_MS) return null
  return kind
}

/** Chrome's own install dialog; resolves to whether the player accepted. */
export async function promptInstall(): Promise<boolean> {
  const event = deferred
  if (!event) return false
  deferred = null
  await event.prompt()
  return (await event.userChoice).outcome === 'accepted'
}
