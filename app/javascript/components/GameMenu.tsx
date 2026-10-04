import React, { createContext, useContext, useEffect, useId, useRef, useState } from 'react'

/** One action in the header's overflow menu. */
export type MenuItem = {
  label: string
  onSelect: () => void
  disabled?: boolean
  /** Shown as a small count next to the label (e.g. players online). */
  badge?: number
}

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

interface MenuButtonProps {
  /** Always-there items after the game's own: how to play, sound. */
  appItems: Array<MenuItem & { checked?: boolean }>
  /** A dot on the button (e.g. other people are online). */
  hasBadge?: boolean
}

/** The single "more" button in the header and its dropdown. */
export const MenuButton: React.FC<MenuButtonProps> = ({ appItems, hasBadge = false }) => {
  const context = useContext(MenuContext)
  const [open, setOpen] = useState(false)
  const menuId = useId()
  const rootRef = useRef<HTMLDivElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const gameItems = context?.registered?.items.current ?? []

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
    rootRef.current?.querySelector<HTMLElement>('[role^="menuitem"]:not([disabled])')?.focus()
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const select = (item: MenuItem) => {
    setOpen(false)
    item.onSelect()
  }

  const onMenuKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    const items = Array.from(rootRef.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([disabled])') ?? [])
    const index = items.indexOf(document.activeElement as HTMLElement)
    const next = items[(index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]
    next?.focus()
  }

  const itemClass = 'flex min-h-10 w-full items-center justify-between gap-4 rounded-lg px-3 text-left text-sm text-neutral-800 transition-colors hover:bg-neutral-100 focus:bg-neutral-100 focus:outline-none disabled:cursor-not-allowed disabled:opacity-40 dark:text-neutral-100 dark:hover:bg-neutral-800 dark:focus:bg-neutral-800'

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
        onClick={() => setOpen(value => !value)}
        className={`relative flex h-10 w-10 items-center justify-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 ${
          open ? 'bg-neutral-200 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100' : 'text-neutral-600 hover:bg-neutral-200/70 dark:text-neutral-300 dark:hover:bg-neutral-800'
        }`}
      >
        <DotsIcon />
        {hasBadge && <span aria-hidden="true" className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-neutral-100 dark:ring-[#111214]" />}
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label="Menu"
          onKeyDown={onMenuKeyDown}
          className="animate-menu-in absolute right-0 top-11 z-40 w-52 rounded-xl border border-neutral-200 bg-white p-1 shadow-xl dark:border-neutral-700 dark:bg-neutral-900"
        >
          {gameItems.map(item => (
            <button key={item.label} type="button" role="menuitem" disabled={item.disabled} onClick={() => select(item)} className={itemClass}>
              <span>{item.label}</span>
              {item.badge !== undefined && item.badge > 0 && (
                <span aria-hidden="true" className="rounded-full bg-neutral-100 px-1.5 text-xs font-semibold tabular-nums text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">{item.badge}</span>
              )}
            </button>
          ))}
          {gameItems.length > 0 && <div role="separator" className="my-1 h-px bg-neutral-100 dark:bg-neutral-800" />}
          {appItems.map(item => (
            <button
              key={item.label}
              type="button"
              role={item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
              aria-checked={item.checked}
              disabled={item.disabled}
              onClick={() => select(item)}
              className={itemClass}
            >
              <span>{item.label}</span>
              {item.checked !== undefined && (
                <span aria-hidden="true" className={`relative h-5 w-8 rounded-full transition-colors ${item.checked ? 'bg-emerald-500' : 'bg-neutral-300 dark:bg-neutral-600'}`}>
                  <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${item.checked ? 'left-3.5' : 'left-0.5'}`} />
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
