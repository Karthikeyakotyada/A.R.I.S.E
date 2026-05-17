# ARISE — Agent / AI tooling guide

## Primary app

**All production development is in `mobile/`** (Expo / React Native).

```bash
cd mobile
npm install
cp .env.example .env   # if needed
npm start
```

From repo root you can also run: `npm start` (delegates to `mobile/`).

## Do not treat as active

| Path | Role |
|------|------|
| `legacy-web/` | Archived Vite + React web client (reference only) |
| Root `node_modules/` | Should not exist; use `mobile/node_modules` |

## Environment

- **Single source:** `mobile/.env` with `EXPO_PUBLIC_*` variables only.
- Do not add repo-root `.env` for Expo; it caused dual-runtime conflicts.
- After env changes: `cd mobile && npm run start:clean`.

## Shared backend assets

- `supabase/` — SQL migrations/schemas (used by the Expo app).

## Features to preserve when editing

OCR, AI analysis, Supabase auth/storage, uploads, report history, React Navigation stacks/tabs.

## Key code locations

- Screens: `mobile/src/screens/`
- Navigation: `mobile/src/navigation/`
- CBC / OCR / upload: `mobile/src/lib/cbcAnalyzer.js`
- Report analysis: `mobile/src/lib/reportAnalysisService.js`
- Supabase: `mobile/src/lib/supabaseClient.js`
- Env helpers: `mobile/src/lib/env.js`, `mobile/loadEnv.cjs`, `mobile/app.config.js`
