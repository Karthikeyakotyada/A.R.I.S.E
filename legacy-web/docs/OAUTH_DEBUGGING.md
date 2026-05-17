# 🔍 Google OAuth - Debugging Guide

## Problem: "Google closes immediately without showing email dialog"

This means **Google OAuth is not properly configured in Supabase or Supabase doesn't have Google credentials**.

---

## Step 1: Check Browser Console

1. Open Browser DevTools: `F12` or `Ctrl+Shift+I`
2. Go to **Console** tab
3. Click "Continue with Google"
4. **Look for error messages**

Common errors:
```
"provider_not_enabled"          → Google provider disabled in Supabase
"invalid_grant"                 → Invalid credentials
"redirect_uri_mismatch"         → Redirect URL not configured
"access_denied"                 → Missing permission
"configuration_error"           → OAuth not setup
```

**Screenshot the error and share it!**

---

## Step 2: Verify Supabase Configuration

### Check 1: Is Google Provider Enabled?

1. Open https://app.supabase.com
2. Select your **ARISE** project
3. Go to **Authentication** → **Providers**
4. Look for **Google**

Expected:
- [ ] Google provider exists
- [ ] Google is **ENABLED** (toggle should be ON)
- [ ] Red text showing "Configuration needed" (if credentials missing)

**If you see "Configuration needed in red text":**
→ This is why it's not working! See Step 3.

---

## Step 3: Add Google OAuth Credentials

### Get Google Credentials:

1. Go to https://console.cloud.google.com/
2. Create new project or select existing
3. Search for **"OAuth 2.0 Client IDs"**
4. Or go to: **APIs & Services** → **Credentials**
5. Click **Create Credentials** → **OAuth 2.0 Client ID**
6. Select **Web application**
7. Add URIs:
   - Authorized JavaScript origins: `http://localhost:5173`
   - Authorized JavaScript origins: `http://localhost:3000`
   - Authorized redirect URIs: `http://localhost:5173/`
8. Click **Create**
9. Copy **Client ID** and **Client Secret**

### Add to Supabase:

1. Go to Supabase → Authentication → Providers
2. Click **Google**
3. Paste:
   - **Client ID** (from Google Cloud)
   - **Client Secret** (from Google Cloud)
4. Click **Save**

**Important**: You should see green "Enabled" text after saving.

---

## Step 4: Configure Redirect URLs

### In Supabase:

1. Supabase → Authentication → Providers → Google
2. Look for **Redirect URL** section (usually shows a code snippet)
3. It should look like:
   ```
   http://localhost:5173/auth/callback
   ```
4. **Copy this exact URL**

### In Google Cloud Console:

1. Go back to: APIs & Services → Credentials
2. Find your OAuth 2.0 Client ID
3. Click to edit
4. Under **Authorized redirect URIs**, add:
   ```
   http://localhost:5173/auth/callback
   ```
5. **Save**

---

## Step 5: Test Again

1. **Restart dev server**: `npm run dev`
2. Go to `http://localhost:5173/login`
3. Click "Continue with Google"
4. **Check if Google dialog appears now**

---

## If Still Not Working

### Debug Checklist:

- [ ] Google provider shows "ENABLED" in Supabase (not "Configuration needed")
- [ ] Client ID is set in Supabase
- [ ] Client Secret is set in Supabase
- [ ] Redirect URL matches in Google Cloud AND Supabase
- [ ] Dev server restarted after any changes
- [ ] Browser cache cleared: `Ctrl+Shift+Delete`
- [ ] localStorage cleared: Browser DevTools → Application → Storage → Clear All

### Clear Everything:

```javascript
// In Browser Console:
localStorage.clear()
sessionStorage.clear()
location.reload()
```

---

## Check ENV Variables

In browser console:
```javascript
// Check if Supabase is initialized:
console.log(supabase)

// Check URL (make sure it's production Supabase URL):
console.log(import.meta.env.VITE_SUPABASE_URL)
```

Should show your Supabase project URL starting with `https://`

---

## Network Debugging

1. Open DevTools → **Network** tab
2. Click "Continue with Google"
3. Look for requests:
   - Should see request to `supabase.co`
   - Should see redirect to `accounts.google.com`
4. Click each request to see details
5. Look for error responses (4xx or 5xx status codes)

