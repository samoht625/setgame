import { useEffect, useRef } from 'react'

/**
 * Manages presence heartbeats for an ActionCable/GameChannel subscription.
 * Sends heartbeats only when the document is visible and the window is focused,
 * and only while `isConnected` is true.
 */
export function useHeartbeat(subscriptionRef: React.MutableRefObject<any>, isConnected: boolean) {
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const isConnectedRef = useRef<boolean>(isConnected)

  const HEARTBEAT_INTERVAL_MS = 5000

  useEffect(() => {
    isConnectedRef.current = isConnected
  }, [isConnected])

  useEffect(() => {
    const isTabActive = (): boolean => {
      if (typeof document === 'undefined') return true
      // Consider active only when visible and focused
      return document.visibilityState === 'visible' && typeof document.hasFocus === 'function' && document.hasFocus()
    }

    const sendHeartbeat = () => {
      if (!isConnectedRef.current) return
      const sub = subscriptionRef.current
      if (!sub) return
      try {
        sub.perform('heartbeat', {})
      } catch (_) {
        // ignore perform errors; will retry on next tick
      }
    }

    const stopHeartbeat = () => {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current)
        heartbeatIntervalRef.current = null
      }
    }

    const startHeartbeat = () => {
      // prevent duplicate intervals
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current)
        heartbeatIntervalRef.current = null
      }
      if (!isConnectedRef.current) return
      if (!isTabActive()) return
      heartbeatIntervalRef.current = setInterval(() => {
        if (isConnectedRef.current && isTabActive()) {
          sendHeartbeat()
        }
      }, HEARTBEAT_INTERVAL_MS)
    }

    const onVisibilityChange = () => {
      if (isConnectedRef.current && isTabActive()) {
        sendHeartbeat()
        startHeartbeat()
      } else {
        stopHeartbeat()
      }
    }

    const onFocus = () => {
      if (isConnectedRef.current && isTabActive()) {
        sendHeartbeat()
        startHeartbeat()
      }
    }

    const onBlur = () => {
      stopHeartbeat()
    }

    // When we become connected, kick off a heartbeat and the interval if active
    if (isConnectedRef.current && isTabActive()) {
      sendHeartbeat()
      startHeartbeat()
    } else {
      stopHeartbeat()
    }

    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibilityChange)
      window.addEventListener('focus', onFocus)
      window.addEventListener('blur', onBlur)
    }

    return () => {
      if (typeof window !== 'undefined' && typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange)
        window.removeEventListener('focus', onFocus)
        window.removeEventListener('blur', onBlur)
      }
      stopHeartbeat()
    }
    // Intentionally depend only on isConnected; subscriptionRef is a ref container
  }, [subscriptionRef, isConnected])
}


