import React, { useEffect, useRef, useState } from 'react'
import Toast from './Toast'
import { onToast, takePendingToast } from '../lib/toast'

/** Brief confirmations ("Signed in as …", "Signed out") at the bottom of the screen. */
const AppToast: React.FC = () => {
  const [text, setText] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const show = (next: string) => {
      setText(next)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setText(null), 3000)
    }
    const pending = takePendingToast()
    if (pending) show(pending)
    const off = onToast(show)
    return () => { off(); if (timer.current) clearTimeout(timer.current) }
  }, [])

  if (!text) return null
  return <Toast message={{ text, type: 'success' }} onClose={() => setText(null)} />
}

export default AppToast
