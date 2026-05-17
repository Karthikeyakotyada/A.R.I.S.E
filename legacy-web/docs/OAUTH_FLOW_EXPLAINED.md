# Google OAuth Flow - Technical Deep Dive

## The Problem We Fixed

**Before**: After Google authentication, the frontend would get the OAuth callback but wouldn't detect it, leaving the user on the login page.

**Root Cause**: The OAuth session data needed to be extracted from the callback URL and properly detected by the auth state listener.

## How OAuth 2.0 Works (Simplified)

```
User → Click "Sign in with Google"
  ↓
App → Redirect to Google's auth page
  ↓
Google ← User authenticates & consents
  ↓
Google → Redirect back to app with code: ?code=ABC123XYZ
  ↓
App → Exchange code for session token (server-side at Supabase)
  ↓
Supabase → Return session token to app
  ↓
App → Store session, log user in
```

## ARISE OAuth Flow - Step by Step

### Step 1: User Clicks "Continue with Google"

**File**: `src/pages/Login.jsx`

```javascript
const handleGoogleSignIn = async () => {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/dashboard`,
    },
  })
}
```

**What Happens**:
1. `signInWithOAuth()` initiates OAuth flow
2. Supabase generates OAuth state and nonce (PKCE security)
3. User is redirected to Google sign-in page
4. `redirectTo` option tells Supabase where to send user after auth

### Step 2: User Authenticates with Google

1. User enters Google credentials
2. User grants ARISE permission to access email and profile
3. Google generates authorization code

### Step 3: Google Redirects Back to App

```
Browser URL becomes:
http://localhost:5173/dashboard#code=ABC123XYZ&state=XYZ789ABC
```

**Key Points**:
- URL contains `#code=...` (hash fragment, not query param)
- URL also contains `state` for CSRF protection
- User is redirected to `redirectTo` URL we specified

### Step 4: Supabase Client Extracts Session

**File**: `src/lib/supabaseClient.js`

```javascript
const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    detectSessionInUrl: true,  // ← THIS IS KEY!
    persistSession: true,
    autoRefreshToken: true,
  },
})
```

**What Happens**:
- `detectSessionInUrl: true` tells Supabase to look for OAuth params in URL
- Supabase extracts `code` from URL hash
- Supabase exchanges code for session token (server-side)
- Session is extracted and validated

### Step 5: AuthContext Detects Session Change

**File**: `src/context/AuthContext.jsx`

```javascript
useEffect(() => {
  // 1. Get initial session from URL/localStorage
  const { data: { session } } = await supabase.auth.getSession()
  setUser(session?.user ?? null)

  // 2. Listen for auth state changes
  const { subscription } = supabase.auth.onAuthStateChange(
    (event, currentSession) => {
      if (event === 'SIGNED_IN') {
        setUser(currentSession.user)
        // ← React detects user state changed!
      }
    }
  )
}, [])
```

**Timeline**:
1. Component mounts
2. `getSession()` reads from URL/localStorage
3. If session found, user is set immediately
4. `onAuthStateChange()` listener fires with `SIGNED_IN` event
5. AuthContext updates user state (React re-renders)

### Step 6: App Routes Respond to User State

**File**: `src/App.jsx`

```javascript
const { user, loading } = useAuth()

// Check every time user state changes
return (
  <Routes>
    {/* Login page - hide if user exists */}
    <Route 
      path="/login" 
      element={user ? <Navigate to="/dashboard" /> : <Login />}
    />
    
    {/* Protected routes - show only if user exists */}
    <Route element={<ProtectedRoute />}>
      <Route path="/dashboard" element={<Dashboard />} />
    </Route>
  </Routes>
)
```

**What Happens**:
1. AuthContext sets user state
2. App.jsx `useAuth()` hook receives new user value
3. Router re-evaluates path based on user state
4. `<Navigate to="/dashboard">` redirects user
5. Dashboard component renders

## Session Persistence Explained

### How Session Stays Alive

```javascript
{
  auth: {
    persistSession: true,    // Save to browser storage
    autoRefreshToken: true,  // Refresh before expiration
  }
}
```

### On First Login

```
1. Google OAuth → Session token received
2. Supabase stores in localStorage:
   - Access token (expires in ~1 hour)
   - Refresh token (expires in ~1 week)
   - User data
3. User can close browser
```

### On Next Visit

```
1. App mounts
2. AuthContext calls getSession()
3. Supabase reads from localStorage
4. If valid → User is logged in
5. If access token expired:
   - autoRefreshToken uses refresh token
   - New access token obtained
   - User stays logged in
```

### On Logout

```
1. User clicks "Sign out"
2. signOut() called
3. Supabase clears localStorage
4. onAuthStateChange fires SIGNED_OUT
5. User state cleared
6. Router redirects to /login
```

## URL Structure After OAuth

### What the URL Looks Like

```
Before OAuth:
http://localhost:5173/login

During OAuth (redirected to Google):
https://accounts.google.com/o/oauth2/v2/auth?
  client_id=XXXX.apps.googleusercontent.com&
  redirect_uri=http://localhost:5173/dashboard&
  response_type=code&
  scope=email%20profile&
  state=abc123...

After OAuth (redirected back):
http://localhost:5173/dashboard#code=4/0AX4XfWj...&state=abc123...
```

