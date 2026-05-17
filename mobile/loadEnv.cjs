/**
 * Single source of truth for loading A.R.I.S.E env files into process.env
 * before Expo/Metro reads EXPO_PUBLIC_* for bundle inlining.
 */
const fs = require('fs')
const path = require('path')
const dotenv = require('dotenv')

const ROOT_ENV = path.resolve(__dirname, '../.env')
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

/**
 * Load env in fixed order (both files should stay in sync):
 * 1. Repo root A.R.I.S.E/.env
 * 2. mobile/.env (optional override)
 */
function loadProjectEnv() {
  clearStaleShellExpoPublicVars()

  const loadedFrom = []

  if (fs.existsSync(ROOT_ENV)) {
    dotenv.config({ path: ROOT_ENV, override: true })
    loadedFrom.push(ROOT_ENV)
  }

  if (fs.existsSync(MOBILE_ENV)) {
    dotenv.config({ path: MOBILE_ENV, override: true })
    loadedFrom.push(MOBILE_ENV)
  }

  const aiKey = String(process.env.EXPO_PUBLIC_GEMINI_API_KEY || '').trim()
  const primarySource = fs.existsSync(MOBILE_ENV)
    ? MOBILE_ENV
    : fs.existsSync(ROOT_ENV)
      ? ROOT_ENV
      : null

  return {
    loadedFrom,
    primarySource,
    rootEnvSuffix: fileKeySuffix(ROOT_ENV),
    mobileEnvSuffix: fileKeySuffix(MOBILE_ENV),
    runtimeSuffix: aiKey.slice(-4) || null,
    runtimeLength: aiKey.length,
    shellHadKeyBeforeLoad: false,
  }
}

function buildEnvMeta(loadResult) {
  return {
    loadedFrom: loadResult.loadedFrom.map((p) => path.basename(path.dirname(p)) + '/' + path.basename(p)),
    primarySource: loadResult.primarySource
      ? path.basename(path.dirname(loadResult.primarySource)) +
        '/' +
        path.basename(loadResult.primarySource)
      : '(none)',
    rootEnvSuffix: loadResult.rootEnvSuffix,
    mobileEnvSuffix: loadResult.mobileEnvSuffix,
    bundledKeySuffix: loadResult.runtimeSuffix,
    bundledKeyLength: loadResult.runtimeLength,
    expectedSuffix: '6af8',
    keysMatchExpected:
      loadResult.runtimeSuffix === '6af8' ||
      loadResult.mobileEnvSuffix === '6af8' ||
      loadResult.rootEnvSuffix === '6af8',
  }
}

module.exports = {
  ROOT_ENV,
  MOBILE_ENV,
  loadProjectEnv,
  buildEnvMeta,
}
