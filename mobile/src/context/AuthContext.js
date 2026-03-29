import { createContext, useContext, useEffect, useState } from 'react'
import {
  clearLocalAuthSession,
  ensureValidSession,
  isInvalidRefreshTokenError,
  supabase,
} from '../lib/supabaseClient'

const AuthContext = createContext({})

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    const initializeSession = async () => {
      try {
        const nextSession = await ensureValidSession()
        if (!mounted) return
        setSession(nextSession)
        setUser(nextSession?.user ?? null)
      } catch (error) {
        if (isInvalidRefreshTokenError(error)) {
          await clearLocalAuthSession()
          if (mounted) {
            setSession(null)
            setUser(null)
          }
        } else {
          console.warn('Failed to restore auth session', error)
        }
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    initializeSession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setUser(nextSession?.user ?? null)
      setLoading(false)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
