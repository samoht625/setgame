import React, { useEffect, useId, useRef } from 'react'
import { CloseIcon } from './Hud'

interface ResultDialogProps {
  open: boolean
  onClose: () => void
  /** Small heading at the top; it also names the dialog. */
  label: string
  /** Buttons pinned below the content, so they stay in reach when it scrolls. */
  actions: React.ReactNode
  /** Toasts must render inside the dialog, or they sit under its backdrop. */
  toast?: React.ReactNode
  children: React.ReactNode
}

/**
 * The end-of-game surface: a small modal with the result, the leaderboard and
 * what to do next. It closes with its close button, Escape or a click outside.
 */
const ResultDialog: React.FC<ResultDialogProps> = ({ open, onClose, label, actions, toast, children }) => {
  const dialogRef = useRef<HTMLDialogElement | null>(null)
  const labelId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    else if (!open && dialog.open) dialog.close()
  }, [open])

  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [open])

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={labelId}
      onCancel={event => {
        event.preventDefault()
        onClose()
      }}
      onClose={() => {
        if (open) onClose()
      }}
      onClick={event => {
        if (event.target === event.currentTarget) onClose()
      }}
      // Escape belongs to the dialog; don't let it also close the side panel behind it.
      onKeyDown={event => {
        if (event.key === 'Escape') event.stopPropagation()
      }}
      className="fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none items-center justify-center overflow-hidden border-0 bg-transparent p-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] open:flex backdrop:bg-neutral-900/40 backdrop:backdrop-blur-[2px] sm:p-6 dark:backdrop:bg-black/60"
    >
      {open && (
        <>
          <div className="animate-dialog-in relative flex max-h-full w-full max-w-sm flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white text-center shadow-2xl dark:border-neutral-700 dark:bg-neutral-900">
            <div className="px-12 pt-4">
              <h2 id={labelId} className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">{label}</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
            >
              <CloseIcon />
            </button>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4">{children}</div>
            <div className="border-t border-neutral-100 px-5 py-3 dark:border-neutral-800">{actions}</div>
          </div>
          {toast}
        </>
      )}
    </dialog>
  )
}

export default ResultDialog
