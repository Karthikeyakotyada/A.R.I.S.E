# ARISE Authentication Setup Guide

## Overview
This document explains the complete Google OAuth authentication flow and session persistence in the ARISE application.

## Features Implemented

### 1. Google OAuth Sign-In/Sign-Up
- **Login Page**: "Continue with Google" button redirects to Google OAuth
- **Signup Page**: "Sign up with Google" button for new users
- **Clean UI**: Modern button with Google branding

### 2. Session Persistence
- **Auto Session Detection**: Supabase automatically detects sessions from URL params after OAuth callback
- **Auth State Listener**: `onAuthStateChange()` tracks login/logout events
- **Local Storage**: Supabase persists session to browser storage via `persistSession: true`

### 3. Automatic Redirection
- **Authenticated Users**: Automatically redirect to `/dashboard` on login
- **Unauthenticated Users**: Automatically redirect to `/login` if trying to access protected routes
- **Loading State**: Full-page spinner shows while auth state is being determined

### 4. Session Persistence Options
The app maintains user sessions across:
- Page refresh
- Browser restart
- Closing and reopening the app

### 5. Logout
- **Sign Out Button**: Available in Profile page via `signOut()`
- **Session Cleanup**: Automatically clears stored session and tokens

## Environment Variables

Add the following to `.env`:

```env
# Web (Vite)
VITE_SUPABASE_URL=https://fnneeunwmjuhzcagiclv.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_zw4j5k3_OxtmF16l3M_M3Q_vRD0-puA
VITE_GEMINI_API_KEY=your_api_key_here
VITE_GEMINI_MODEL=google/gemini-2.0-flash-001
```

## Supabase Configuration

### Required Settings in Supabase Dashboard

1. **Enable Google OAuth Provider**:
   - Go to Authentication → Providers
   - Enable Google provider
   - Add your Google OAuth credentials

2. **Configure Redirect URLs**:
   - Add your localhost URL: `http://localhost:5173/dashboard`
   - Add your production URL: `https://yourdomain.com/dashboard`
   - Add your production URL: `https://yourdomain.com/` (root)

3. **Email Settings** (Optional):
   - Configure email templates for verification (if needed)

## Code Flow

### Authentication Context (`src/context/AuthContext.jsx`)

1. **On Mount**:
   ```javascript
   // Get initial session from localStorage/URL params
   const session = await supabase.auth.getSession()
   ```

2. **Listen for Changes**:
   ```javascript
   const { subscription } = supabase.auth.onAuthStateChange(
     (event, session) => {
       // SIGNED_IN, SIGNED_OUT, USER_UPDATED events
       updateUserState(session)
     }
   )
   ```

3. **Session Detection**:
   - OAuth callback URL includes session token: `?code=...&session=...`
   - Supabase client automatically extracts and validates
   - `onAuthStateChange()` fires with `SIGNED_IN` event

### Login Flow

1. User clicks "Continue with Google"
2. `signInWithOAuth({ provider: 'google' })` opens Google popup
3. User authenticates with Google
4. Google redirects to `redirectTo` URL with session token
5. Supabase validates token and stores session
6. `onAuthStateChange()` fires with new session
7. AuthContext updates `user` state
8. App detects user state and redirects to `/dashboard`

### Protected Routes

```javascript
// App.jsx checks user state
const { user, loading } = useAuth()

if (loading) return <Spinner />  // Show loader while checking auth

// Public routes - redirect to dashboard if logged in
<Route path="/login" element={user ? <Navigate to="/dashboard" /> : <Login />} />

// Protected routes - redirect to login if not logged in
<Route element={<ProtectedRoute />}>
  {/* App shell and dashboard routes */}
</Route>
```

### Session Persistence Mechanism

**Supabase Client Configuration**:
```javascript
{
  auth: {
    persistSession: true,      // Save to localStorage
    autoRefreshToken: true,    // Auto-refresh expiring tokens
    detectSessionInUrl: true,  // Extract session from URL after OAuth
  }
}
```

**What Happens**:
1. After successful auth, Supabase stores in `localStorage`:
   - Session tokens
   - User metadata
   - Refresh token
2. On page load, `getSession()` reads from localStorage
3. If token is expired, `autoRefreshToken` refreshes it automatically
4. User stays logged in until explicitly signing out

## Logout Implementation

**Profile Page** (`src/pages/Profile.jsx`):
```javascript
async function handleSignOut() {
  await signOut()  // Calls supabase.auth.signOut()
  navigate('/login', { replace: true })
}
```

**What Happens**:
1. `signOut()` clears Supabase session from localStorage
2. Clears authentication tokens
3. `onAuthStateChange()` fires with `SIGNED_OUT` event
4. AuthContext clears user state
5. App redirects to login

## Handling OAuth Errors

