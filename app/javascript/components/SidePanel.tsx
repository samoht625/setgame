import React, { useEffect, useRef } from 'react'
import { CloseIcon } from './Hud'

interface SidePanelProps {
  open: boolean
  onClose: () => void
  title: string
  /** True when the panel sits beside the board rather than over it. */
  isDesktop: boolean
  children: React.ReactNode
}

/**
 * Where the leaderboard, players and history live. On desktop it's a slim
 * column next to the board; on phones it's a bottom sheet over the board.
 * Either way it stays out of the way until asked for.
 */
const SidePanel: React.FC<SidePanelProps> = ({ open, onClose, title, isDesktop, children }) => {
  const panelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  // The sheet covers the board on phones, so stop the page scrolling under it.
  useEffect(() => {
    if (!open || isDesktop) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [open, isDesktop])

  useEffect(() => {
    if (open && !isDesktop) panelRef.current?.focus()
  }, [open, isDesktop])

  if (!open) return null

  return (
    <>
      <div
        aria-hidden="true"
        onClick={onClose}
        className="fixed inset-0 z-30 bg-neutral-900/30 backdrop-blur-[2px] lg:hidden dark:bg-black/50"
      />
      <aside
        ref={panelRef}
        role={isDesktop ? undefined : 'dialog'}
        aria-modal={isDesktop ? undefined : true}
        aria-label={title}
        tabIndex={-1}
        className="animate-sheet-in fixed inset-x-0 bottom-0 z-40 flex max-h-[85dvh] flex-col rounded-t-2xl border border-neutral-200 bg-white shadow-2xl outline-none lg:static lg:z-auto lg:w-72 lg:max-h-none lg:shrink-0 lg:animate-none lg:rounded-2xl lg:shadow-none xl:w-80 dark:border-neutral-800 dark:bg-neutral-900"
      >
        <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-2.5 dark:border-neutral-800">
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={`Close ${title.toLowerCase()}`}
            className="-mr-2 flex h-9 w-9 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
          >
            <CloseIcon />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-3 pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)] lg:pb-4">{children}</div>
      </aside>
    </>
  )
}

export default SidePanel
