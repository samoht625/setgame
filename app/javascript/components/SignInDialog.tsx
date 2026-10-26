import React, { useEffect, useRef, useState } from 'react'
import SignInForm from './SignInForm'
import { signOut } from '../lib/account'
import { signedInEmail } from '../lib/player_id'
import { secondaryButton } from '../lib/buttons'

const OPEN_EVENT = 'setgame:sign-in'

export function openSignInDialog(): void {
  window.dispatchEvent(new Event(OPEN_EVENT))
}

/** "Sign in" from the header menu, or the signed-in email and Sign out. */
const SignInDialog: React.FC = () => {
  const ref = useRef<HTMLDialogElement | null>(null)
  const [openCount, setOpenCount] = useState(0)
  const [signingOut, setSigningOut] = useState(false)
  const email = signedInEmail()

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
      aria-labelledby="sign-in-dialog-title"
      onClick={event => { if (event.target === ref.current) close() }}
      className="m-auto w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-neutral-200 bg-white p-0 text-neutral-900 shadow-xl backdrop:bg-black/40 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
    >
      {openCount > 0 && (
        <div className="p-5">
          {email ? (
            <>
              <h2 id="sign-in-dialog-title" className="text-base font-semibold">Signed in</h2>
              <p className="mt-1 break-all text-sm text-neutral-600 dark:text-neutral-300">{email}</p>
              <div className="mt-4 flex gap-2">
                <button type="button" onClick={close} className={`${secondaryButton} flex-1`}>Done</button>
                <button
                  type="button"
                  disabled={signingOut}
                  onClick={async () => { setSigningOut(true); if (!(await signOut())) setSigningOut(false) }}
                  className={`${secondaryButton} flex-1`}
                >
                  Sign out
                </button>
              </div>
            </>
          ) : (
            <>
              <h2 id="sign-in-dialog-title" className="text-base font-semibold">Sign in</h2>
              <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">Keep your streak and times on any device.</p>
              <div className="mt-3">
                <SignInForm key={openCount} source="menu" autoFocus />
              </div>
            </>
          )}
        </div>
      )}
    </dialog>
  )
}

export default SignInDialog
