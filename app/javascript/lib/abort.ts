/**
 * Combines a timeout with an optional parent AbortSignal without relying on
 * AbortSignal.any, which is newer than the oldest browsers the app allows
 * (Safari 16.4–17.3 and Chrome 111–115).
 *
 * Always call `cleanup()` when the operation settles so the timer and parent
 * abort listener are released.
 */
export function withTimeout(
  ms: number,
  parentSignal?: AbortSignal
): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController()

  if (parentSignal?.aborted) {
    controller.abort(parentSignal.reason)
    return { signal: controller.signal, cleanup: () => {} }
  }

  let cleaned = false
  const onParentAbort = () => {
    cleanup()
    controller.abort(parentSignal?.reason)
  }

  const timer = setTimeout(() => {
    cleanup()
    const error = typeof DOMException !== 'undefined'
      ? new DOMException('The operation timed out.', 'TimeoutError')
      : new Error('The operation timed out.')
    controller.abort(error)
  }, ms)

  const cleanup = () => {
    if (cleaned) return
    cleaned = true
    clearTimeout(timer)
    parentSignal?.removeEventListener('abort', onParentAbort)
  }

  parentSignal?.addEventListener('abort', onParentAbort, { once: true })

  return { signal: controller.signal, cleanup }
}