---

## Critical Issues & Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| "Popup closed immediately" | OAuth not configured | Add Google credentials to Supabase |
| "Popup blocked" | Browser blocking | Allow popups for localhost |
| "Redirect URL mismatch" | URLs don't match | Verify exact URL in Google & Supabase |
| "No Google option visible" | Provider disabled | Enable Google in Supabase |
| "Invalid_grant error" | Bad credentials | Re-create OAuth credentials |
| "Configuration_error" | Supabase not setup | Check Supabase Auth config |

---

## Exact Steps (Copy-Paste Guide)

### Step 1: Get Credentials (5 minutes)
```
1. Visit: https://console.cloud.google.com/
2. Login with your Google account
3. Create new project: "ARISE OAuth"
4. Search bar → type "OAuth consent screen"
5. Click on it → Create
6. Fill: App name (ARISE), User support email, Developer email
7. Click "Save & Continue"
8. Skip optional scopes → "Save & Continue"
9. Skip test users → "Save & Continue"
10. Go to: APIs & Services → Credentials
11. Click "+ Create Credentials" → "OAuth client ID"
12. Choose: Web application
13. Name: "ARISE Web"
14. Add origin: http://localhost:5173
15. Add origin: http://localhost:3000
16. Add redirect: http://localhost:5173/auth/callback
17. Click Create
18. Copy shown: Client ID and Client Secret (both highlighted)
```

### Step 2: Add to Supabase (2 minutes)
```
1. Visit: https://app.supabase.com/
2. Select your ARISE project
3. Left menu → Authentication
4. Click "Providers"
5. Find "Google" row
6. Click to expand it
7. Toggle it ON (should become blue)
8. Paste Client ID in field
9. Paste Client Secret in field
10. Click "Save"
11. Wait for green checkmark
12. DO NOT close this page
```

### Step 3: Verify Redirect URL
```
1. Still on Supabase Providers page
2. Look at Google provider
3. Find "Redirect URL" field
4. Copy the URL shown
5. Go to Google Cloud Console
6. APIs & Services → Credentials
7. Click your OAuth Client ID to edit
8. Add the copied URL to "Authorized redirect URIs"
9. Click "Save"
```

### Step 4: Test
```
1. Close all browser tabs
2. Open new tab: http://localhost:5173/login
3. Click "Continue with Google"
4. Should see Google login dialog now!
```

---

## Still Not Working?

**Share these details in your error report:**

1. Screenshot of Supabase Providers page showing Google provider
2. Screenshot of browser console showing any errors
3. Screenshot of Google Cloud Console showing your OAuth client
4. Your Supabase project URL (the one in Vite env variables)
5. Error message from Google (if any)

---

## Quick Diagnostic Script

Paste in Browser Console:

```javascript
// Check Supabase setup
console.log('Supabase URL:', import.meta.env.VITE_SUPABASE_URL)
console.log('Supabase Key:', import.meta.env.VITE_SUPABASE_ANON_KEY?.slice(0, 10) + '...')

// Check if user is logged in
supabase.auth.getUser().then(({ data: { user }, error }) => {
  console.log('Current user:', user)
  console.log('User error:', error)
})

// Check all keys in localStorage
console.log('localStorage keys:', Object.keys(localStorage))

// Try OAuth
console.log('Attempting OAuth...')
supabase.auth.signInWithOAuth({
  provider: 'google',
  options: { redirectTo: window.location.origin }
}).then(({ data, error }) => {
  console.log('OAuth attempt result:', { data, error })
})
```

Run this and share the output!

---

## Most Common Fix

**99% of the time it's one of these:**

1. **Google provider not enabled in Supabase**
   - Fix: Toggle ON in Providers page

2. **Credentials missing**
   - Fix: Add Client ID and Secret from Google Cloud

3. **Redirect URL mismatch**
   - Fix: Use EXACT same URL in both Supabase and Google Cloud

4. **Browser cache**
   - Fix: Clear with Ctrl+Shift+Delete and restart dev server

Try these first!

---

## Support

If issue persists after trying above:
1. Run diagnostic script above
2. Share ALL console errors
3. Share Supabase provider configuration screenshot
4. Share Google Cloud Console OAuth client screenshot
