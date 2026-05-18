import { useEffect, useState } from 'react'
import { ActivityIndicator, Platform, Text, View } from 'react-native'
import { useAuth } from '../context/AuthContext'
import { finalizeOAuthRedirect } from '../lib/supabaseClient'
import { useTheme } from '../context/ThemeContext'
import { typography } from '../lib/typography'

export default function AuthCallbackScreen() {
  const { theme } = useTheme()
  const { user } = useAuth()
  const [message, setMessage] = useState('Finishing sign-in...')

  useEffect(() => {
    let mounted = true

    async function completeRedirect() {
      try {
        if (Platform.OS !== 'web') return

        setMessage('Restoring your session...')
        const currentUrl = window.location.href
        await finalizeOAuthRedirect(currentUrl)

        if (!mounted) return

        setMessage('Signed in successfully.')

        try {
          if (window.opener && window.opener !== window) {
            window.close()
          }
        } catch {
          // Ignore popup close restrictions.
        }
      } catch (error) {
        console.error('Auth callback screen failed:', error)
        if (mounted) {
          setMessage(error?.message || 'Could not complete sign-in.')
        }
      }
    }

    completeRedirect()

    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    if (user) {
      setMessage('Signed in successfully.')
    }
  }, [user])

  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.background,
      }}
    >
      <ActivityIndicator size="large" color={theme.colors.primary} />
      <Text style={{ marginTop: 12, color: theme.colors.text, ...typography.style.semiBold }}>{message}</Text>
    </View>
  )
}
