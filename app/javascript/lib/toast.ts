// A small app-wide toast. showToast() shows one now; toastAfterReload() keeps
// one for the next page load (sign-out reloads the page).
const EVENT = 'setgame:toast'
const PENDING_KEY = 'setgame_pending_toast'

export function showToast(text: string): void {
  window.dispatchEvent(new CustomEvent<string>(EVENT, { detail: text }))
}

export function onToast(listener: (text: string) => void): () => void {
  const handler = (event: Event) => listener((event as CustomEvent<string>).detail)
  window.addEventListener(EVENT, handler)
  return () => window.removeEventListener(EVENT, handler)
}

export function toastAfterReload(text: string): void {
  try { sessionStorage.setItem(PENDING_KEY, text) } catch { /* storage off: no toast */ }
}

export function takePendingToast(): string | null {
  try {
    const text = sessionStorage.getItem(PENDING_KEY)
    sessionStorage.removeItem(PENDING_KEY)
    return text
  } catch {
    return null
  }
}
