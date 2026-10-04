/**
 * Calls `callback` once what was just rendered has been painted on screen.
 * Animation frames don't run in background tabs, so this also waits until the
 * page is actually being looked at. Returns a function that cancels the call.
 */
export function afterNextPaint(callback: () => void): () => void {
  let second = 0
  const first = requestAnimationFrame(() => {
    second = requestAnimationFrame(() => callback())
  })
  return () => {
    cancelAnimationFrame(first)
    cancelAnimationFrame(second)
  }
}
