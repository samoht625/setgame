import React, { useEffect, useId, useRef, useState } from 'react'
import { NAME_HINT, NAME_MAX_LENGTH, cleanName } from '../lib/player_name'

interface NameEditorProps {
  initial: string
  /** Resolves false when the name couldn't be saved (e.g. offline). */
  onSave: (name: string) => Promise<boolean> | boolean
  onCancel: () => void
  /** Keeps the field and button in one tight row (leaderboard rows). */
  compact?: boolean
}

/** A name field with Save: Enter saves, Escape cancels. */
const NameEditor: React.FC<NameEditorProps> = ({ initial, onSave, onCancel, compact = false }) => {
  const [value, setValue] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const hintId = useId()
  const cleaned = cleanName(value)
  const invalid = cleaned === null
  const canSave = !saving && Boolean(cleaned)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!cleaned || saving) return
    setSaving(true)
    setFailed(false)
    const ok = await onSave(cleaned)
    setSaving(false)
    if (!ok) setFailed(true)
  }

  const message = invalid ? NAME_HINT : failed ? 'Couldn’t save. Try again.' : null

  return (
    <form onSubmit={submit} className="min-w-0 flex-1">
      <div className="flex min-w-0 items-center gap-1.5">
        <input
          ref={inputRef}
          value={value}
          onChange={event => { setValue(event.target.value); setFailed(false) }}
          onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onCancel() } }}
          aria-label="Your name"
          aria-invalid={invalid || undefined}
          aria-describedby={message ? hintId : undefined}
          placeholder="Your name"
          maxLength={NAME_MAX_LENGTH}
          autoComplete="nickname"
          enterKeyHint="done"
          // 16px text so phones don't zoom in on focus.
          className={`min-w-0 flex-1 rounded-md border bg-white px-2 text-base text-neutral-900 focus:outline-none dark:bg-neutral-800 dark:text-neutral-100 ${
            compact ? 'h-8' : 'h-10'
          } ${invalid ? 'border-rose-400 focus:border-rose-500' : 'border-neutral-300 focus:border-neutral-500 dark:border-neutral-600 dark:focus:border-neutral-400'}`}
        />
        <button
          type="submit"
          disabled={!canSave}
          className={`shrink-0 rounded-md bg-neutral-900 px-3 text-sm font-semibold text-white transition-colors hover:bg-neutral-700 disabled:opacity-40 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300 ${
            compact ? 'h-8' : 'h-10'
          }`}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
      {message && (
        <p id={hintId} role="status" className={`mt-1 text-left text-[11px] ${invalid || failed ? 'text-rose-700 dark:text-rose-300' : ''}`}>
          {message}
        </p>
      )}
    </form>
  )
}

export default NameEditor
