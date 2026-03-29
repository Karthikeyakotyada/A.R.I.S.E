import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'
import { Platform } from 'react-native'

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY

const projectRef = supabaseUrl?.replace(/^https?:\/\//, '').split('.')[0]
const authStorageKey = projectRef
  ? `arise-mobile-auth-${projectRef}`
  : 'arise-mobile-auth'

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Expo env vars. Configure EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in your .env file.'
  )
}

export function isInvalidRefreshTokenError(error) {
  const message = error?.message || error?.error_description || ''
  return /invalid refresh token|refresh token not found|jwt expired|invalid jwt/i.test(
    String(message)
  )
}

export async function clearLocalAuthSession() {
  try {
    await supabase.auth.signOut({ scope: 'local' })
  } catch {
    // Best-effort cleanup.
  }
}

export async function ensureValidSession() {
  try {
    const { data, error } = await supabase.auth.getSession()
    if (error) throw error

    const session = data?.session ?? null
    if (!session) return null

    const expiresAtMs = Number(session.expires_at || 0) * 1000
    const isNearExpiry = expiresAtMs > 0 && expiresAtMs - Date.now() < 60 * 1000

    if (!isNearExpiry) return session

    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession()
    if (refreshError) throw refreshError
    return refreshed?.session ?? null
  } catch (error) {
    if (isInvalidRefreshTokenError(error)) {
      await clearLocalAuthSession()
      return null
    }
    throw error
  }
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    storageKey: authStorageKey,
    persistSession: true,
    autoRefreshToken: Platform.OS !== 'web',
    detectSessionInUrl: false,
  },
})