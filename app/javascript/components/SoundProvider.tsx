import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

const STORAGE_KEY = 'setgame_sound_enabled'
type SoundContextValue = {
  enabled: boolean
  toggle: () => void
  playSelection: () => void
  playSet: () => void
}

const SoundContext = createContext<SoundContextValue>({ enabled: false, toggle: () => {}, playSelection: () => {}, playSet: () => {} })

function loadPreference(): boolean {
  try { return localStorage.getItem(STORAGE_KEY) === 'true' } catch { return false }
}

export const SoundProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [enabled, setEnabled] = useState(loadPreference)
  const enabledRef = useRef(enabled)
  const audioRef = useRef<AudioContext | null>(null)

  const closeAudio = useCallback(() => {
    const audio = audioRef.current
    audioRef.current = null
    if (audio && audio.state !== 'closed') void audio.close().catch(() => {})
  }, [])

  const getAudio = useCallback(() => {
    if (!enabledRef.current) return null
    try {
      const Audio = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Audio) return null
      if (!audioRef.current || audioRef.current.state === 'closed') audioRef.current = new Audio()
      return audioRef.current
    } catch { return null }
  }, [])

  const play = useCallback((notes: number[], gain: number, duration: number, spacing: number) => {
    const audio = getAudio()
    if (!audio) return
    const schedule = () => {
      if (!enabledRef.current || audioRef.current !== audio || audio.state !== 'running') return
      notes.forEach((frequency, index) => {
        const start = audio.currentTime + index * spacing
        const oscillator = audio.createOscillator()
        const volume = audio.createGain()
        oscillator.type = 'sine'
        oscillator.frequency.value = frequency
        volume.gain.setValueAtTime(0, start)
        volume.gain.linearRampToValueAtTime(gain, start + 0.008)
        volume.gain.exponentialRampToValueAtTime(0.0001, start + duration)
        oscillator.connect(volume)
        volume.connect(audio.destination)
        oscillator.onended = () => { oscillator.disconnect(); volume.disconnect() }
        oscillator.start(start)
        oscillator.stop(start + duration)
      })
    }
    try {
      if (audio.state === 'suspended') void audio.resume().then(schedule).catch(() => {})
      else schedule()
    } catch { /* Sound is optional when browser audio is unavailable. */ }
  }, [getAudio])

  const playSelection = useCallback(() => play([660], 0.025, 0.055, 0), [play])
  const playSet = useCallback(() => play([523.25, 659.25, 783.99], 0.045, 0.18, 0.07), [play])

  const toggle = useCallback(() => {
    const next = !enabledRef.current
    enabledRef.current = next
    setEnabled(next)
    try { localStorage.setItem(STORAGE_KEY, String(next)) } catch { /* Keep the preference for this session. */ }
    if (next) playSelection()
    else closeAudio()
  }, [closeAudio, playSelection])

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY && event.key !== null) return
      const next = loadPreference()
      enabledRef.current = next
      setEnabled(next)
      if (!next) closeAudio()
    }
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener('storage', onStorage)
      closeAudio()
    }
  }, [closeAudio])

  const value = useMemo(() => ({ enabled, toggle, playSelection, playSet }), [enabled, toggle, playSelection, playSet])
  return <SoundContext.Provider value={value}>{children}</SoundContext.Provider>
}

export const useSound = () => useContext(SoundContext)
