import React, { useEffect, useRef, useState } from 'react'
import NameEditor from './NameEditor'
import { getSavedName, saveName } from '../lib/player_name'

const OPEN_EVENT = 'setgame:edit-name'

export function openNameDialog(): void {
  window.dispatchEvent(new Event(OPEN_EVENT))
}

/** "Your name" from the header menu: the one name used on every leaderboard. */
const NameDialog: React.FC = () => {
  const ref = useRef<HTMLDialogElement | null>(null)
  const [openCount, setOpenCount] = useState(0)

  useEffect(() => {
    const onOpen = () => {
      setOpenCount(count => count + 1)
      if (ref.current && !ref.current.open) ref.current.showModal()
    }
    window.addEventListener(OPEN_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_EVENT, onOpen)
  }, [])

  const close = () => ref.current?.close()

  return (
    <dialog
      ref={ref}
      aria-labelledby="name-dialog-title"
      onClick={event => { if (event.target === ref.current) close() }}
      className="m-auto w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-neutral-200 bg-white p-0 text-neutral-900 shadow-xl backdrop:bg-black/40 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
    >
      {openCount > 0 && (
        <div className="p-5">
          <h2 id="name-dialog-title" className="text-base font-semibold">Your name</h2>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">Shown next to your times on the leaderboards.</p>
          <div className="mt-3 flex">
            <NameEditor
              key={openCount}
              initial={getSavedName() ?? ''}
              onSave={name => { saveName(name); close(); return true }}
              onCancel={close}
            />
          </div>
          <button type="button" onClick={close} className="mt-3 min-h-9 text-xs font-medium text-neutral-600 underline underline-offset-4 dark:text-neutral-300">
            Cancel
          </button>
        </div>
      )}
    </dialog>
  )
}

export default NameDialog
