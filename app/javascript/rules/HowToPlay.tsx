import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import RulesDemo from './RulesDemo'

const OPEN_EVENT = 'setgame:how-to-play'

export function openHowToPlay(): void {
  window.dispatchEvent(new Event(OPEN_EVENT))
}

/**
 * Drives the server-rendered How to play dialog (its text is in the page for
 * search engines) and adds the animated example set to it.
 */
const HowToPlay: React.FC = () => {
  const [openCount, setOpenCount] = useState(0)
  const [open, setOpen] = useState(false)
  const [root, setRoot] = useState<HTMLElement | null>(null)

  useEffect(() => {
    const dialog = document.getElementById('how-to-play') as HTMLDialogElement | null
    setRoot(document.getElementById('rules-demo-root'))
    if (!dialog) return
    const onOpen = () => {
      if (!dialog.open) dialog.showModal()
      setOpen(true)
      setOpenCount(count => count + 1)
    }
    const onClose = () => setOpen(false)
    const onClick = (event: MouseEvent) => {
      if (event.target === dialog) dialog.close()
    }
    window.addEventListener(OPEN_EVENT, onOpen)
    dialog.addEventListener('close', onClose)
    dialog.addEventListener('click', onClick)
    return () => {
      window.removeEventListener(OPEN_EVENT, onOpen)
      dialog.removeEventListener('close', onClose)
      dialog.removeEventListener('click', onClick)
    }
  }, [])

  return root && open ? createPortal(<RulesDemo key={openCount} step="set" />, root) : null
}

export default HowToPlay
