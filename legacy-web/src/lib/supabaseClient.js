import { createClient } from '@supabase/supabase-js'

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL || import.meta.env.EXPO_PUBLIC_SUPABASE_URL
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.EXPO_PUBLIC_SUPABASE_ANON_KEY

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

      if (import.meta.env.DEV) {
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
      if (import.meta.env.DEV) {
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

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. ' +
    'Please create a .env file with VITE_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_URL, ' +
    'and VITE_SUPABASE_ANON_KEY or EXPO_PUBLIC_SUPABASE_ANON_KEY.'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    fetch: createDebugFetch('web'),
  },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
