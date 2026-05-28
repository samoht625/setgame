import React from 'react'

interface ToastProps {
  message: string
  type: 'success' | 'error' | 'info'
  onClose: () => void
}

const Toast: React.FC<ToastProps> = ({ message, type, onClose }) => {
  const dotColor = type === 'error' ? 'bg-rose-500' : 'bg-emerald-500'

  return (
    <div className="fixed bottom-safe-8 left-1/2 transform -translate-x-1/2 bg-white/90 backdrop-blur-md text-neutral-800 text-sm pl-4 pr-3 py-2.5 rounded-full border border-neutral-200/80 shadow-[0_8px_30px_rgba(0,0,0,0.08)] z-50 animate-fade-in">
      <div className="flex items-center gap-3">
        <span className={`inline-block w-1.5 h-1.5 rounded-full ${dotColor}`} />
        <span className="font-medium">{message}</span>
        <button
          onClick={onClose}
          className="ml-1 w-5 h-5 flex items-center justify-center rounded-full text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
    </div>
  )
}

export default Toast

