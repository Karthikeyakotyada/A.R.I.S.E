import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

const AuthContext = createContext({})

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let isMounted = true

    const initializeAuth = async () => {
      try {
        // If the URL contains OAuth tokens or code (redirect callback), parse and store the session
        if (typeof window !== 'undefined') {
          const href = window.location.href
          const hasOauthParams = /[#?](access_token|refresh_token|expires_in|error|code)=/.test(href)
          if (hasOauthParams) {
            try {
              const { data, error } = await supabase.auth.getSessionFromUrl({ storeSession: true })
              if (error) {
                console.error('Error parsing OAuth callback URL:', error)
              } else if (isMounted) {
                setSession(data.session)
                setUser(data.session?.user ?? null)
              }

              // Clean URL to avoid re-processing the hash/query and to prevent exposing tokens
              try {
                const cleanPath = window.location.pathname + window.location.search
                window.history.replaceState({}, document.title, cleanPath)
              } catch (e) {
                // Ignore history replace failures
              }

              // If opened in a popup, try to close it after successful processing
              try {
                if (window.opener) {
                  window.close()
                }
              } catch (e) {
                // Some browsers may block window.close(); ignore.
              }
              // We've handled the redirect; return early to avoid duplicate getSession call
              return
            } catch (err) {
              console.error('getSessionFromUrl failed:', err)
            }
          }
        }

        // Fallback: get the existing session from storage
        const { data: { session: initialSession }, error: sessionError } = await supabase.auth.getSession()

        if (sessionError) {
          console.error('Error getting session:', sessionError)
        }

        if (isMounted) {
          setSession(initialSession)
          setUser(initialSession?.user ?? null)
        }
      } catch (error) {
        console.error('Auth initialization error:', error)
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    // Initialize auth on mount
    initializeAuth()

    // Listen for auth state changes (handles OAuth, signOut, etc.)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, currentSession) => {
        if (isMounted) {
          // Log auth events for debugging
          if (event === 'SIGNED_IN') {
            console.log('User signed in')
          } else if (event === 'SIGNED_OUT') {
            console.log('User signed out')
          } else if (event === 'USER_UPDATED') {
            console.log('User updated')
          }

          setSession(currentSession)
          setUser(currentSession?.user ?? null)
          setLoading(false)
        }
      }
    )

    return () => {
      isMounted = false
      subscription?.unsubscribe()
    }
  }, [])

  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut()
      if (error) {
        console.error('Sign out error:', error)
      }
    } catch (error) {
      console.error('Sign out error:', error)
    }
  }

  const value = {
    user,
    session,
    loading,
    signOut,
  }

  return (
    <AuthContext.Provider value={value}>
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
