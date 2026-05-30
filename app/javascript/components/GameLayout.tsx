import React from 'react'

interface GameLayoutProps {
  board: React.ReactNode
  sidebar: React.ReactNode
}

/**
 * Shared page layout for both modes: the board is the centerpiece and the
 * info panel sits to the right on desktop, below the board on mobile.
 *
 * Everything is anchored to the top so the board never re-centers (and never
 * jumps) when rows are dealt or removed or the side panel changes height.
 */
const GameLayout: React.FC<GameLayoutProps> = ({ board, sidebar }) => {
  return (
    <main className="mx-auto w-full max-w-screen-2xl px-3 pb-safe pt-4 md:px-6 lg:flex lg:items-start lg:gap-10 lg:px-10 lg:pt-[max(2rem,5vh)] lg:pb-10">
      <section className="flex min-w-0 flex-1 items-start justify-center">
        {board}
      </section>
      <aside className="mx-auto mt-6 w-full max-w-2xl lg:mx-0 lg:mt-0 lg:w-72 lg:max-w-none lg:shrink-0 xl:w-80">
        {sidebar}
      </aside>
    </main>
  )
}

export default GameLayout
