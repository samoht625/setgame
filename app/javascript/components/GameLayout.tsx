import React from 'react'

interface GameLayoutProps {
  hud: React.ReactNode
  board: React.ReactNode
  /** The side panel (already knows whether it is open). */
  panel: React.ReactNode
}

/**
 * Shared page layout for both modes: a slim HUD strip, then the board, which
 * is the centerpiece. The side panel only takes room when it is open.
 *
 * Everything is anchored to the top so the board never re-centers (and never
 * jumps) when rows are dealt or removed.
 */
const GameLayout: React.FC<GameLayoutProps> = ({ hud, board, panel }) => {
  return (
    <main className="mx-auto w-full max-w-screen-2xl px-3 pb-safe pt-2 md:px-6 lg:flex lg:items-start lg:justify-center lg:gap-8 lg:px-10 lg:pt-6 lg:pb-10">
      <section className="mx-auto w-full max-w-2xl lg:mx-0 lg:min-w-0 lg:max-w-4xl lg:flex-1">
        {hud}
        {board}
      </section>
      {panel}
    </main>
  )
}

export default GameLayout
