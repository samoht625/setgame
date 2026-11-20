import { useCallback, useEffect, useRef, useState } from 'react'
import type { ToastMessage, ToastType } from '../components/Toast'

const EMPTY_CARDS: number[] = []

/**
 * Shared toast notification and wrong-set rejection flash timers.
 * Keeps `rejectedCards` referentially stable when idle so memoized boards do
 * not re-render unnecessarily.
 */
export function useFeedback() {
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const [rejectedCards, setRejectedCards] = useState<number[]>(EMPTY_CARDS)
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rejectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showToast = useCallback((text: string, type: ToastType = 'success') => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current)
    setToast({ text, type })
    toastTimeoutRef.current = setTimeout(() => {
      toastTimeoutRef.current = null
      setToast(null)
    }, 2500)
  }, [])

  const dismissToast = useCallback(() => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current)
      toastTimeoutRef.current = null
    }
    setToast(null)
  }, [])

  const flashRejection = useCallback((cards: number[]) => {
    if (rejectTimeoutRef.current) clearTimeout(rejectTimeoutRef.current)
    setRejectedCards(cards)
    rejectTimeoutRef.current = setTimeout(() => {
      rejectTimeoutRef.current = null
      setRejectedCards(EMPTY_CARDS)
    }, 650)
  }, [])

  const clearRejection = useCallback(() => {
    if (rejectTimeoutRef.current) {
      clearTimeout(rejectTimeoutRef.current)
      rejectTimeoutRef.current = null
    }
    setRejectedCards(EMPTY_CARDS)
  }, [])

  useEffect(() => () => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current)
    if (rejectTimeoutRef.current) clearTimeout(rejectTimeoutRef.current)
  }, [])

  return {
    toast,
    rejectedCards,
    showToast,
    dismissToast,
    flashRejection,
    clearRejection
  }
}
