import { useEffect, useState } from 'react'
import { onTwoCardChange, saveTwoCardMode, twoCardChoice, twoCardModeOn } from '../lib/two_card_mode'
import { showToast } from '../lib/toast'

/** Two-card mode for the player named `name`, kept current as it's switched. */
export function useTwoCardMode(name: string | null): { enabled: boolean; toggle: () => void } {
  const [choice, setChoice] = useState(twoCardChoice)
  useEffect(() => onTwoCardChange(setChoice), [])
  const enabled = twoCardModeOn(name, choice)

  const toggle = () => {
    void saveTwoCardMode(!enabled).then(saved => {
      showToast(saved ? `Two-card sets ${enabled ? 'off' : 'on'}` : 'Couldn’t save that setting. Try again.')
    })
  }

  return { enabled, toggle }
}
