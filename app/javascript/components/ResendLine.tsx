import React, { useEffect, useState } from 'react'

interface ResendLineProps {
  /** Seconds until another link can be sent; 0 when it can. */
  cooldown: number
  /** Sends the link again; resolves true once it's on its way. */
  onResend: () => Promise<boolean>
  className?: string
}

/** "Didn't get it? Resend" under a sent sign-in or confirm link: muted text, a plain text button, a countdown, then "Sent" for a moment. */
const ResendLine: React.FC<ResendLineProps> = ({ cooldown, onResend, className = '' }) => {
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  useEffect(() => {
    if (!sent) return
    const timer = setTimeout(() => setSent(false), 2000)
    return () => clearTimeout(timer)
  }, [sent])

  const resend = async () => {
    setSending(true)
    const ok = await onResend()
    setSending(false)
    if (ok) setSent(true)
  }

  const waiting = sending || sent || cooldown > 0
  return (
    <p className={`flex min-h-10 items-center justify-center gap-1 text-sm text-neutral-500 dark:text-neutral-400 ${className}`}>
      <span>Didn’t get it?</span>
      <button
        type="button"
        disabled={waiting}
        onClick={() => void resend()}
        className="cursor-pointer rounded font-medium text-neutral-900 transition-colors hover:text-neutral-600 disabled:cursor-default disabled:font-normal disabled:text-neutral-400 dark:text-neutral-100 dark:hover:text-neutral-300 dark:disabled:text-neutral-500"
      >
        {sending ? 'Sending…' : sent ? 'Sent' : cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend'}
      </button>
    </p>
  )
}

export default ResendLine