### URL Fragment vs Query String

```
Fragment (#):  http://example.com/page#code=ABC
  - Not sent to server
  - Used by Supabase client-side
  
Query (?):     http://example.com/page?code=ABC
  - Sent to server
  - Can be logged/cached
  - Less secure for sensitive data

Supabase uses fragment for security!
```

## Error Scenarios

### Scenario 1: Redirect URL Not Configured

```
User clicks "Sign in with Google"
  ↓
Supabase initiates OAuth
  ↓
Google redirects to redirectTo URL
  ↓
Supabase rejects because URL not in allowed list
  ↓
Error: "Invalid redirect_uri"
```

**Fix**: Add redirect URL to Supabase provider settings

### Scenario 2: VITE Variables Not Set

```
App starts
  ↓
supabaseClient.js tries to load VITE_SUPABASE_URL
  ↓
Variable is undefined (not loaded)
  ↓
Error: "Missing Supabase environment variables"
```

**Fix**: 
1. Restart dev server
2. Check .env has VITE_ prefix (not EXPO_PUBLIC_)

### Scenario 3: OAuth Popup Blocked

```
User clicks "Sign in with Google"
  ↓
Browser blocks popup
  ↓
Google popup never appears
  ↓
User clicks button again (nothing happens)
```

**Fix**: Disable popup blocker or allow popups for localhost

## OAuth Security: PKCE Explained

Supabase uses **PKCE** (Proof Key for Code Exchange) for security:

```
Client generates random string: code_verifier
  ↓
Hash it: code_challenge = SHA256(code_verifier)
  ↓
Send to Google: ?code_challenge=...
  ↓
Google authorizes and returns code
  ↓
Client exchanges code + code_verifier for token
  ↓
Only valid code_verifier accepted (prevents code interception)
```

**Why?** Browser apps can't securely store client secrets, so PKCE proves the same app requesting the token is the one that started the auth flow.

## Event Types in onAuthStateChange

```javascript
supabase.auth.onAuthStateChange((event, session) => {
  // SIGNED_IN - User just logged in (OAuth or email/password)
  // SIGNED_OUT - User just logged out
  // USER_UPDATED - User data changed (profile update, etc.)
  // INITIAL_SESSION - Session restored from storage (on app load)
  // TOKEN_REFRESHED - Access token auto-refreshed
  // PASSWORD_RECOVERY - Password reset initiated
})
```

## Token Lifecycle

```
OAuth Response:
{
  access_token: "eyJ..." (valid for ~1 hour),
  refresh_token: "eyJ..." (valid for ~1 week),
  expires_in: 3600 (seconds),
  user: { id, email, ... }
}

At 55 minutes:
  autoRefreshToken detects expiration approaching
  ↓
  Sends refresh_token to Supabase
  ↓
  Gets new access_token
  ↓
  User never logged out
  ↓
  Session extends another hour
```

## Debugging Tips

### Check if Session Detected

```javascript
// In browser console:
const { data } = await supabase.auth.getSession()
console.log('Session:', data.session)
// Should show session object if logged in
```

### Monitor Auth Events

```javascript
const { data: { subscription } } = supabase.auth.onAuthStateChange(
  (event, session) => {
    console.log('Auth event:', event)  // Log all events
    console.log('Session:', session)
  }
)
```

### Check localStorage

```javascript
// In browser console:
// See all stored data
Object.keys(localStorage).forEach(key => {
  console.log(key, localStorage.getItem(key))
})

// Specifically the auth token:
localStorage.getItem('sb-fnneeunwmjuhzcagiclv-auth-token')
```

### Monitor Network Requests

```
Open DevTools → Network tab
Filter for: /auth or /token
Look for:
  1. Initial OAuth redirect
  2. Token exchange request
  3. Subsequent API calls with auth header
```

## Testing the Full Flow

### Manual Test Script

```javascript
// 1. Check initial state
console.log('User before login:', await supabase.auth.getUser())

// 2. Click Google button and authenticate...

// 3. Check state after login
setTimeout(() => {
  console.log('User after login:', await supabase.auth.getUser())
  console.log('Session token:', localStorage.getItem('sb-...'))
}, 2000)

// 4. Refresh page
// User should stay logged in

// 5. Logout
await supabase.auth.signOut()
console.log('User after logout:', await supabase.auth.getUser())

// 6. Verify cleared
console.log('Tokens after logout:', localStorage.getItem('sb-...'))
```

## Summary

1. **OAuth Initiation** → `signInWithOAuth()` redirects to Google
2. **User Auth** → User signs in with Google
3. **Code Exchange** → Google returns code, Supabase exchanges for token
4. **Session Detection** → `detectSessionInUrl` extracts session
5. **State Update** → `onAuthStateChange` fires, AuthContext updates
6. **Auto Redirect** → App routes respond to user state change
7. **Persistence** → Session saved to localStorage via `persistSession`
8. **Rehydration** → On reload, `getSession()` restores from localStorage
9. **Auto Refresh** → Token refreshed before expiration via `autoRefreshToken`
10. **Logout** → `signOut()` clears session, user redirected to login

**Result**: Seamless, secure authentication with session persistence! 🎉
