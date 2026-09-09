import React from 'react'

interface GameLayoutProps {
  board: React.ReactNode
  sidebar: React.ReactNode
  controls?: React.ReactNode
}

// Spanning both desktop rows keeps the board anchored while sidebar content changes.
const GameLayout: React.FC<GameLayoutProps> = ({ board, sidebar, controls }) => {
  const hasControls = Boolean(controls)

  return (
    <main className={`mx-auto grid w-full max-w-screen-2xl grid-cols-1 items-start gap-y-3 px-3 pb-safe pt-4 md:px-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-x-10 lg:gap-y-4 lg:px-10 lg:pt-[max(2rem,5vh)] lg:pb-10 xl:grid-cols-[minmax(0,1fr)_20rem] ${hasControls ? 'lg:grid-rows-[auto_1fr]' : ''}`}>
      {hasControls && (
        <div className="mx-auto w-full max-w-2xl lg:col-start-2 lg:row-start-1 lg:mx-0 lg:max-w-none">
          {controls}
        </div>
      )}
      <section className={`flex min-w-0 items-start justify-center lg:col-start-1 lg:row-start-1 ${hasControls ? 'lg:row-span-2' : ''}`}>
        {board}
      </section>
      <aside className={`mx-auto mt-3 w-full max-w-2xl lg:col-start-2 lg:mx-0 lg:mt-0 lg:max-w-none ${hasControls ? 'lg:row-start-2' : 'lg:row-start-1'}`}>
        {sidebar}
      </aside>
    </main>
  )
}

export default GameLayout
