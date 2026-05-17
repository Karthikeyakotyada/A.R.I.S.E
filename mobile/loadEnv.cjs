/**
 * Load mobile/.env into process.env before Expo/Metro inlines EXPO_PUBLIC_*.
 */
const fs = require('fs')
const path = require('path')
const dotenv = require('dotenv')

const MOBILE_ENV = path.resolve(__dirname, '.env')

const EXPO_PUBLIC_KEYS = [
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  'EXPO_PUBLIC_GEMINI_API_KEY',
  'EXPO_PUBLIC_GEMINI_MODEL',
  'EXPO_PUBLIC_VISION_API_KEY',
  'EXPO_PUBLIC_APP_URL',
  'EXPO_PUBLIC_APP_NAME',
  'EXPO_PUBLIC_BLOOD_SUGAR_MODE',
]

function fileKeySuffix(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null
  const line = fs
    .readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .find((row) => row.startsWith('EXPO_PUBLIC_GEMINI_API_KEY='))
  if (!line) return null
  const value = line.slice('EXPO_PUBLIC_GEMINI_API_KEY='.length).trim()
  return value.slice(-4) || null
}

function clearStaleShellExpoPublicVars() {
  for (const key of EXPO_PUBLIC_KEYS) {
    delete process.env[key]
  }
}

function loadProjectEnv() {
  clearStaleShellExpoPublicVars()

  const loadedFrom = []

  if (fs.existsSync(MOBILE_ENV)) {
    dotenv.config({ path: MOBILE_ENV, override: true })
    loadedFrom.push(MOBILE_ENV)
  }

  const aiKey = String(process.env.EXPO_PUBLIC_GEMINI_API_KEY || '').trim()

  return {
    loadedFrom,
    primarySource: loadedFrom[0] ?? null,
    mobileEnvSuffix: fileKeySuffix(MOBILE_ENV),
    runtimeSuffix: aiKey.slice(-4) || null,
    runtimeLength: aiKey.length,
    shellHadKeyBeforeLoad: false,
  }
}

function buildEnvMeta(loadResult) {
  return {
    loadedFrom: loadResult.loadedFrom.map(
      (p) => path.basename(path.dirname(p)) + '/' + path.basename(p)
    ),
    primarySource: loadResult.primarySource
      ? path.basename(path.dirname(loadResult.primarySource)) +
        '/' +
        path.basename(loadResult.primarySource)
      : '(none — copy mobile/.env.example to mobile/.env)',
    mobileEnvSuffix: loadResult.mobileEnvSuffix,
    bundledKeySuffix: loadResult.runtimeSuffix,
    bundledKeyLength: loadResult.runtimeLength,
  }
}

module.exports = {
  MOBILE_ENV,
  loadProjectEnv,
  buildEnvMeta,
}
