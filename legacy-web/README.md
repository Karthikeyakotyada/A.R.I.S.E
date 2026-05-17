# Legacy Vite Web App (Archived)

This folder contains the **previous** ARISE web client (React + Vite + Tailwind). It is **not** the production architecture.

The active app lives in [`../mobile/`](../mobile/) (Expo / React Native).

## Why archived?

- Different UI/UX from the Expo app
- Duplicate env/runtime (`VITE_*` vs `EXPO_PUBLIC_*`)
- Conflicted with Metro/Expo tooling at the repo root

## Running (optional, for reference only)

```bash
cd legacy-web
npm install
cp ../mobile/.env .env   # use EXPO_PUBLIC_* keys; Vite also reads them via envPrefix
npm run dev
```

Default dev server: http://localhost:5173

## Docs

Vite-specific OAuth and deployment notes are in [`docs/`](docs/).

## Do not use for new features

All new development: `cd mobile && npm start`.
