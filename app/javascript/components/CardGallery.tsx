import React from 'react'
import CardFace, { CardSymbols, describeCard } from './CardFace'

const CARD_IDS = Array.from({ length: 81 }, (_, i) => i + 1)

const CardGallery: React.FC = () => {
  return (
    <div className="min-h-dvh bg-neutral-100 text-neutral-900 antialiased dark:bg-[#111214] dark:text-neutral-100">
      <CardSymbols />
      <header className="border-b border-neutral-200/80 bg-white/80 backdrop-blur dark:border-neutral-800 dark:bg-[#16181c]/80">
        <div className="mx-auto flex h-12 w-full max-w-screen-2xl items-center justify-between gap-3 px-3 md:px-6 lg:px-10">
          <div className="flex min-w-0 items-center gap-3">
            <a href="/" className="text-sm text-neutral-600 hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-white">
              ← Set
            </a>
            <h1 className="truncate text-base font-semibold tracking-tight">Card gallery</h1>
          </div>
          <p className="hidden text-xs text-neutral-500 sm:block dark:text-neutral-400">
            Original PNG · SVG
          </p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-screen-2xl px-3 py-6 md:px-6 lg:px-10">
        <p className="mb-6 max-w-2xl text-sm text-neutral-600 dark:text-neutral-400">
          Side-by-side of the scanned originals in <code className="rounded bg-neutral-200 px-1 dark:bg-neutral-800">/cards</code> and the SVG
          faces used in-game.
        </p>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {CARD_IDS.map((cardId) => (
            <article
              key={cardId}
              className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-[#181a1f]"
            >
              <div className="flex items-center justify-between gap-2 border-b border-neutral-100 px-3 py-2 dark:border-neutral-800">
                <span className="text-xs font-medium tabular-nums text-neutral-500 dark:text-neutral-400">#{cardId}</span>
                <span className="truncate text-xs text-neutral-700 dark:text-neutral-300">{describeCard(cardId)}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 p-3">
                <figure className="min-w-0">
                  <figcaption className="mb-1.5 text-[11px] uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                    Original
                  </figcaption>
                  <img
                    src={`/cards/${cardId}.png`}
                    alt={`Original scan: ${describeCard(cardId)}`}
                    className="block aspect-[258/167] w-full rounded-lg border border-neutral-200 bg-white object-contain dark:border-neutral-700"
                    loading="lazy"
                    decoding="async"
                  />
                </figure>
                <figure className="min-w-0">
                  <figcaption className="mb-1.5 text-[11px] uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                    SVG
                  </figcaption>
                  <div className="overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-700">
                    <CardFace cardId={cardId} className="h-auto w-full" />
                  </div>
                </figure>
              </div>
            </article>
          ))}
        </div>
      </main>
    </div>
  )
}

export default CardGallery
