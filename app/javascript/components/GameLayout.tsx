import React from 'react'

interface GameLayoutProps {
  hud: React.ReactNode
  board: React.ReactNode
  /** The side panel (already knows whether it is open). */
  panel: React.ReactNode
  /**
   * A card shown before the game starts. It lies over the page from the top
   * instead of in the board, so it's in one place whatever the board under
   * it measures.
   */
  cover?: React.ReactNode
}

/**
 * Shared page layout for both modes: a slim HUD strip, then the board, which
 * is the centerpiece. The side panel only takes room when it is open.
 *
 * Everything is anchored to the top so the board never re-centers (and never
 * jumps) when rows are dealt or removed.
 *
 * Every game gets the same column, so a board is in one place whichever game
 * it belongs to.
 *
 * Under a cover the board is a backdrop, which wide screens leave out. Its
 * room is kept, so the board is where the backdrop was once the cover goes.
 */
const GameLayout: React.FC<GameLayoutProps> = ({ hud, board, panel, cover }) => {
  return (
    <main className={`mx-auto w-full max-w-screen-2xl px-3 pb-safe pt-2 md:px-6 lg:flex lg:items-start lg:justify-center lg:gap-8 lg:px-10 lg:pt-6 lg:pb-10 ${cover ? 'relative' : ''}`}>
      {cover && <div className="pointer-events-none absolute inset-x-0 top-0 z-10">{cover}</div>}
      <section className={`mx-auto w-full max-w-2xl lg:mx-0 lg:min-w-0 lg:max-w-4xl lg:flex-1 ${cover ? 'lg:invisible' : ''}`}>
        {hud}
        {board}
      </section>
      {panel}
    </main>
  )
}

export default GameLayout
