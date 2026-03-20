import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY

const projectRef = supabaseUrl?.replace(/^https?:\/\//, '').split('.')[0]
const authStorageKey = projectRef ? `arise-mobile-auth-${projectRef}` : 'arise-mobile-auth'

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Expo env vars. Configure EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    storageKey: authStorageKey,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
})