**Login/Signup Pages** handle:
- Missing provider configuration
- Network errors during authentication
- User cancellation of OAuth popup

Error messages are shown to user without exposing sensitive details.

## Security Considerations

1. **PKCE Flow**: Supabase uses OAuth 2.0 PKCE for browser apps
2. **Secure Storage**: Tokens stored in localStorage (not XSS-vulnerable areas)
3. **Token Rotation**: Automatic token refresh before expiration
4. **CORS**: Supabase handles CORS for OAuth flow

## Testing the Authentication Flow

### Manual Testing

1. **Google Sign-In**:
   - Click "Continue with Google" on login page
   - Authenticate with test Google account
   - Verify redirect to dashboard

2. **Session Persistence**:
   - Log in and refresh page
   - Verify user stays logged in
   - Close and reopen browser
   - Verify session persists

3. **Logout**:
   - Go to Profile page
   - Click "Sign out"
   - Verify redirect to login
   - Verify session is cleared (open DevTools → Application → localStorage)

4. **Protected Routes**:
   - Logout and try accessing `/dashboard`
   - Verify redirect to `/login`
   - Login and access `/dashboard`
   - Verify page loads correctly

### Browser DevTools Inspection

**Check localStorage**:
```javascript
// Open DevTools → Application → Local Storage
// You should see:
localStorage.getItem('sb-fnneeunwmjuhzcagiclv-auth-token')
```

**Check Network Tab**:
- OAuth redirect includes `?code=...` parameter
- Supabase exchanges code for session token
- Subsequent requests include Authorization header

## Troubleshooting

### User Stays on Login Page After Google Sign-In

**Causes & Solutions**:

1. **OAuth redirect URL not configured**:
   - Go to Supabase → Authentication → Providers → Google
   - Add your app URL to "Redirect URLs"
   - Ensure URL matches exactly (including protocol and port)

2. **Session not being detected**:
   - Check browser DevTools → Network tab
   - Verify OAuth redirect includes `?code=...` parameter
   - Check localStorage has `sb-*-auth-token`

3. **VITE_ env variables not loaded**:
   - Restart dev server: `npm run dev`
   - Verify `.env` file has `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
   - Check browser console for env errors

### "Missing Supabase environment variables" Error

**Solution**:
1. Ensure `.env` file exists in project root
2. File must contain:
   ```env
   VITE_SUPABASE_URL=https://...
   VITE_SUPABASE_ANON_KEY=sb_...
   ```
3. Restart dev server
4. Clear browser cache and local storage

### User Session Persists After Logout

**Solution**:
- Clear browser storage:
  ```javascript
  // DevTools Console
  localStorage.clear()
  sessionStorage.clear()
  ```
- Ensure `signOut()` is being called in logout handler
- Check browser DevTools → Network for successful signout request

## Production Deployment

### Pre-Deployment Checklist

1. ✅ Configure production Supabase project
2. ✅ Add production domain to OAuth redirect URLs
3. ✅ Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in production
4. ✅ Build and test: `npm run build && npm run preview`
5. ✅ Test Google OAuth flow in production URL
6. ✅ Verify session persistence works in production

### Production Environment Variables

```env
# Use production Supabase project credentials
VITE_SUPABASE_URL=https://your-prod-supabase.supabase.co
VITE_SUPABASE_ANON_KEY=your-prod-anon-key
```

## File Structure

```
src/
├── context/
│   └── AuthContext.jsx           # Auth state management & listeners
├── pages/
│   ├── Login.jsx                 # Login with Google OAuth
│   ├── Signup.jsx                # Signup with Google OAuth
│   └── Profile.jsx               # User profile & logout
├── components/
│   ├── ProtectedRoute.jsx        # Route guard for authenticated users
│   └── AppShell.jsx              # Main layout & navigation
└── lib/
    └── supabaseClient.js         # Supabase client configuration
```

## API References

### Supabase Auth Methods Used

```javascript
// Sign in with OAuth
supabase.auth.signInWithOAuth({
  provider: 'google',
  options: { redirectTo: url }
})

// Get current session
const { data: { session } } = await supabase.auth.getSession()

// Listen for auth changes
const { data: { subscription } } = supabase.auth.onAuthStateChange(
  (event, session) => {}
)

// Sign out
await supabase.auth.signOut()
```

## Related Documentation

- [Supabase Auth Docs](https://supabase.com/docs/guides/auth)
- [Supabase OAuth Providers](https://supabase.com/docs/guides/auth/social-login)
- [React Router Protected Routes](https://reactrouter.com/start/library/protecting-routes)

## Support

For issues or questions:
1. Check browser console for error messages
2. Check Supabase dashboard for auth logs
3. Verify all environment variables are set correctly
4. Ensure Google OAuth credentials are valid
5. Test with different browser in incognito mode to clear any cached data
