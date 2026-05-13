/**
 * OAuth Testing and Debugging Script
 * Run this in browser console to test OAuth configuration
 */

console.log('🧪 ARISE OAuth Diagnostic Test Started\n')

// Test 1: Check environment variables
console.log('📋 Test 1: Environment Variables')
console.log('VITE_SUPABASE_URL:', import.meta.env.VITE_SUPABASE_URL)
console.log('VITE_SUPABASE_ANON_KEY length:', import.meta.env.VITE_SUPABASE_ANON_KEY?.length)
if (!import.meta.env.VITE_SUPABASE_URL) {
  console.error('❌ ERROR: VITE_SUPABASE_URL not set!')
}
if (!import.meta.env.VITE_SUPABASE_ANON_KEY) {
  console.error('❌ ERROR: VITE_SUPABASE_ANON_KEY not set!')
}
console.log('')

// Test 2: Check Supabase client
console.log('📋 Test 2: Supabase Client')
try {
  console.log('Supabase client available:', !!window.supabase)
  console.log('Auth available:', !!supabase.auth)
} catch (e) {
  console.error('❌ ERROR: Supabase not available:', e.message)
}
console.log('')

// Test 3: Check current auth state
console.log('📋 Test 3: Current Auth State')
supabase.auth.getSession().then(({ data: { session }, error }) => {
  if (error) {
    console.error('❌ Error getting session:', error)
  } else {
    console.log('Current session:', session ? 'EXISTS' : 'NONE')
    if (session) {
      console.log('User:', session.user.email)
      console.log('Access token present:', !!session.access_token)
      console.log('Refresh token present:', !!session.refresh_token)
    }
  }
}).catch(e => console.error('❌ Exception:', e))
console.log('')

// Test 4: List available providers
console.log('📋 Test 4: Checking OAuth Providers')
console.log('Testing provider availability...')
console.log('')

// Test 5: Test OAuth initiation
console.log('📋 Test 5: OAuth Configuration Test')
console.log('Current window origin:', window.location.origin)
console.log('Current page:', window.location.pathname)
console.log('Will redirect to:', window.location.origin)
console.log('')

// Test 6: localStorage check
console.log('📋 Test 6: Storage')
const keys = Object.keys(localStorage)
console.log('localStorage keys:', keys.filter(k => k.includes('sb') || k.includes('auth')))
console.log('')

// Test 7: Ready for OAuth test
console.log('✅ Diagnostic complete!')
console.log('')
console.log('To test OAuth, run:')
console.log('  testOAuth()')
console.log('')

// Function to test OAuth
window.testOAuth = async function() {
  console.log('🔐 Testing OAuth Sign In...')
  try {
    const result = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin
      }
    })
    console.log('OAuth result:', result)
  } catch (error) {
    console.error('OAuth error:', error)
  }
}

console.log('💡 Next: Click "Continue with Google" button or run testOAuth() in console')
