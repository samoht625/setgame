import React, { createContext, useContext, useEffect, useId, useRef, useState } from 'react'

/** One action in the header's overflow menu. */
export type MenuItem = {
  label: string
  onSelect: () => void
  disabled?: boolean
  /** Shown as a small count next to the label (e.g. players online). */
  badge?: number
  /** Quiet text at the item's end (e.g. a setting's value). */
  detail?: string
  /** The badge counts people playing live (a green marker instead of a neutral pill). */
  live?: boolean
  /** A small muted second line under the label (e.g. the signed-in email under Sign out). */
  sublabel?: string
  /** A switch (Sound): rendered as a menuitemcheckbox with a toggle. */
  checked?: boolean
  /** One line on what the row does, in a tooltip from a small info mark after the label. */
  info?: string
}

/** A group of rows, separated from the next by a thin divider; note is a small muted line above it. */
export type MenuSection = { items: MenuItem[]; note?: string }

type Registered = { items: React.MutableRefObject<MenuItem[]>; signature: string } | null
type MenuContextValue = { registered: Registered; register: (entry: Registered) => void }

const MenuContext = createContext<MenuContextValue | null>(null)

export const GameMenuProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [registered, register] = useState<Registered>(null)
  return <MenuContext.Provider value={{ registered, register }}>{children}</MenuContext.Provider>
}

/**
 * Puts the current game's secondary actions (pause, new game, leaderboard…) in
 * the header menu, so the page itself only shows the board and its numbers.
 */
export function useGameMenu(items: MenuItem[]): void {
  const context = useContext(MenuContext)
  const itemsRef = useRef(items)
  itemsRef.current = items
  const signature = items.map(item => `${item.label}|${item.disabled ? 1 : 0}|${item.badge ?? ''}`).join(';')
  const register = context?.register

  useEffect(() => {
    register?.({ items: itemsRef, signature })
  }, [register, signature])

  useEffect(() => () => register?.(null), [register])
}

const DotsIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
    <circle cx="5" cy="12" r="1.8" />
    <circle cx="12" cy="12" r="1.8" />
    <circle cx="19" cy="12" r="1.8" />
  </svg>
)

const InfoIcon = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" className="h-4 w-4">
    <circle cx="8" cy="8" r="6.25" />
    <path d="M8 7.4v3.4" />
    <circle cx="8" cy="5.2" r="0.5" fill="currentColor" />
  </svg>
)

// How long the pointer rests on an info mark before its tooltip shows, and how long the tooltip stays after it leaves.
const INFO_SHOW_DELAY = 120
const INFO_HIDE_DELAY = 150

interface MenuButtonProps {
  /** The app's groups, after the current game's own items. */
  sections: MenuSection[]
}

