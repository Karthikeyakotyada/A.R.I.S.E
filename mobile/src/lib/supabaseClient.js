import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'
import { Platform } from 'react-native'
import { isLikelyNetworkError } from './network'
import { getSupabaseAnonKey, getSupabaseUrl } from './env'

const supabaseUrl = getSupabaseUrl()
const supabaseAnonKey = getSupabaseAnonKey()

const projectRef = supabaseUrl?.replace(/^https?:\/\//, '').split('.')[0]
const authStorageKey = projectRef
  ? `arise-mobile-auth-${projectRef}`
  : 'arise-mobile-auth'
const legacyAuthStorageKeys = [
  authStorageKey,
  projectRef ? `sb-${projectRef}-auth-token` : null,
  'supabase.auth.token',
].filter(Boolean)

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Expo env vars. Configure EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in your .env file.'
  )
}

function createDebugFetch(label) {
  const baseFetch = globalThis.fetch?.bind(globalThis)

  if (!baseFetch) {
    return undefined
  }

  return async (input, init) => {
    const requestUrl = typeof input === 'string' ? input : input?.url || String(input)
    const method = init?.method || (typeof input === 'object' && input?.method) || 'GET'
    const startedAt = Date.now()

    try {
      const response = await baseFetch(input, init)

      if (__DEV__) {
        console.info('[ARISE][supabase]', {
          label,
          requestUrl,
          method,
          status: response.status,
          statusText: response.statusText,
          ms: Date.now() - startedAt,
        })
      }

      return response
    } catch (error) {
      if (__DEV__) {
        console.error('[ARISE][supabase]', {
          label,
          requestUrl,
          method,
          ms: Date.now() - startedAt,
          errorName: error?.name,
          errorMessage: error?.message,
          errorCode: error?.code,
          causeName: error?.cause?.name,
          causeMessage: error?.cause?.message,
          causeCode: error?.cause?.code,
        })
      }

      throw error
    }
  }
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

  // Clear both current and legacy auth cache keys to avoid stale refresh-token loops.
  await Promise.all(
    legacyAuthStorageKeys.map((key) =>
      AsyncStorage.removeItem(key).catch(() => undefined)
    )
  )
}

export async function runAuthRequestWithRecovery(request) {
  const first = await request()
  if (!first?.error || !isInvalidRefreshTokenError(first.error)) {
    return first
  }

  await clearLocalAuthSession()
  return request()
}

function parseOAuthCallbackUrl(redirectUrl) {
  if (!redirectUrl) return {}

  const parsed = new URL(redirectUrl)
  const query = Object.fromEntries(parsed.searchParams.entries())
  const hash = parsed.hash.startsWith('#') ? parsed.hash.slice(1) : parsed.hash
  const hashParams = hash
    ? Object.fromEntries(new URLSearchParams(hash).entries())
    : {}

  return {
    ...query,
    ...hashParams,
  }
}

export async function finalizeOAuthRedirect(redirectUrl) {
  const params = parseOAuthCallbackUrl(redirectUrl)

  if (params.error || params.error_description) {
    throw new Error(String(params.error_description || params.error || 'OAuth sign-in failed.'))
  }

  if (params.access_token && params.refresh_token) {
    const { data, error } = await supabase.auth.setSession({
      access_token: String(params.access_token),
      refresh_token: String(params.refresh_token),
    })

    if (error) throw error
    return data?.session ?? null
  }

  const authCode = params.code
  if (authCode) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(String(authCode))
    if (error) throw error
    return data?.session ?? null
  }

  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  return data?.session ?? null
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

    if (isLikelyNetworkError(error?.message || '')) {
      return null
    }

    throw error
  }
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    fetch: createDebugFetch('native'),
  },
  auth: {
    storage: AsyncStorage,
    storageKey: authStorageKey,
    persistSession: true,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
})