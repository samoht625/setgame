import { applySoloClaim, startSoloDeal } from './solo_deal'

export type Claim = { cards: number[]; t_ms: number }
export type Side = 'me' | 'them'

/** A finished run as the timeline needs it: when each set was found, and the final time. */
export type RunTiming = { times: number[]; finishMs: number }

/** A replay takes about this long to play through, whatever the runs' length. */
const TARGET_PLAYBACK_MS = 20_000

/**
 * The board before any claim, then after each one, re-dealt from the day's seed.
 * Stops early at a claim that doesn't apply, so a bad timeline can't show a made-up board.
 */
export function replayBoards(seed: number, claims: Claim[]): number[][] {
  const deal = startSoloDeal(seed)
  const boards = [[...deal.board]]
  for (const claim of claims) {
    if (!applySoloClaim(deal, [...claim.cards]).ok) break
    boards.push([...deal.board])
  }
  return boards
}

/** How many sets had been found by `t`. */
export function setsBy(times: number[], t: number): number {
  let count = 0
  while (count < times.length && times[count]! <= t) count++
  return count
}

/** Who was ahead at `t`: whoever had finished, else whoever had found more sets. Null when level. */
export function leaderAt(me: RunTiming, them: RunTiming, t: number): Side | null {
  const meDone = t >= me.finishMs
  const themDone = t >= them.finishMs
  if (meDone && themDone) return me.finishMs === them.finishMs ? null : me.finishMs < them.finishMs ? 'me' : 'them'
  if (meDone) return 'me'
  if (themDone) return 'them'
  const mine = setsBy(me.times, t)
  const theirs = setsBy(them.times, t)
  return mine === theirs ? null : mine > theirs ? 'me' : 'them'
}

export type LeadSegment = { from: number; to: number; leader: Side | null }

/** The lead over the whole timeline, as runs of the same leader from 0 to the later finish. */
export function leadSegments(me: RunTiming, them: RunTiming): LeadSegment[] {
  const end = Math.max(me.finishMs, them.finishMs)
  const changes = [...new Set([0, ...me.times, ...them.times, me.finishMs, them.finishMs])]
    .filter(t => t >= 0 && t < end)
    .sort((a, b) => a - b)
  const segments: LeadSegment[] = []
  changes.forEach((from, index) => {
    const to = changes[index + 1] ?? end
    const leader = leaderAt(me, them, from)
    const last = segments[segments.length - 1]
    if (last && last.leader === leader) last.to = to
    else segments.push({ from, to, leader })
  })
  return segments
}

/** A whole-number speed-up so the replay plays in about TARGET_PLAYBACK_MS; never slower than real time. */
export function playbackSpeed(durationMs: number): number {
  return Math.max(1, Math.round(durationMs / TARGET_PLAYBACK_MS))
}

export type ReplayFrame = {
  board: number[]
  /** The set just found, shown on the board it was taken from. */
  found: number[] | null
  sets: number
}

/**
 * What one side's board looks like at `t`. For `flashMs` after each claim the
 * board still shows the set that was taken, then the cards that replaced it.
 */
export function frameAt(boards: number[][], claims: Claim[], t: number, flashMs: number): ReplayFrame {
  const sets = Math.min(setsBy(claims.map(claim => claim.t_ms), t), boards.length - 1)
  if (sets > 0 && t - claims[sets - 1]!.t_ms < flashMs) {
    return { board: boards[sets - 1]!, found: claims[sets - 1]!.cards, sets }
  }
  return { board: boards[sets]!, found: null, sets }
}
