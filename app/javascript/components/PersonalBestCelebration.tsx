import React, { useEffect, useState } from 'react'

const COLORS = ['#ed1738', '#7135a6', '#009e56']

const PersonalBestCelebration: React.FC<{ improvementMs: number }> = ({ improvementMs }) => {
  const [showParticles, setShowParticles] = useState(() => !window.matchMedia('(prefers-reduced-motion: reduce)').matches)

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => { if (media.matches) setShowParticles(false) }
    media.addEventListener('change', onChange)
    const timer = window.setTimeout(() => setShowParticles(false), 1400)
    return () => { window.clearTimeout(timer); media.removeEventListener('change', onChange) }
  }, [])

  const seconds = Math.floor(improvementMs / 1000)
  const faster = seconds === 0 ? 'Less than a second faster' : `${seconds} ${seconds === 1 ? 'second' : 'seconds'} faster`

  return (
    <div className="relative mt-3" data-personal-best>
      <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm dark:border-amber-800 dark:bg-amber-950/50">
        <p className="font-semibold text-amber-950 dark:text-amber-100">New personal best!</p>
        <p className="mt-0.5 text-xs text-amber-900 dark:text-amber-200">{faster} than your previous best on this device.</p>
      </div>
      {showParticles && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl" aria-hidden="true" data-celebration-particles>
          {Array.from({ length: 12 }, (_, index) => (
            <svg key={index} viewBox="0 0 24 24" className="celebration-particle absolute h-3 w-3" style={{ left: `${8 + index * 7.5}%`, top: '65%', color: COLORS[index % 3], '--particle-x': `${(index % 5 - 2) * 18}px`, '--particle-y': `${-30 - index % 4 * 12}px`, '--particle-turn': `${index % 2 ? 70 : -70}deg`, animationDelay: `${index % 3 * 55}ms` } as React.CSSProperties}>
              {index % 3 === 0 ? <path fill="currentColor" d="m12 1 7 11-7 11L5 12z" /> : index % 3 === 1 ? <rect fill="currentColor" x="6" y="1" width="12" height="22" rx="6" /> : <path fill="currentColor" d="M6 2C22-1 17 10 15 12S20 25 8 22 9 13 8 10 1 4 6 2Z" />}
            </svg>
          ))}
        </div>
      )}
    </div>
  )
}

export default PersonalBestCelebration
