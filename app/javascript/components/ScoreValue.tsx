import React from 'react'

interface ScoreValueProps {
  value: number
  animationKey?: string | number | null
  className?: string
}

const ScoreValue = React.memo(function ScoreValue({ value, animationKey, className = '' }: ScoreValueProps) {
  const previous = React.useRef({ value, animationKey })
  const [animatedValue, setAnimatedValue] = React.useState<number | null>(null)

  React.useEffect(() => {
    // A changed claim key distinguishes live successes from restored scores.
    const shouldAnimate = value > previous.current.value &&
      animationKey != null && animationKey !== previous.current.animationKey
    previous.current = { value, animationKey }

    if (!shouldAnimate) {
      setAnimatedValue(null)
      return
    }

    setAnimatedValue(value)
    const timeout = window.setTimeout(() => setAnimatedValue(null), 600)
    return () => window.clearTimeout(timeout)
  }, [value, animationKey])

  return (
    <span key={value} className={`inline-block ${className} ${animatedValue === value ? 'animate-score-pop' : ''}`}>
      {value}
    </span>
  )
})

export default ScoreValue
