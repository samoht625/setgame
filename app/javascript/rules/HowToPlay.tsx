import React, { useEffect, useState } from 'react'
import { createPortal, flushSync } from 'react-dom'
import RulesDemo from './RulesDemo'

const OPEN_EVENT = 'setgame:how-to-play'

export function openHowToPlay(): void {
  window.dispatchEvent(new Event(OPEN_EVENT))
}

/**
 * Where focus goes back to when the dialog closes: whatever had it, or, when
 * that is a menu about to close, the button that opened the menu.
 */
function opener(): HTMLElement | null {
  const active = document.activeElement
  if (!(active instanceof HTMLElement) || active === document.body) return null
  const menu = active.closest('[role="menu"]')
  return menu?.id ? document.querySelector<HTMLElement>(`[aria-controls="${menu.id}"]`) : active
}

/**
 * Drives the server-rendered How to play dialog (its text is in the page for
 * search engines) and adds the animated example set to it. A native modal
 * dialog: focus stays inside it and Escape closes it.
 */
const HowToPlay: React.FC = () => {
  const [openCount, setOpenCount] = useState(0)
  const [open, setOpen] = useState(false)
  const [root, setRoot] = useState<HTMLElement | null>(null)

  useEffect(() => {
    const dialog = document.getElementById('how-to-play') as HTMLDialogElement | null
    setRoot(document.getElementById('rules-demo-root'))
    if (!dialog) return
    let returnTo: HTMLElement | null = null
    let locked = false
    let pageOverflow = ''
    let pressedOutside = false
    const onOpen = () => {
      if (dialog.open) return
      returnTo = opener()
      flushSync(() => {
        setOpen(true)
        setOpenCount(count => count + 1)
      })
      dialog.showModal()
      dialog.querySelector('[data-how-to-play-body]')?.scrollTo(0, 0)
      // The page behind can't be reached; don't let it scroll either.
      if (!locked) pageOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      locked = true
    }
    const onClose = () => {
      // The close event comes a moment after closing: skip it if the dialog has been opened again since.
      if (dialog.open) return
      setOpen(false)
      document.body.style.overflow = pageOverflow
      locked = false
      if (returnTo?.isConnected) returnTo.focus({ preventScroll: true })
      returnTo = null
    }
    // A click outside the panel closes it, but not a drag that began inside and ended outside.
    const onPointerDown = (event: PointerEvent) => {
      pressedOutside = event.target === dialog
    }
    const onClick = (event: MouseEvent) => {
      if (event.target === dialog && pressedOutside) dialog.close()
    }
    window.addEventListener(OPEN_EVENT, onOpen)
    dialog.addEventListener('close', onClose)
    dialog.addEventListener('pointerdown', onPointerDown)
    dialog.addEventListener('click', onClick)
    return () => {
      window.removeEventListener(OPEN_EVENT, onOpen)
      dialog.removeEventListener('close', onClose)
      dialog.removeEventListener('pointerdown', onPointerDown)
      dialog.removeEventListener('click', onClick)
      if (dialog.open) dialog.close()
    }
  }, [])

  return root && open ? createPortal(<RulesDemo key={openCount} step="set" shuffle well={false} />, root) : null
}

export default HowToPlay
