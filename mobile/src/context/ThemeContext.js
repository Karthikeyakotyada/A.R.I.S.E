import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useColorScheme } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  APPEARANCE_STORAGE_KEY,
  darkTheme,
  lightTheme,
  resolveTheme,
} from '../lib/theme'

/** @typedef {'light' | 'dark' | 'system'} AppearancePreference */

const ThemeContext = createContext({
  preference: 'system',
  colorScheme: 'light',
  isDark: false,
  theme: lightTheme,
  setPreference: async () => {},
  isReady: false,
})

export function ThemeProvider({ children }) {
  const systemScheme = useColorScheme() || 'light'
  const [preference, setPreferenceState] = useState(/** @type {AppearancePreference} */ ('system'))
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    let mounted = true
    AsyncStorage.getItem(APPEARANCE_STORAGE_KEY)
      .then((stored) => {
        if (!mounted) return
        if (stored === 'light' || stored === 'dark' || stored === 'system') {
          setPreferenceState(stored)
        }
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) setIsReady(true)
      })
    return () => {
      mounted = false
    }
  }, [])

  const colorScheme = useMemo(() => {
    if (preference === 'system') {
      return systemScheme === 'dark' ? 'dark' : 'light'
    }
    return preference
  }, [preference, systemScheme])

  const theme = useMemo(() => resolveTheme(colorScheme), [colorScheme])

  const setPreference = useCallback(async (next) => {
    if (next !== 'light' && next !== 'dark' && next !== 'system') return
    setPreferenceState(next)
    try {
      await AsyncStorage.setItem(APPEARANCE_STORAGE_KEY, next)
    } catch (error) {
      console.warn('[ARISE][theme] Failed to persist appearance:', error?.message)
    }
  }, [])

  const value = useMemo(
    () => ({
      preference,
      colorScheme,
      isDark: colorScheme === 'dark',
      theme,
      setPreference,
      isReady,
    }),
    [preference, colorScheme, theme, setPreference, isReady]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider')
  }
  return ctx
}

export const APPEARANCE_OPTIONS = [
  { id: 'light', label: 'Light', icon: 'sunny-outline' },
  { id: 'dark', label: 'Dark', icon: 'moon-outline' },
  { id: 'system', label: 'System', icon: 'phone-portrait-outline' },
]
