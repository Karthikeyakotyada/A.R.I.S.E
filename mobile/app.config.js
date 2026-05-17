const path = require('path')
const { loadProjectEnv, buildEnvMeta } = require('./loadEnv.cjs')

const envLoad = loadProjectEnv()
const envMeta = buildEnvMeta(envLoad)

// Legacy misnamed keys from older .env templates (config-time only, never logged).
if (
  !process.env.EXPO_PUBLIC_VISION_API_KEY &&
  /^AIza/i.test(String(process.env.GOOGLE_APPLICATION_CREDENTIALS || ''))
) {
  process.env.EXPO_PUBLIC_VISION_API_KEY = process.env.GOOGLE_APPLICATION_CREDENTIALS
}

if (envMeta.bundledKeySuffix && envMeta.bundledKeySuffix !== '6af8') {
  console.warn(
    `[ARISE][env] WARNING: bundled AI key suffix is "${envMeta.bundledKeySuffix}" (expected "6af8"). ` +
      `Run: node scripts/sync-env.cjs && npx expo start -c`
  )
} else {
  console.log(
    `[ARISE][env] Loaded OK — suffix: ${envMeta.bundledKeySuffix}, source: ${envMeta.primarySource}`
  )
}

const appJson = require('./app.json')

module.exports = () => ({
  ...appJson,
  expo: {
    ...appJson.expo,
    extra: {
      ...appJson.expo?.extra,
      envMeta,
      supabaseConfigured: Boolean(
        process.env.EXPO_PUBLIC_SUPABASE_URL && process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
      ),
      aiConfigured: Boolean(process.env.EXPO_PUBLIC_GEMINI_API_KEY),
    },
  },
})
