/** The site's name: the home page's title, and what follows every other page's. Must match ApplicationHelper::SITE_NAME. */
export const SITE_NAME = 'Set Daily'

// 'solo' is Practice: timed games against the clock.
export type GameMode = 'daily' | 'puzzle' | 'solo' | 'multiplayer'

/** Where each game lives. The Puzzle is the home page; /puzzle opens it too. */
export const PATHS: Record<GameMode, string> = {
  daily: '/daily',
  puzzle: '/',
  solo: '/practice',
  multiplayer: '/m'
}