/** The single "more" button in the header and its dropdown. */
export const MenuButton: React.FC<MenuButtonProps> = ({ sections }) => {
  const context = useContext(MenuContext)
  const [open, setOpen] = useState(false)
  // Opened from the keyboard: focus the first row. From a tap or click, nothing starts highlighted.
  const openedByKeyboard = useRef(false)
  // The row (by label) whose info tooltip is showing, and where its arrow points (the mark's centre, from the row's left edge).
  const [infoFor, setInfoFor] = useState<string | null>(null)
  const [infoArrowX, setInfoArrowX] = useState(0)
  const infoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const infoPointer = useRef('')
  const menuId = useId()
  const rootRef = useRef<HTMLDivElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const gameItems = context?.registered?.items.current ?? []
  const groups = [{ items: gameItems }, ...sections].filter(section => section.items.length > 0)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    if (openedByKeyboard.current) rootRef.current?.querySelector<HTMLElement>('[role^="menuitem"]:not([disabled])')?.focus()
    else menuRef.current?.focus({ preventScroll: true })
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
      if (infoTimer.current) clearTimeout(infoTimer.current)
      setInfoFor(null)
    }
  }, [open])

  const cancelInfoTimer = () => {
    if (infoTimer.current) clearTimeout(infoTimer.current)
    infoTimer.current = null
  }

  const showInfo = (label: string, mark: HTMLElement | null, delay = 0) => {
    cancelInfoTimer()
    const show = () => {
      if (mark) setInfoArrowX(mark.offsetLeft + mark.offsetWidth / 2)
      setInfoFor(label)
    }
    if (delay > 0) infoTimer.current = setTimeout(show, delay)
    else show()
  }

  const hideInfo = (delay = 0) => {
    cancelInfoTimer()
    if (delay > 0) infoTimer.current = setTimeout(() => setInfoFor(null), delay)
    else setInfoFor(null)
  }

  const select = (item: MenuItem) => {
    setOpen(false)
    item.onSelect()
  }

  const onMenuKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    const items = Array.from(rootRef.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([disabled])') ?? [])
    const index = items.indexOf(document.activeElement as HTMLElement)
    const step = event.key === 'ArrowDown' ? 1 : -1
    const next = index === -1 ? items[step === 1 ? 0 : items.length - 1] : items[(index + step + items.length) % items.length]
    next?.focus()
  }

  const itemClass = 'flex min-h-10 w-full items-center justify-between gap-4 rounded-lg px-3 text-left text-sm text-neutral-800 transition-colors hover:bg-neutral-100 focus-visible:bg-neutral-100 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40 dark:text-neutral-100 dark:hover:bg-neutral-800 dark:focus-visible:bg-neutral-800'

  const row = (item: MenuItem) => {
    if (!item.info) return rowButton(item)
    const infoId = `${menuId}-info-${item.label.replace(/\s+/g, '-')}`
    return (
      <div key={item.label} role="none" className="relative">
        {rowButton(item, infoId)}
        {/* Above the row and inside the menu's width, so the menu's scrolling never clips it.
            The arrow is part of the bubble, so the two fade as one; visibility is in the
            transition so the bubble fades out as well as in. */}
        <span
          id={infoId}
          role="tooltip"
          className={`pointer-events-none absolute inset-x-2 bottom-[calc(100%-0.25rem)] z-10 rounded-lg bg-neutral-900 px-2.5 py-1.5 text-xs leading-snug text-balance text-white shadow-lg transition-[opacity,visibility] duration-150 ease-out dark:bg-neutral-100 dark:text-neutral-900 ${infoFor === item.label ? 'visible opacity-100' : 'invisible opacity-0'}`}
        >
          {item.info}
          <span
            aria-hidden="true"
            data-menu-info-arrow
            style={{ left: `calc(${infoArrowX}px - 0.5rem)` }}
            className="absolute -bottom-1 h-2 w-2 -translate-x-1/2 rotate-45 bg-inherit"
          />
        </span>
      </div>
    )
  }

  const rowButton = (item: MenuItem, infoId?: string) => (
    <button
      key={item.label}
      type="button"
      role={item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
      aria-checked={item.checked}
      aria-describedby={infoId}
      disabled={item.disabled}
      onClick={() => select(item)}
      // Keyboard users get the tooltip when they reach the row; the info mark itself isn't a stop.
      onFocus={infoId ? event => { if (event.currentTarget.matches(':focus-visible')) showInfo(item.label, event.currentTarget.querySelector<HTMLElement>('[data-menu-info]')) } : undefined}
      onBlur={infoId ? () => hideInfo() : undefined}
      className={itemClass}
    >
      {item.sublabel ? (
        <span className="flex min-w-0 flex-col py-1.5">
          <span>{item.label}</span>
          <span className="truncate text-xs text-neutral-500 dark:text-neutral-400" title={item.sublabel}>{item.sublabel}</span>
        </span>
      ) : infoId ? (
        <span className="flex shrink-0 items-center">
          {item.label}
          {/* Resting on the mark shows the tooltip; a tap shows or hides it without flipping the switch.
              The mark is in the middle of the menu, so a pointer passing over it on the way to
              another row doesn't show the tooltip, and one that slips off the edge and comes back keeps it. */}
          <span
            aria-hidden="true"
            data-menu-info
            onPointerDown={event => { infoPointer.current = event.pointerType }}
            onPointerEnter={event => {
              if (event.pointerType !== 'mouse') return
              if (infoFor === item.label) cancelInfoTimer()
              else showInfo(item.label, event.currentTarget, INFO_SHOW_DELAY)
            }}
            onPointerLeave={event => {
              if (event.pointerType !== 'mouse') return
              // Showing for keyboard focus: the pointer leaving doesn't take it away.
              if (event.currentTarget.closest('button')?.matches(':focus-visible')) cancelInfoTimer()
              else hideInfo(infoFor === item.label ? INFO_HIDE_DELAY : 0)
            }}
            onClick={event => {
              event.stopPropagation()
              if (infoPointer.current !== 'mouse' && infoFor === item.label) hideInfo()
              else showInfo(item.label, event.currentTarget)
            }}
            className="flex h-10 w-7 items-center justify-center text-neutral-400 transition-colors hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300"
          >
            <InfoIcon />
          </span>
        </span>
      ) : (
        <span className="shrink-0">{item.label}</span>
      )}
      {item.detail && <span className="min-w-0 truncate text-sm tabular-nums text-neutral-500 dark:text-neutral-400">{item.detail}</span>}
      {item.badge !== undefined && item.badge > 0 && (item.live ? (
        <span aria-label={`${item.badge} playing now`} className="flex items-center gap-1 text-xs font-medium tabular-nums text-emerald-700 dark:text-emerald-300">
          <span aria-hidden="true" className="h-1.5 w-1.5 rotate-45 rounded-[2px] bg-emerald-500" />
          {item.badge}
        </span>
      ) : (
        <span aria-hidden="true" className="rounded-full bg-neutral-100 px-1.5 text-xs font-semibold tabular-nums text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">{item.badge}</span>
      ))}
      {item.checked !== undefined && (
        <span aria-hidden="true" className={`relative h-5 w-8 shrink-0 rounded-full transition-colors ${item.checked ? 'bg-neutral-900 dark:bg-neutral-400' : 'bg-neutral-300 dark:bg-neutral-600'}`}>
          <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${item.checked ? 'left-3.5' : 'left-0.5'}`} />
        </span>
      )}
    </button>
  )

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label="Menu"
        title="Menu"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={event => { openedByKeyboard.current = event.detail === 0; setOpen(value => !value) }}
        className={`relative flex h-10 w-10 items-center justify-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 ${
          open ? 'bg-neutral-200 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100' : 'text-neutral-600 hover:bg-neutral-200/70 dark:text-neutral-300 dark:hover:bg-neutral-800'
        }`}
      >
        <DotsIcon />
      </button>
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label="Menu"
          tabIndex={-1}
          onKeyDown={onMenuKeyDown}
          className="animate-menu-in absolute right-0 top-11 z-40 max-h-[calc(100dvh-4rem)] w-60 overflow-y-auto rounded-xl border border-neutral-200 bg-white p-1 shadow-xl outline-none dark:border-neutral-700 dark:bg-neutral-900"
        >
          {groups.map((section, index) => (
            <div key={index} role="group">
              {index > 0 && <div role="separator" className="mx-2 my-1 h-px bg-neutral-100 dark:bg-neutral-800" />}
              {section.note && (
                <p className="truncate px-3 pb-0.5 pt-1.5 text-xs text-neutral-500 dark:text-neutral-400" title={section.note}>{section.note}</p>
              )}
              {section.items.map(row)}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
