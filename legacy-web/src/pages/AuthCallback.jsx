import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

export default function AuthCallback() {
  const navigate = useNavigate()

  useEffect(() => {
    let isActive = true

    async function processCallback() {
      try {
        // Parse session from URL (handles hash or query)
        const { data, error } = await supabase.auth.getSessionFromUrl({ storeSession: true })

        if (error) {
          console.error('getSessionFromUrl error:', error)
        }

        // If session returned, notify opener (popup) and navigate
        if (data?.session) {
          try {
            // Inform opener window (if any) that sign-in succeeded
            if (window.opener && window.opener !== window) {
              try {
                window.opener.postMessage({ type: 'supabase_auth', event: 'SIGNED_IN' }, window.location.origin)
              } catch (e) {
                // ignore
              }
            }
          } catch (e) {
            // ignore
          }

          // Clean URL to remove tokens from address bar
          try {
            const cleanPath = window.location.pathname + window.location.search
            window.history.replaceState({}, document.title, cleanPath)
          } catch (e) {
            // ignore
          }

          if (isActive) {
            navigate('/dashboard', { replace: true })
          }

          // Try to close popup if opened as one
          try {
            if (window.opener) window.close()
          } catch (e) {
            // Some browsers block window.close(); ignore
          }
          return
        }

        // Fallback: try to read existing session and route accordingly
        const { data: { session } = {} } = await supabase.auth.getSession()
        if (session) {
          if (isActive) navigate('/dashboard', { replace: true })
        } else {
          if (isActive) navigate('/login', { replace: true })
        }
      } catch (err) {
        console.error('Auth callback processing failed:', err)
        if (isActive) navigate('/login', { replace: true })
      }
    }

    processCallback()

    return () => {
      isActive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center auth-bg">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
        <p className="text-slate-500 text-sm font-medium">Finishing sign-in…</p>
      </div>
    </div>
  )
}
