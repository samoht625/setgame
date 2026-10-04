import React, { useEffect, useState } from 'react'
import CardFace from '../components/CardFace'
import { cardAttributes } from '../lib/rules'

/** The example set: 1 red solid squiggle, 2 red striped diamonds, 3 red open ovals. */
export const DEMO_SET = [1, 38, 75]
/** Six cards in which the example set is the only set. */
export const DEMO_BOARD = [32, 1, 18, 75, 52, 38]

const FEATURES = [
  { key: 'number', label: 'Number' },
  { key: 'color', label: 'Color' },
  { key: 'shape', label: 'Shape' },
  { key: 'shading', label: 'Shading' }
] as const

const INKS = ['#ea1c2d', '#613394', '#009b4d']

function verdict(key: (typeof FEATURES)[number]['key']): 'same' | 'different' {
  const values = new Set(DEMO_SET.map(id => cardAttributes(id)[key]))
  return values.size === 1 ? 'same' : 'different'
}

const Check = () => (
  <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3 w-3 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m3.5 8.5 3 3 6-7" />
  </svg>
)

/** A tiny symbol for one value of a feature, drawn with the card artwork's shapes. */
const Glyph: React.FC<{ shape?: number; color?: number; shading?: number }> = ({ shape = 2, color = 0, shading = 0 }) => {
  const ink = INKS[color]
  const name = ['red', 'purple', 'green'][color]
  const shapeId = ['squiggle', 'diamond', 'oval'][shape]
  return (
    <svg aria-hidden="true" viewBox="-34 -62 68 124" className="h-4 w-2.5" fill={shading === 0 ? ink : shading === 1 ? `url(#set-card-stripes-${name})` : 'none'} stroke={ink} strokeWidth={shading === 2 ? 9 : 6}>
      <use href={`#set-card-${shapeId}`} />
    </svg>
  )
}

const LEGEND: Record<(typeof FEATURES)[number]['key'], React.ReactNode> = {
  number: <span className="font-semibold tabular-nums tracking-wider">1 2 3</span>,
  color: (
    <span className="flex gap-0.5">
      {INKS.map(ink => <span key={ink} className="h-2.5 w-2.5 rounded-full" style={{ background: ink }} />)}
    </span>
  ),
  shape: <span className="flex gap-0.5">{[1, 2, 0].map(shape => <Glyph key={shape} shape={shape} color={1} shading={2} />)}</span>,
  shading: <span className="flex gap-0.5">{[0, 1, 2].map(shading => <Glyph key={shading} shading={shading} color={2} />)}</span>
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

interface RulesDemoProps {
  /** `features` names the four features; `set` picks out the set and says why it is one. */
  step: 'features' | 'set'
}

/** Six real cards; on the `set` step the set lights up after a beat. */
const RulesDemo: React.FC<RulesDemoProps> = ({ step }) => {
  const [revealed, setRevealed] = useState(false)

  useEffect(() => {
    setRevealed(false)
    if (step !== 'set') return
    if (prefersReducedMotion()) {
      setRevealed(true)
      return
    }
    const timer = setTimeout(() => setRevealed(true), 700)
    return () => clearTimeout(timer)
  }, [step])

  const lit = step === 'set' && revealed

  return (
    <div data-rules-demo={step} data-revealed={lit ? 'true' : 'false'}>
      <div className="grid grid-cols-3 gap-1.5 p-1">
        {DEMO_BOARD.map(id => {
          const inSet = DEMO_SET.includes(id)
          return (
            <div
              key={id}
              data-demo-card={id}
              data-in-set={lit && inSet ? 'true' : undefined}
              className={`overflow-hidden rounded-md border transition-all duration-500 ease-out ${
                lit && inSet
                  ? 'scale-[1.04] border-amber-400 shadow-[0_0_0_2px_rgba(251,191,36,0.9),0_4px_14px_rgba(251,191,36,0.35)]'
                  : 'border-neutral-200 dark:border-neutral-600'
              } ${lit && !inSet ? 'opacity-25' : 'opacity-100'}`}
            >
              <CardFace cardId={id} className="h-auto w-full" />
            </div>
          )
        })}
      </div>

      <ul className="mt-2 grid grid-cols-2 gap-1.5" aria-label={step === 'set' ? 'Why it’s a set' : 'The four features'}>
        {FEATURES.map(({ key, label }, index) => (
          <li
            key={key}
            style={step === 'set' ? { transitionDelay: `${150 + index * 90}ms` } : undefined}
            className={`flex items-center justify-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-medium transition-all duration-300 ${
              step === 'set'
                ? `bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200 ${lit ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0'}`
                : 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200'
            }`}
          >
            {step === 'set' ? (
              <>
                <Check />
                <span>{label}</span>
                <span className="font-normal opacity-75">{verdict(key) === 'same' ? 'same' : 'all different'}</span>
              </>
            ) : (
              <>
                <span>{label}</span>
                {LEGEND[key]}
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

export default RulesDemo
