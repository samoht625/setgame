import React from 'react'

/** The daily streak, looking the same wherever it shows. `children` is a quiet note after it. */
const StreakPill: React.FC<{ streak: number; className?: string; children?: React.ReactNode }> = ({ streak, className = '', children }) => (
  <p data-streak className={`inline-flex items-center gap-1.5 rounded-full bg-orange-50 px-3 py-1 text-xs text-orange-900 dark:bg-orange-950/40 dark:text-orange-200 ${className}`}>
    <span aria-hidden="true">🔥</span>
    <span className="font-semibold">{streak}-day streak</span>
    {children && <span>{children}</span>}
  </p>
)

export default StreakPill
