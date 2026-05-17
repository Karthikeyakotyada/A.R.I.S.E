# ARISE – AI Health Companion

**ARISE** helps users track, analyze, and understand health reports using AI, with Supabase for auth and storage.

## Architecture

| Path | Purpose |
|------|---------|
| **`mobile/`** | **Primary app** — Expo / React Native (Android, iOS, Expo web) |
| `legacy-web/` | Archived Vite web client (not production) |
| `supabase/` | Database schema and SQL migrations |

## Quick start

```bash
cd mobile
npm install
cp .env.example .env   # add your EXPO_PUBLIC_* keys
npm start
```

Or from the repo root:

```bash
npm start
```

Use `npm run start:clean` inside `mobile/` after changing `.env`.

## Environment

All secrets and public config live in **`mobile/.env`**:

- `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_GEMINI_API_KEY` (OpenRouter or Gemini)
- Optional: `EXPO_PUBLIC_VISION_API_KEY`, `EXPO_PUBLIC_APP_URL`, etc.

See `mobile/.env.example`.

## Features

- AI-powered CBC report upload and analysis
- OCR (Google Vision when configured)
- Supabase auth, storage, and RLS-backed data
- Dashboard, health logs, report library, analysis history
- Profile and OAuth (Google)

## Legacy web app

The old Vite SPA is preserved under `legacy-web/` for reference. Do not use it for new work. See `legacy-web/README.md`.

## Developer

**K. Karthikeya**
