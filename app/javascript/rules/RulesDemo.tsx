import React, { useEffect, useRef, useState } from 'react'
import CardFace from '../components/CardFace'
import { makeExample, nextSameCount, verdicts, type DemoExample } from './demoExample'

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

const FIRST_EXAMPLE: DemoExample = { board: DEMO_BOARD, set: DEMO_SET }
/** The first example has one feature the same (color). */
const FIRST_SAME_COUNT = 1
const FADE_MS = 150

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
  /** Show a New example control that deals six new cards and lights their set. */
  shuffle?: boolean
}

const RefreshIcon: React.FC = () => (
  <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
    <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9" />
    <path d="M12.5 1.8v2.7H9.8" />
  </svg>
)

/** Six real cards; on the `set` step the set lights up after a beat. */
const RulesDemo: React.FC<RulesDemoProps> = ({ step, shuffle = false }) => {
  const [revealed, setRevealed] = useState(false)
  const [example, setExample] = useState<DemoExample>(FIRST_EXAMPLE)
  const [round, setRound] = useState(0)
  const [fading, setFading] = useState(false)
  const sameCount = useRef(FIRST_SAME_COUNT)
  const fadeTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    setRevealed(false)
    if (step !== 'set') return
    if (prefersReducedMotion()) {
      setRevealed(true)
      return
    }
    const timer = setTimeout(() => setRevealed(true), round === 0 ? 700 : 450)
    return () => clearTimeout(timer)
  }, [step, round])

  useEffect(() => () => clearTimeout(fadeTimer.current), [])

  const dealNew = () => {
    if (fading) return
    sameCount.current = nextSameCount(sameCount.current)
    const next = makeExample(sameCount.current)
    const swap = () => {
      setExample(next)
      setRound(r => r + 1)
      setFading(false)
    }
    if (prefersReducedMotion()) return swap()
    setFading(true)
    fadeTimer.current = setTimeout(swap, FADE_MS)
  }

  const lit = step === 'set' && revealed && !fading
  const row = verdicts(example.set)

  return (
    <div data-rules-demo={step} data-revealed={lit ? 'true' : 'false'} data-example={round}>
      <div className={`grid grid-cols-3 gap-1.5 rounded-xl bg-neutral-100 p-1.5 transition-opacity duration-150 dark:bg-neutral-800 ${fading ? 'opacity-0' : 'opacity-100'}`}>
        {example.board.map((id, position) => {
          const inSet = example.set.includes(id)
          return (
            <div
              key={position}
              data-demo-card={id}
              data-in-set={lit && inSet ? 'true' : undefined}
              className={`overflow-hidden rounded-md outline-2 outline-offset-1 transition-all duration-500 ease-out ${
                lit && inSet ? 'outline-amber-400' : 'outline-transparent'
              } ${lit && !inSet ? 'opacity-30' : 'opacity-100'}`}
            >
              <CardFace cardId={id} className="h-auto w-full" />
            </div>
          )
        })}
      </div>

      <ul className="mx-auto mt-3 grid w-fit grid-cols-2 gap-x-6 gap-y-1 text-xs text-neutral-500 dark:text-neutral-400" aria-label={step === 'set' ? 'Why it’s a set' : 'The four features'}>
        {FEATURES.map(({ key, label }, index) => (
          <li
            key={key}
            style={step === 'set' ? { transitionDelay: `${150 + index * 90}ms` } : undefined}
            className={`flex items-center gap-1.5 transition-opacity duration-300 ${step === 'set' && !lit ? 'opacity-0' : 'opacity-100'}`}
          >
            {step === 'set' ? (
              <>
                <span className="font-medium text-neutral-800 dark:text-neutral-200">{label}</span>
                <span>{row[key]}</span>
              </>
            ) : (
              <>
                <span className="font-medium text-neutral-800 dark:text-neutral-200">{label}</span>
                {LEGEND[key]}
              </>
            )}
          </li>
        ))}
      </ul>

      {shuffle && step === 'set' && (
        <div className="mt-2 flex justify-center">
          <button
            type="button"
            onClick={dealNew}
            className="inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-full px-3 text-xs font-medium text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
          >
            <RefreshIcon />
            New example
          </button>
        </div>
      )}
    </div>
  )
}

export default RulesDemo
