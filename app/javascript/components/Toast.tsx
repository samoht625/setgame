import React from 'react'

interface ToastProps {
  message: string
  type: 'success' | 'error' | 'info'
  onClose: () => void
}

const Toast: React.FC<ToastProps> = ({ message, type, onClose }) => {
  // Use a soft success green matching the provided reference screenshot
  const bgColor = type === 'error' ? 'bg-[rgb(244,219,218)]' : 'bg-[#d1e7dd]'
  
  return (
    <div className={`fixed bottom-8 left-1/2 transform -translate-x-1/2 ${bgColor} text-gray-900 px-6 py-3 rounded-lg shadow-lg z-50 animate-fade-in`}>
      <div className="flex items-center justify-between gap-4">
        <span>{message}</span>
        <button
          onClick={onClose}
          className="text-gray-900 hover:text-gray-700 font-bold"
        >
          ×
        </button>
      </div>
    </div>
  )
}

export default Toast

