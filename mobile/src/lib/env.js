/**
 * Expo public env — MUST use static process.env.EXPO_PUBLIC_* references so
 * babel-preset-expo can inline them in the Metro bundle. Dynamic access
 * (process.env[name]) is NOT inlined and breaks at runtime.
 */
import Constants from 'expo-constants'

function trimEnv(value) {
  if (value == null) return ''
  return String(value)
    .replace(/^\uFEFF/, '')
    .trim()
}

/** Strip quotes, Bearer prefix, and stray whitespace from API keys. */
export function sanitizeApiKey(raw) {
  let key = trimEnv(raw)
  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1).trim()
  }
  if (/^bearer\s+/i.test(key)) {
    key = key.replace(/^bearer\s+/i, '').trim()
  }
  return key.replace(/\s+/g, '')
}

export function getAiApiKey() {
  return sanitizeApiKey(process.env.EXPO_PUBLIC_GEMINI_API_KEY)
}

export function getSupabaseUrl() {
  return trimEnv(process.env.EXPO_PUBLIC_SUPABASE_URL)
}

export function getSupabaseAnonKey() {
  return trimEnv(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY)
}

export function getGeminiModel() {
  return trimEnv(process.env.EXPO_PUBLIC_GEMINI_MODEL)
}

export function getVisionApiKey() {
  return sanitizeApiKey(process.env.EXPO_PUBLIC_VISION_API_KEY)
}

export function getAppUrl() {
  return trimEnv(process.env.EXPO_PUBLIC_APP_URL)
}

export function getAppName() {
  return trimEnv(process.env.EXPO_PUBLIC_APP_NAME)
}

/**
 * Dynamic lookup — only for non-critical paths. Prefer dedicated getters above.
 */
export function getExpoPublic(name) {
  switch (name) {
    case 'EXPO_PUBLIC_SUPABASE_URL':
      return getSupabaseUrl()
    case 'EXPO_PUBLIC_SUPABASE_ANON_KEY':
      return getSupabaseAnonKey()
    case 'EXPO_PUBLIC_GEMINI_API_KEY':
      return getAiApiKey()
    case 'EXPO_PUBLIC_GEMINI_MODEL':
      return getGeminiModel()
    case 'EXPO_PUBLIC_VISION_API_KEY':
      return getVisionApiKey()
    case 'EXPO_PUBLIC_APP_URL':
      return getAppUrl()
    case 'EXPO_PUBLIC_APP_NAME':
      return getAppName()
    default:
      return ''
  }
}

export function getOpenRouterAttribution() {
  const referer =
    getAppUrl() ||
    (typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://arise.health')

  const title = getAppName() || 'ARISE'

  return { referer, title }
}

export function maskSecret(value) {
  const text = String(value || '').trim()
  if (!text) return '(not set)'
  if (text.length <= 8) return '***'
  return `${text.slice(0, 4)}…${text.slice(-4)}`
}

export function describeApiKeyForLogs(key) {
  const k = String(key || '')
  return {
    length: k.length,
    firstChars: k.slice(0, 8) || '(empty)',
    lastChars: k.slice(-4) || '(empty)',
    startsWithSkOr: /^sk-or-v1-/i.test(k),
    hasWhitespace: /\s/.test(k),
    hasNonAscii: /[^\x20-\x7E]/.test(k),
    hadBearerPrefix: /^bearer\s+/i.test(String(key || '')),
  }
}

export function describeAuthHeaderPreview(apiKey) {
  const token = sanitizeApiKey(apiKey)
  return {
    scheme: 'Bearer',
    tokenLength: token.length,
    authorizationPreview: `Bearer ${maskSecret(token)}`,
  }
}

export function getEnvMeta() {
  return Constants.expoConfig?.extra?.envMeta ?? null
}

export function logEnvDiagnostics() {
  if (!__DEV__) return

  const key = getAiApiKey()
  const envMeta = getEnvMeta()
  const provider = /^sk-or-v1-/i.test(key)
    ? 'openrouter'
    : key.startsWith('AIza')
      ? 'gemini'
      : key
        ? 'unknown'
        : 'none'

  const aiKey = describeApiKeyForLogs(key)
  const authHeader = describeAuthHeaderPreview(key)

  console.log('[ARISE] Env startup diagnostics:', {
    envSource: envMeta?.primarySource ?? '(unknown — restart Metro after .env change)',
    loadedFrom: envMeta?.loadedFrom ?? [],
    mobileEnvSuffix: envMeta?.mobileEnvSuffix ?? null,
    supabase: Boolean(getSupabaseUrl()),
    aiKey: {
      ...aiKey,
      lastChars: aiKey.lastChars,
      length: aiKey.length,
    },
    tokenLength: authHeader.tokenLength,
    authorizationPreview: authHeader.authorizationPreview,
    aiProvider: provider,
    aiModel: getGeminiModel() || '(default)',
    visionOcr: Boolean(getVisionApiKey()),
  })

  if (!getSupabaseUrl() || !getAiApiKey()) {
    console.warn(
      '[ARISE][env] Missing Supabase or AI keys in mobile/.env — copy mobile/.env.example, then: npx expo start -c'
    )
  }
}
