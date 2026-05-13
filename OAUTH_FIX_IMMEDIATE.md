# 🚨 CRITICAL: Google OAuth Not Working - Fix Guide

## The Issue You're Experiencing

> "Google popup closes immediately without showing the email dialog"

This 100% means **Google OAuth is not configured in Supabase**.

---

## Quick Fix (Do This First!)

### Step 1: Check Supabase Console (2 minutes)

1. Open: https://app.supabase.com/
2. Select your **ARISE** project
3. Click **Authentication** (left sidebar)
4. Click **Providers**
5. Find **Google** in the list

**Look for this:**
```
Google    [Enable toggle]    ⚠️ "Configuration needed"
```

If you see **"Configuration needed" in RED text**, that's your problem!

---

### Step 2: Enable Google OAuth Provider

**You need Google OAuth credentials from Google Cloud Console:**

#### Get Google Credentials (First time only):

1. Open: https://console.cloud.google.com
2. **Create new project** (or use existing):
   - Click project dropdown at top
   - Click "NEW PROJECT"
   - Name it: "ARISE"
   - Click Create
3. **Set up OAuth consent screen:**
   - Search for "OAuth consent screen"
   - Click on it
   - Select "External" user type
   - Click Create
   - Fill form:
     - App name: ARISE
     - User support email: your-email@gmail.com
     - Developer contact: your-email@gmail.com
   - Click "Save & Continue"
   - Skip scopes (just click "Save & Continue")
   - Skip test users (just click "Save & Continue")
   - Done!

4. **Create OAuth Client ID:**
   - Go to: **APIs & Services** → **Credentials**
   - Click **+ Create Credentials**
   - Choose **OAuth 2.0 Client ID**
   - Select: **Web application**
   - Add authorized origins:
     ```
     http://localhost:5173
     http://localhost:3000
     ```
   - Add authorized redirect URIs:
     ```
     http://localhost:5173/auth/callback
     http://localhost:3000/auth/callback
     ```
   - Click **Create**
   - **COPY THIS:**
     - Client ID (looks like: `xxx.apps.googleusercontent.com`)
     - Client Secret (looks like: `GOCSPX-xxx`)

#### Add to Supabase:

1. Go back to: https://app.supabase.com/
2. Your ARISE project → **Authentication** → **Providers**
3. Click **Google** row to expand
4. **Paste:**
   - Client ID → field 1
   - Client Secret → field 2
5. Click **Save**
6. Wait for green checkmark ✓

**Now Google should show "ENABLED" (not "Configuration needed")**

---

### Step 3: Configure Redirect URL

**Important: Supabase and Google must have matching redirect URLs**

1. Still in Supabase Providers page
2. Look at the Google section
3. Find the line: **"Redirect URL"**
4. Should show something like:
   ```
   http://localhost:5173/auth/callback
   ```
5. **COPY this exact URL**

6. Go to Google Cloud Console:
   - APIs & Services → Credentials
   - Click your OAuth Client ID to edit
   - Under **"Authorized redirect URIs"**
   - Make sure this exact URL is listed:
     ```
     http://localhost:5173/auth/callback
     ```
   - If not, add it and click **Save**

---

### Step 4: Test It

1. **Close all browser tabs**
2. **Restart dev server:**
   ```bash
   # Stop current: Ctrl+C
   npm run dev
   ```
3. Open: http://localhost:5173/login
4. Click **"Continue with Google"**
5. **Should see Google login dialog now!** ✓

---

## Still Not Working?

### Troubleshooting

**Check 1: Did you restart dev server?**
```bash
# Stop with Ctrl+C, then:
npm run dev
```

**Check 2: Clear browser cache**
```
Keyboard: Ctrl+Shift+Delete
Select "All time"
Check: Cache, Cookies, Stored data
Click Clear
```

**Check 3: Clear localStorage**
```javascript
// In browser console:
localStorage.clear()
sessionStorage.clear()
location.reload()
```

**Check 4: Verify environment variables**
```javascript
// In browser console:
console.log(import.meta.env.VITE_SUPABASE_URL)
```
Should show your Supabase URL (e.g., `https://fnneeunwmjuhzcagiclv.supabase.co`)

**Check 5: Run diagnostic**
In browser console, copy and paste this:
```javascript
console.log('Supabase URL:', import.meta.env.VITE_SUPABASE_URL)
console.log('Key exists:', !!import.meta.env.VITE_SUPABASE_ANON_KEY)
supabase.auth.getSession().then(r => console.log('Session:', r))
```

---

## Google Provider Status Check

Go to https://app.supabase.com/ and check:

```
✅ CORRECT (should look like this):
Google    [✓ Enabled]    
  ├── Client ID: 12345...
  ├── Client Secret: GOCSPX-...
  └── Status: Enabled

❌ WRONG (if you see this):
Google    [○ Not enabled]    ⚠️ "Configuration needed"
  └── Status: Configuration needed
```

---

## Common Errors & Fixes

| Error Message | Cause | Fix |
|---|---|---|
| `provider_not_enabled` | Google not enabled in Supabase | Enable Google in Providers |
| `invalid_client` | Wrong Client ID/Secret | Re-check credentials |
| `redirect_uri_mismatch` | URLs don't match | Verify redirect URLs match exactly |
| Popup closes immediately | No credentials configured | Add Google credentials |
| "Configuration needed" shown | OAuth not setup | Complete all steps above |

---

## Screenshots to Check

### What You Should See in Supabase:

**BEFORE (Wrong):**
```
Google    [○]    Configuration needed
```

**AFTER (Correct):**
```
Google    [✓]    
  Client ID: [filled]
  Client Secret: [filled]
```

---

## Verification Checklist

- [ ] Supabase Google provider shows **"ENABLED"** (not "Configuration needed")
- [ ] Client ID is filled in Supabase
- [ ] Client Secret is filled in Supabase
- [ ] Redirect URL in Supabase matches Google Cloud Console
- [ ] Dev server restarted after changes
- [ ] Browser cache cleared
- [ ] localStorage cleared
- [ ] Google button visible on login page
- [ ] Clicking button opens Google dialog (not closes immediately)

---

## Expected Behavior (After Fix)

1. **User clicks** "Continue with Google"
   ↓
2. **Google dialog appears** (not closes!)
   ↓
3. **User sees:** "Sign in with Google"
   ↓
4. **User selects** email account
   ↓
5. **User enters** password
   ↓
6. **Redirects to** app dashboard
   ↓
7. **Shows user** name and email
   ✅ **SUCCESS!**

---

## FASTEST FIX (Copy-Paste)

**If you have existing Google credentials:**

1. Google Client ID: `[paste here]`
2. Google Client Secret: `[paste here]`
3. Go to: https://app.supabase.com/ → ARISE project → Authentication → Providers
4. Expand Google
5. Paste both values
6. Click Save
7. Done!

---

## Production Setup (Later)

Once local testing works, for production add:

**In Google Cloud Console redirect URIs:**
```
https://yourdomain.com/auth/callback
https://yourdomain.com
```

**In Supabase Providers:**
Nothing changes - Supabase handles production URLs automatically

---

## Still Stuck?

**When asking for help, provide:**

1. Screenshot of Supabase Providers page (Google section)
2. Screenshot of browser console when you click Google button
3. Your Supabase project URL (the one in .env)
4. Exact error message from browser console

---

## 🎉 You're Done!

After completing all steps above, Google OAuth will work!

**The key:** Make sure Supabase shows **"ENABLED"** for Google provider (not "Configuration needed")

If you still see "Configuration needed", you're missing Client ID or Client Secret!
