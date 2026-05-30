import React from 'react'

export type ToastType = 'success' | 'error'

export interface ToastMessage {
  text: string
  type: ToastType
}

interface ToastProps {
  message: ToastMessage
  onClose: () => void
}

const Toast: React.FC<ToastProps> = ({ message, onClose }) => {
  const dotColor = message.type === 'error' ? 'bg-rose-500' : 'bg-emerald-500'

  return (
    <div
      role="status"
      className="fixed bottom-safe-8 left-1/2 z-50 -translate-x-1/2 animate-fade-in-up"
    >
      <button
        type="button"
        onClick={onClose}
        className="flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-800 shadow-lg"
      >
        <span className={`h-2 w-2 shrink-0 rounded-full ${dotColor}`} aria-hidden="true" />
        {message.text}
      </button>
    </div>
  )
}

export default Toast
