import { useEffect, useState } from 'react'
import { knownStatus, onStatus } from '../lib/boot'

/** The player's Daily Deal streak from the latest status this page has, kept current as new ones arrive. 0 when unknown. */
export function useStreak(): number {
  const read = () => knownStatus('daily')?.me.streak ?? 0
  const [streak, setStreak] = useState(read)
  useEffect(() => onStatus(() => setStreak(read())), [])
  return streak
}
