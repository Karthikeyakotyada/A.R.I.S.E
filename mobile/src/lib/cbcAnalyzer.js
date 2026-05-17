import { EncodingType, readAsStringAsync } from 'expo-file-system/legacy'
import { Platform } from 'react-native'
import { decode } from 'base64-arraybuffer'
import { supabase } from './supabaseClient'
import {
  getAiApiKey,
  getGeminiModel,
  getVisionApiKey,
  getOpenRouterAttribution,
  describeApiKeyForLogs,
  describeAuthHeaderPreview,
  sanitizeApiKey,
} from './env'

// ──────────────────────────────────────────────────────────────
// BASE64 CONVERSION HELPERS
// ──────────────────────────────────────────────────────────────

/**
 * Read file and convert to base64 using fetch
 * Works with both iOS and Android
 */
async function readFileAsBase64ViaFetch(fileUri) {
  const response = await fetch(fileUri)
  if (!response.ok) {
    throw new Error(`Failed to fetch file: ${response.status}`)
  }

  const blob = await response.blob()
  return await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const base64 = reader.result.split(',')[1]
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

/**
 * Read local file and convert to base64
 * Uses expo-file-system on native, fetch fallback on web
 */
async function readFileAsBase64(fileUri) {
  const shouldUseFetchOnly =
    Platform.OS === 'web' ||
    /^blob:/i.test(String(fileUri || '')) ||
    /^https?:/i.test(String(fileUri || ''))

  if (shouldUseFetchOnly) {
    console.log('[ARISE] Reading file via fetch/file-reader path:', fileUri)
    try {
      const base64 = await readFileAsBase64ViaFetch(fileUri)
      console.log('[ARISE] File converted to base64, size:', base64.length)
      return base64
    } catch (error) {
      console.error('[ARISE] Error reading file:', error)
      throw new Error('Failed to read file: ' + error.message)
    }
  }

  try {
    console.log('[ARISE] Reading file via legacy filesystem API:', fileUri)
    const base64 = await readAsStringAsync(fileUri, {
      encoding: EncodingType.Base64,
    })
    console.log('[ARISE] File converted to base64, size:', base64.length)
    return base64
  } catch (error) {
    console.warn('[ARISE] Legacy file read failed, trying fetch fallback:', error)
    try {
      return await readFileAsBase64ViaFetch(fileUri)
    } catch (fallbackError) {
      console.error('[ARISE] Error reading file:', fallbackError)
      throw new Error('Failed to read file: ' + fallbackError.message)
    }
  }
}

/**
 * Fallback: fetch image via a Supabase signed URL
 */
async function fetchBase64ViaSignedUrl(filePath) {
  try {
    const { data, error } = await supabase.storage
      .from('cbc-reports')
      .createSignedUrl(filePath, 120)

    if (error || !data?.signedUrl) {
      throw new Error('Signed URL error: ' + (error?.message ?? 'no URL returned'))
    }

    console.log('[ARISE] Fetching image via signed URL…')
    const response = await fetch(data.signedUrl)
    if (!response.ok) {
      throw new Error(`Fetch failed: ${response.status}`)
    }

    const blob = await response.blob()
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const base64 = reader.result.split(',')[1]
        resolve(base64)
      }
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  } catch (error) {
    console.error('[ARISE] Signed URL fetch error:', error)
    throw error
  }
}

export const RANGES = {
  // Core CBC parameters
  hemoglobin: { 
    male: { min: 13.0, max: 17.0 },
    female: { min: 12.0, max: 15.5 },
    unit: 'g/dL' 
  },
  rbc: { min: 4.0, max: 6.0, unit: 'M/µL' },
  wbc: { min: 4000, max: 11000, unit: '/µL' },
  platelets: { min: 150000, max: 450000, unit: '/µL' },
  // Extended CBC parameters
  mcv: { min: 80, max: 100, unit: 'fL' },
  mch: { min: 27, max: 32, unit: 'pg' },
  mchc: { min: 32, max: 36, unit: 'g/dL' },
  neutrophils: { min: 40, max: 75, unit: '%' },
  lymphocytes: { min: 20, max: 40, unit: '%' },
  esr: { min: 0, max: 20, unit: 'mm/hr' },
}

export function getStatusForValue(value, field, gender = 'female') {
  if (value === null || value === undefined || Number(value) <= 0) return 'unknown'
  const fieldRange = RANGES[field]
  if (!fieldRange) return 'unknown'
  
  // Handle gender-specific ranges (hemoglobin)
  let min, max
  if (field === 'hemoglobin' && fieldRange.male && fieldRange.female) {
    const rangeObj = gender === 'male' ? fieldRange.male : fieldRange.female
    min = rangeObj.min
    max = rangeObj.max
  } else {
    min = fieldRange.min
    max = fieldRange.max
  }
  
  if (value < min) return 'low'
  if (value > max) return 'high'
  return 'normal'
}

// Helper: Calculate deviation severity for scoring
function calculateDeviationSeverity(value, field, gender = 'female') {
  if (value === null || value === undefined) return null
  
  const fieldRange = RANGES[field]
  if (!fieldRange) return null
  
  // Handle gender-specific ranges (hemoglobin)
  let min, max
  if (field === 'hemoglobin' && fieldRange.male && fieldRange.female) {
    const rangeObj = gender === 'male' ? fieldRange.male : fieldRange.female
    min = rangeObj.min
    max = rangeObj.max
  } else {
    min = fieldRange.min
    max = fieldRange.max
  }
  
  const range = max - min
  let deviationPercent = 0
  
  if (value < min) {
    deviationPercent = ((min - value) / range) * 100
  } else if (value > max) {
    deviationPercent = ((value - max) / range) * 100
  } else {
    return null // Normal value - within range
  }
  
  // More granular severity thresholds
  if (deviationPercent <= 5) return 'mild'        // 0-5% deviation: -5 points
  if (deviationPercent <= 20) return 'moderate'   // 5-20% deviation: -10 points
  return 'severe'                                  // >20% deviation: -15 points
}

// Helper: Get point deduction for a severity level
function getPointDeduction(severity) {
  switch (severity) {
    case 'mild': return 5
    case 'moderate': return 10
    case 'severe': return 15
    default: return 0
  }
}

function countDetectedValues(values) {
  return Object.values(values || {}).filter((value) => !isUnavailable(value)).length
}

// Helper: Build abnormalities list with deviation info
function buildAbnormalitiesList(values, gender = 'female') {
  const abnormalities = []
  const allFields = ['hemoglobin', 'rbc', 'wbc', 'platelets', 'mcv', 'mch', 'mchc', 'neutrophils', 'lymphocytes', 'esr']
  
  for (const field of allFields) {
    const value = values[field]
    if (isUnavailable(value)) continue
    
    const status = getStatusForValue(value, field, gender)
    if (status === 'normal' || status === 'unknown') continue
    
    const severity = calculateDeviationSeverity(value, field, gender)
    const fieldRange = RANGES[field]
    let range = fieldRange
    
    // Get correct range for hemoglobin
    if (field === 'hemoglobin' && fieldRange.male && fieldRange.female) {
      range = gender === 'male' ? fieldRange.male : fieldRange.female
    }
    
    const unit = fieldRange.unit
    const min = range.min || fieldRange.min
    const max = range.max || fieldRange.max
    
    const reason = generateAbnormalityReason(field, value, status, min, max, severity)
    
    abnormalities.push({
      name: getSimpleFieldName(field),
      value,
      unit,
      status,
      severity: severity || 'none',
      reason
    })
  }
  
  return abnormalities
}

// Helper: Generate reason for abnormality
function generateAbnormalityReason(field, value, status, min, max, severity) {
  const deviationPercent = status === 'low' 
    ? Math.round(((min - value) / (max - min)) * 100)
    : Math.round(((value - max) / (max - min)) * 100)
  
  const reasons = {
    hemoglobin: {
      low: `Hemoglobin is ${deviationPercent}% below normal range (${min}–${max}). This may indicate anemia.`,
      high: `Hemoglobin is ${deviationPercent}% above normal range (${min}–${max}). This may indicate dehydration or polycythemia.`
    },
    rbc: {
      low: `RBC is ${deviationPercent}% below normal (${min}–${max}). May indicate anemia or blood loss.`,
      high: `RBC is ${deviationPercent}% above normal (${min}–${max}). May indicate dehydration or polycythemia.`
    },
    wbc: {
      low: `WBC is ${deviationPercent}% below normal (${min}–${max}). May indicate immunodeficiency.`,
      high: `WBC is ${deviationPercent}% above normal (${min}–${max}). May indicate infection or inflammation.`
    },
    platelets: {
      low: `Platelets are ${deviationPercent}% below normal (${min}–${max}). May affect clotting ability.`,
      high: `Platelets are ${deviationPercent}% above normal (${min}–${max}). May indicate thrombocytosis.`
    },
    mcv: {
      low: `MCV is low (${value} fL). Indicates microcytic cells. May suggest iron deficiency.`,
      high: `MCV is high (${value} fL). Indicates macrocytic cells. May suggest B12 or folate deficiency.`
    },
    mch: {
      low: `MCH is low (${value} pg). May indicate hypochromic anemia.`,
      high: `MCH is high (${value} pg). May indicate macrocytic or hyperchromic cells.`
    },
    mchc: {
      low: `MCHC is low (${value} g/dL). May indicate hypochromic anemia.`,
      high: `MCHC is high (${value} g/dL). May indicate spherocytosis.`
    },
    neutrophils: {
      low: `Neutrophils are low (${value}%). May indicate immunosuppression.`,
      high: `Neutrophils are high (${value}%). May indicate infection or stress.`
    },
    lymphocytes: {
      low: `Lymphocytes are low (${value}%). May indicate immunodeficiency.`,
      high: `Lymphocytes are high (${value}%). May indicate viral infection or leukemia.`
    },
    esr: {
      low: `ESR is very low (${value} mm/hr). Unusual but may occur in certain conditions.`,
      high: `ESR is elevated (${value} mm/hr). May indicate inflammation, infection, or autoimmune disease.`
    }
  }
  
  return (reasons[field]?.[status] || `${field} is ${status} (${min}–${max}).`) 
}

// Helper: Get simple field name for display
function getSimpleFieldName(field) {
  const names = {
    hemoglobin: 'Hemoglobin',
    rbc: 'RBC (Red Blood Cells)',
    wbc: 'WBC (White Blood Cells)',
    platelets: 'Platelets',
    mcv: 'MCV (Cell Volume)',
    mch: 'MCH (Cell Hemoglobin)',
    mchc: 'MCHC (Hemoglobin Concentration)',
    neutrophils: 'Neutrophils',
    lymphocytes: 'Lymphocytes',
    esr: 'ESR (Sedimentation Rate)'
  }
  return names[field] || field
}

function keepOnlyTextSupportedValues(values, rawText) {
  const result = { ...values }
  for (const field of ['hemoglobin', 'rbc', 'wbc', 'platelets']) {
    if (!isUnavailable(result[field]) && !hasPatientValueEvidence(rawText, field)) {
      console.warn(`[ARISE] Dropping unsupported ${field} value due to weak OCR evidence`)
      result[field] = null
    }
  }

  return result
}
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'
const DEFAULT_GEMINI_MODEL_CANDIDATES = [
  'gemini-2.0-flash',
  'gemini-1.5-flash',
  'gemini-1.5-flash-8b',
]
const DEFAULT_OPENROUTER_MODEL_CANDIDATES = [
  'google/gemini-2.0-flash-001',
  'google/gemini-2.5-flash-lite',
  'google/gemini-2.5-flash',
]
const DEFAULT_AI_TIMEOUT_MS = 35000
const AI_PIPELINE_VERSION = '2026-05-16-r3'

function isOpenRouterKey(apiKey) {
  return /^sk-or-v1-/i.test(String(apiKey || '').trim())
}

function getModelCandidates(apiKey) {
  const configuredModel = getGeminiModel()
  const base = isOpenRouterKey(apiKey)
    ? DEFAULT_OPENROUTER_MODEL_CANDIDATES
    : DEFAULT_GEMINI_MODEL_CANDIDATES

  const configured = configuredModel
    ? isOpenRouterKey(apiKey) && !configuredModel.includes('/')
      ? `google/${configuredModel}`
      : configuredModel
    : null

  return [...new Set([configured, ...base].filter(Boolean))]
}

function extractGeminiErrorMessage(payload) {
  if (!payload) return ''
  if (typeof payload === 'string') return payload
  return payload?.error?.message || payload?.message || ''
}

function normalizeGeminiError(input) {
  const message = String(input || '')
  if (/api key|permission denied|unauthorized|forbidden/i.test(message)) {
    return 'AI service authentication failed. Please verify the Gemini API key.'
  }
  if (/not found|not supported for generatecontent|models\//i.test(message)) {
    return 'AI model unavailable. Please update to a supported Gemini model.'
  }
  if (/rate limit|quota|too many requests/i.test(message)) {
    return 'Rate limit reached for this Gemini project. Try again later or use a key from a different Google Cloud project.'
  }
  return message
}

function normalizeOpenRouterError(status, message) {
  const text = String(message || '')

  if (status === 401 || status === 403 || /unauthorized|invalid api key|authentication|forbidden/i.test(text)) {
    return 'OpenRouter authentication failed. Please verify EXPO_PUBLIC_GEMINI_API_KEY.'
  }
  if (status === 402 || /insufficient credits|payment required|credits/i.test(text)) {
    return 'OpenRouter credits are insufficient. Add credits or use another provider key.'
  }
  if (status === 404 || /not a valid model id|invalid model|unknown model|model unavailable|not found/i.test(text)) {
    return 'AI model unavailable. Please update to a supported Gemini model.'
  }
  if (status === 429 || /rate limit|too many requests|quota/i.test(text)) {
    return 'Rate limit reached for OpenRouter. Please try again shortly.'
  }

  return text
}

function toReadableError(err) {
  const message = err?.message || 'Unknown error'
  if (/aborted|timed out|timeout/i.test(message)) {
    return 'AI analysis timed out. Please retry on a stable connection.'
  }
  if (/network request failed|failed to fetch|network/i.test(message)) {
    return 'Network error: your connection may be unstable. Please try again.'
  }
  return message
}

function convertGeminiRequestToOpenRouterMessages(requestBody) {
  const contents = Array.isArray(requestBody?.contents) ? requestBody.contents : []

  return contents
    .map((content) => {
      const parts = Array.isArray(content?.parts) ? content.parts : []
      const mappedParts = parts
        .map((part) => {
          if (part?.text) {
            return { type: 'text', text: String(part.text) }
          }

          const inlineData = part?.inlineData
          if (inlineData?.data) {
            const mimeType = inlineData?.mimeType || 'image/png'
            return {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${inlineData.data}`,
              },
            }
          }

          return null
        })
        .filter(Boolean)

      if (!mappedParts.length) {
        return null
      }

      return {
        role: content?.role === 'system' ? 'system' : 'user',
        content:
          mappedParts.length === 1 && mappedParts[0].type === 'text'
            ? mappedParts[0].text
            : mappedParts,
      }
    })
    .filter(Boolean)
}

function buildOpenRouterPayload(model, requestBody) {
  const messages = convertGeminiRequestToOpenRouterMessages(requestBody)
  const payload = { model, messages }

  const temperature = requestBody?.generationConfig?.temperature
  const maxTokens = requestBody?.generationConfig?.maxOutputTokens

  if (temperature != null && !Number.isNaN(Number(temperature))) {
    payload.temperature = Number(temperature)
  }
  if (maxTokens != null && !Number.isNaN(Number(maxTokens))) {
    payload.max_tokens = Number(maxTokens)
  }

  return payload
}

function previewOpenRouterPayload(payload) {
  return {
    model: payload.model,
    messageCount: Array.isArray(payload.messages) ? payload.messages.length : 0,
    messages: (payload.messages || []).map((msg) => {
      if (typeof msg.content === 'string') {
        return {
          role: msg.role,
          content:
            msg.content.length > 160
              ? `${msg.content.slice(0, 160)}… (${msg.content.length} chars)`
              : msg.content,
        }
      }

      if (!Array.isArray(msg.content)) {
        return { role: msg.role, content: typeof msg.content }
      }

      return {
        role: msg.role,
        parts: msg.content.map((part) => {
          if (part?.type === 'image_url') {
            const url = String(part?.image_url?.url || '')
            return {
              type: 'image_url',
              bytes: url.startsWith('data:') ? url.length : url.length,
            }
          }
          return {
            type: part?.type || 'text',
            textPreview: String(part?.text || '').slice(0, 80),
          }
        }),
      }
    }),
    temperature: payload.temperature,
    max_tokens: payload.max_tokens,
  }
}

function buildOpenRouterHeaders(apiKey, referer, title) {
  const token = sanitizeApiKey(apiKey)
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': String(referer || 'https://arise.health'),
    'X-Title': String(title || 'ARISE'),
  }

  return { headers, token }
}

function logOpenRouterRequestDiagnostics({ model, payload, headers, token, rawKey }) {
  if (!__DEV__) return

  const keyInfo = describeApiKeyForLogs(token)
  const auth = describeAuthHeaderPreview(token)

  console.log('[ARISE][OpenRouter] Request diagnostics:', {
    model,
    apiKey: {
      ...keyInfo,
      lastChars: keyInfo.lastChars,
      length: keyInfo.length,
    },
    tokenLength: auth.tokenLength,
    authorizationPreview: auth.authorizationPreview,
    expectedLastChars: '6af8',
    keyMatchesExpected: keyInfo.lastChars === '6af8',
    headerKeys: Object.keys(headers),
    payload: previewOpenRouterPayload(payload),
  })

  if (keyInfo.lastChars && keyInfo.lastChars !== '6af8') {
    console.warn(
      `[ARISE][OpenRouter] Bundled key still stale (lastChars="${keyInfo.lastChars}"). ` +
        'Run: npm run start:clean'
    )
  }
}

async function openRouterGenerateContent(apiKey, requestBody, timeoutMs = DEFAULT_AI_TIMEOUT_MS) {
  const rawKey = apiKey ?? getAiApiKey()
  const { referer, title } = getOpenRouterAttribution()
  const { headers: resolvedHeaders, token: resolvedToken } = buildOpenRouterHeaders(
    rawKey,
    referer,
    title
  )

  if (!resolvedToken) {
    throw new Error('EXPO_PUBLIC_GEMINI_API_KEY is not configured')
  }

  const models = getModelCandidates(resolvedToken)
  let lastError = null

  for (const model of models) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const payload = buildOpenRouterPayload(model, requestBody)

      if (!Array.isArray(payload.messages) || payload.messages.length === 0) {
        throw new Error('OpenRouter request has no messages after conversion')
      }

      logOpenRouterRequestDiagnostics({
        model,
        payload,
        headers: resolvedHeaders,
        token: resolvedToken,
        rawKey,
      })

      console.log(`[ARISE] OpenRouter POST chat/completions (model: ${model})`)

      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: resolvedHeaders,
        body: JSON.stringify(payload),
        signal: controller.signal,
      })

      const responseText = await res.text()
      let json = null
      try {
        json = responseText ? JSON.parse(responseText) : null
      } catch (parseError) {
        console.warn('[ARISE][OpenRouter] Non-JSON response:', {
          status: res.status,
          sample: responseText.slice(0, 200),
          parseError: parseError?.message,
        })
      }

      if (res.ok) {
        const content = json?.choices?.[0]?.message?.content ?? ''
        if (Array.isArray(content)) {
          return content.map((part) => part?.text || '').join('').trim()
        }
        return String(content || '').trim()
      }

      const apiMessage = normalizeOpenRouterError(
        res.status,
        extractGeminiErrorMessage(json) ||
          json?.error?.message ||
          json?.message ||
          (typeof json?.error === 'string' ? json.error : '')
      )

      if (res.status === 401 || res.status === 403) {
        console.error('[ARISE] OpenRouter auth failed:', apiMessage)
        throw new Error(apiMessage || `OpenRouter error (${res.status})`)
      }

      const isModelUnavailable =
        res.status === 404 ||
        /model unavailable|not found|not a valid model id|invalid model|unknown model/i.test(apiMessage)
      const isQuotaLimited =
        res.status === 429 || /rate limit|quota|too many requests/i.test(apiMessage)

      if (isModelUnavailable || isQuotaLimited) {
        console.warn(
          `[ARISE] Model ${model} ${isQuotaLimited ? 'quota-limited' : 'unavailable'}, trying next…`
        )
        lastError = new Error(apiMessage)
        continue
      }

      throw new Error(apiMessage || `OpenRouter error (${res.status})`)
    } catch (err) {
      if (/aborted|timed out|timeout/i.test(err?.message || '')) {
        throw err
      }

      const readable = normalizeOpenRouterError(0, err?.message || '')
      console.warn(`[ARISE] OpenRouter attempt failed for model ${model}:`, readable)
      lastError = err instanceof Error ? err : new Error(String(err || 'OpenRouter error'))
    } finally {
      clearTimeout(timeout)
    }
  }

  throw new Error(lastError?.message || 'All OpenRouter models unavailable. Please try again.')
}

function isUnavailable(value) {
  return value === null || value === undefined || Number(value) <= 0
}

function normalizeFieldValue(fieldName, value) {
  if (isUnavailable(value)) return null
  const num = Number(value)
  return Number.isNaN(num) ? null : num
}

function isReferenceRangeOnlyDocument(text) {
  if (!text || typeof text !== 'string') return false
  
  const lines = text.split('\n').length
  
  // Check for common reference range indicators
  const hasReferenceIndicators = /\breference\s+range|\bnormal\s+range|\breference\s+value|\bnormal\s+value/i.test(text)
  const hasObservedValueColumn = /\bobserved\s+value\b|\bpatient\s+value\b|\bresult\s+value\b/i.test(text)
  const hasMeasuredCBCValues = /\b(haemoglobin|hemoglobin|hgb|hb|rbc|wbc|white\s+blood\s+cell|leukocyte|platelet|neutrophils?|lymphocytes?)\b[^\n\d]{0,30}\d+(?:\.\d+)?/i.test(
    text
  )
  const hasManyRanges = (text.match(/[-–]\s*\d+/g) || []).length > 5
  
  // If >40% of lines are ranges like "80-95", likely a reference table
  const rangeLines = (text.match(/^\s*\d+(?:\.\d+)?\s*[-–]\s*\d+(?:\.\d+)?/gm) || []).length
  const isLikelyReferenceTable = rangeLines > lines * 0.4
  
  return (
    hasReferenceIndicators &&
    !hasObservedValueColumn &&
    !hasMeasuredCBCValues &&
    (hasManyRanges || isLikelyReferenceTable)
  )
}

async function geminiGenerateContent(
  apiKey,
  requestBody,
  timeoutMs = DEFAULT_AI_TIMEOUT_MS
) {
  const trimmedKey = sanitizeApiKey(apiKey || getAiApiKey())
  if (!trimmedKey) {
    throw new Error('EXPO_PUBLIC_GEMINI_API_KEY is not configured')
  }

  if (isOpenRouterKey(trimmedKey)) {
    return openRouterGenerateContent(trimmedKey, requestBody, timeoutMs)
  }

  const models = getModelCandidates(trimmedKey)
  let lastError = null

  for (const model of models) {
    const url = `${GEMINI_API_BASE}/${model}:generateContent?key=${encodeURIComponent(trimmedKey)}`
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)

    try {
      console.log(`[ARISE] Attempting Gemini API with model: ${model}`)

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      })

      const json = await res.json()

      if (res.ok) {
        console.log(`[ARISE] Gemini success with model: ${model}`)
        return json.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
      }

      const apiMessage = normalizeGeminiError(extractGeminiErrorMessage(json))
      const isModelUnavailable =
        res.status === 404 ||
        /model unavailable|not found|not supported for generatecontent/i.test(
          apiMessage
        )
      const isQuotaLimited =
        res.status === 429 || /rate limit|quota|too many requests/i.test(apiMessage)

      if (isModelUnavailable || isQuotaLimited) {
        console.warn(
          `[ARISE] Model ${model} ${isQuotaLimited ? 'quota-limited' : 'unavailable'}, trying next…`
        )
        lastError = new Error(apiMessage)
        continue
      }

      throw new Error(apiMessage || `Gemini error (${res.status})`)
    } catch (err) {
      const friendly = toReadableError(err)
      console.error(`[ARISE] Model ${model} failed:`, friendly)

      if (/offline or connection is unstable|timed out/i.test(friendly)) {
        throw new Error(friendly)
      }

      lastError = new Error(friendly)
    } finally {
      clearTimeout(timeout)
    }
  }

  throw new Error(
    lastError?.message || 'All AI models unavailable. Please try again.'
  )
}

async function extractCBCWithGemini(imageBase64, mimeType, timeoutMs) {
  const apiKey = getAiApiKey()
  if (!apiKey) throw new Error('EXPO_PUBLIC_GEMINI_API_KEY is missing from .env')

  const prompt = `You are a medical data extractor. Analyze this Complete Blood Count (CBC) report image and extract the following test values.

Return ONLY a valid JSON object — no markdown, no explanation:
{
  "hemoglobin": <number in g/dL, or null if not found>,
  "rbc": <number in millions per microliter (M/µL), or null if not found>,
  "wbc": <number in cells per microliter (/µL), or null if not found>,
  "platelets": <number in cells per microliter (/µL), or null if not found>
}

Important conversion rules:
- WBC/TLC values like "8.2 × 10³" mean 8200 — report as 8200
- Platelets like "2.5 lakhs" or "2.5 L" mean 250000 — report as 250000
- Platelets like "180 × 10³" mean 180000 — report as 180000
- Hemoglobin: look for Hb, HGB, Haemoglobin — value should be 5–25
- RBC: look for Red Blood Cells, Erythrocytes — value should be 1–10
- Do NOT extract values from "normal range", "reference range", male/female range columns, or textbook tables
- Ignore any value shown as a range such as "4.2 - 5.4" or "80 - 95"; these are not patient results
- If the image is only a reference chart and no measured patient values are present, return all nulls
- If a value is present but units unclear, make your best estimate
- If not a CBC report or no values visible, return all nulls`

  console.log('[ARISE] Calling Gemini Vision API for extraction…')

  const text = await geminiGenerateContent(
    apiKey,
    {
      contents: [
        {
          parts: [
            { inlineData: { data: imageBase64, mimeType } },
            { text: prompt },
          ],
        },
      ],
    },
    timeoutMs
  )

  console.log('[ARISE] Vision extraction response length:', text.length)

  const clean = text.replace(/```json\s*/i, '').replace(/```/g, '').trim()

  try {
    const parsed = JSON.parse(clean)
    console.log('[ARISE] Extracted values:', parsed)
    return parsed
  } catch (error) {
    console.error('[ARISE] JSON parse error:', error)
    const match = clean.match(/\{[\s\S]*\}/)
    if (match) {
      try {
        const parsed = JSON.parse(match[0])
        console.log('[ARISE] Extracted values (fallback):', parsed)
        return parsed
      } catch (fallbackError) {
        console.error('[ARISE] Fallback parse failed:', fallbackError)
      }
    }
    throw new Error('Gemini returned invalid JSON: ' + clean.slice(0, 200))
  }
}

// ──────────────────────────────────────────────────────────────
// HEALTH SCORING (0 – 100)
// ──────────────────────────────────────────────────────────────
export function scoreHealth(values, gender = 'female') {
  // Include all 10 CBC fields in scoring
  const fields = ['hemoglobin', 'rbc', 'wbc', 'platelets', 'mcv', 'mch', 'mchc', 'neutrophils', 'lymphocytes', 'esr']
  let score = 100
  let detectedAbnormalities = 0
  let totalDetected = 0

  for (const field of fields) {
    const value = values[field]
    
    // Skip missing values - don't penalize
    if (isUnavailable(value)) continue
    
    totalDetected++
    
    // Calculate deviation severity
    const severity = calculateDeviationSeverity(value, field, gender)
    
    if (severity) {
      detectedAbnormalities++
      const deduction = getPointDeduction(severity)
      score -= deduction
      console.log(`[SCORE] ${field}: ${value} → ${severity} deviation → -${deduction} points (score now: ${score})`)
    }
  }

  // If no values detected, return null (unknown)
  if (totalDetected === 0) return null
  
  // Ensure score never stays at 100 if abnormalities exist
  if (detectedAbnormalities > 0 && score === 100) {
    score = 99
  }
  
  // Return score capped at 0-100
  return Math.max(0, Math.min(100, score))
}

/**
 * Extract extended CBC values from OCR text with flexible regex patterns
 * Returns all 10 parameters with null for missing values
 * Backward compatible with core 4 parameters (hemoglobin, rbc, wbc, platelets)
 * @param {string} ocrText - OCR extracted text from CBC report
 * @returns {object} Object with all CBC fields, missing values are null
 */
export function extractExtendedCBCFromText(ocrText) {
  if (!ocrText || typeof ocrText !== 'string') {
      return {
        hemoglobin: null,
        rbc: null,
        wbc: null,
        platelets: null,
        mcv: null,
        mch: null,
        mchc: null,
        neutrophils: null,
        lymphocytes: null,
        esr: null,
      }
  }

  try {
    console.log('[PARSER] Extracting extended CBC values from OCR text…')
    const values = extractCBCValuesFromOCR(ocrText)
    console.log('[VALUES] Extended CBC extraction complete:', {
      detected: Object.entries(values).filter(([, v]) => v !== null).length,
      total: Object.keys(values).length,
    })
    return values
  } catch (error) {
    console.error('[ARISE] Extended CBC extraction error:', error)
    return {
      hemoglobin: null,
      rbc: null,
      wbc: null,
      platelets: null,
      mcv: null,
      mch: null,
      mchc: null,
      neutrophils: null,
      lymphocytes: null,
      esr: null,
    }
  }
}

// ──────────────────────────────────────────────────────────────
// AI SUMMARY GENERATION
// ──────────────────────────────────────────────────────────────
function getSimpleValueMeaning(field, status) {
  const meanings = {
    hemoglobin: {
      low: 'This can make you feel tired, weak, or short of energy.',
      high: 'This can happen when your body is a bit low on water.',
    },
    rbc: {
      low: 'Your body may not be carrying oxygen as well as usual.',
      high: 'Your blood may be a little more concentrated than usual.',
    },
    wbc: {
      low: 'Your body may have fewer cells ready to help fight germs.',
      high: 'Your body may be reacting to something and working harder than usual.',
    },
    platelets: {
      low: 'Small cuts may take longer to stop bleeding.',
      high: 'Your body may be making extra cells that help with clotting.',
    },
  }

  return meanings[field]?.[status] || 'This number is lower or higher than expected.'
}

function getSimpleSuggestions(field, status) {
  const sharedSuggestions = [
    {
      title: 'Drink enough water',
      description: 'Keep sipping water through the day.',
    },
    {
      title: 'Keep meals balanced',
      description: 'Eat regular meals with fruits, vegetables, protein, and whole grains.',
    },
  ]

  const fieldSuggestions = {
    hemoglobin: {
      low: [
        {
          title: 'Add iron-rich foods',
          description: 'Try spinach, beans, lentils, eggs, meat, or fortified cereals.',
        },
        {
          title: 'Add vitamin C foods',
          description: 'Orange, lemon, guava, or tomatoes can help your body use iron better.',
        },
      ],
      high: [
        {
          title: 'Drink more water',
          description: 'Enough fluids can help if your blood looks concentrated.',
        },
        {
          title: 'Keep a steady routine',
          description: 'Regular sleep and gentle movement can help your body stay balanced.',
        },
      ],
    },
    rbc: {
      low: [
        {
          title: 'Choose iron-rich foods',
          description: 'Eat leafy greens, beans, lentils, eggs, and meat if you eat it.',
        },
        {
          title: 'Pair meals with vitamin C',
          description: 'Fruits like oranges or guava can help your body use iron.',
        },
      ],
      high: [
        {
          title: 'Drink enough water',
          description: 'Fluids may help if the blood is a bit thick or concentrated.',
        },
        {
          title: 'Avoid skipping meals',
          description: 'Regular meals and rest can help keep things steady.',
        },
      ],
    },
    wbc: {
      low: [
        {
          title: 'Rest well',
          description: 'Give your body time to recover with good sleep.',
        },
        {
          title: 'Wash hands often',
          description: 'Simple hygiene can help reduce exposure to germs.',
        },
      ],
      high: [
        {
          title: 'Rest and hydrate',
          description: 'Sleep and water are simple ways to support your body.',
        },
        {
          title: 'Watch how you feel',
          description: 'If you feel unwell, keep track of changes and avoid overdoing it.',
        },
      ],
    },
    platelets: {
      low: [
        {
          title: 'Be gentle with your body',
          description: 'Avoid rough activity and use care with sharp objects.',
        },
        {
          title: 'Eat regular meals',
          description: 'Balanced food and enough water can support recovery.',
        },
      ],
      high: [
        {
          title: 'Stay hydrated',
          description: 'Water and regular meals can help your body stay balanced.',
        },
        {
          title: 'Keep moving gently',
          description: 'Light walking and normal daily activity can be enough.',
        },
      ],
    },
  }

  return fieldSuggestions[field]?.[status] || sharedSuggestions
}

function getMissingValuesInsight() {
  return {
    score: 0,
    statusSummary: 'Unable to assess - insufficient data',
    abnormalities: [],
    mainInsight: {
      title: 'Blood test numbers needed',
      message:
        'Please share the main blood test numbers so I can give a simple summary.',
      severity: 'low',
    },
    bullets: [
      'At least one number is missing or unclear',
      'A full set gives a clearer picture',
    ],
    suggestions: [
      {
        title: 'Check the numbers again',
        description: 'Look over the report to make sure each value is easy to read.',
      },
      {
        title: 'Save the old reports',
        description: 'Comparing past results can help spot changes over time.',
      },
    ],
  }
}

// Helper: Generate fallback bullets list
function generateFallbackBullets(abnormalities) {
  if (!abnormalities || abnormalities.length === 0) {
    return ['All detected values are within normal ranges', 'Continue with regular health checkups']
  }
  
  return abnormalities.slice(0, 2).map(a => `${a.name} (${a.value} ${a.unit}) is ${a.status}`)
}

function sanitizeStructuredSummary(parsed) {
  if (!parsed || typeof parsed !== 'object') return null

  const mainInsight = parsed.mainInsight && typeof parsed.mainInsight === 'object'
    ? parsed.mainInsight
    : {}

  const allowedSeverities = new Set(['low', 'moderate', 'high', 'normal'])
  const severity = allowedSeverities.has(String(mainInsight.severity || '').toLowerCase())
    ? String(mainInsight.severity || '').toLowerCase()
    : 'low'

  const bullets = Array.isArray(parsed.bullets)
    ? parsed.bullets.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 4)
    : []

  const suggestions = Array.isArray(parsed.suggestions)
    ? parsed.suggestions
      .map((item) => ({
        title: String(item?.title || '').trim(),
        description: String(item?.description || '').trim(),
      }))
      .filter((item) => item.title && item.description)
      .slice(0, 4)
    : []

  const sanitized = {
    mainInsight: {
      title: String(mainInsight.title || '').trim() || 'CBC insight',
      message: String(mainInsight.message || '').trim() || 'CBC values reviewed.',
      severity,
    },
    bullets,
    suggestions,
  }

  const confidenceNote = String(parsed.confidenceNote || '').trim()
  if (confidenceNote) sanitized.confidenceNote = confidenceNote

  return sanitized
}

function parseStructuredSummary(text) {
  const clean = String(text || '')
    .replace(/```json\s*/gi, '')
    .replace(/```/g, '')
    .trim()

  const candidates = [clean]
  const objectMatch = clean.match(/\{[\s\S]*\}/)
  if (objectMatch) candidates.push(objectMatch[0])

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate)
      const sanitized = sanitizeStructuredSummary(parsed)
      if (sanitized?.mainInsight?.title && sanitized?.mainInsight?.message) {
        return sanitized
      }
    } catch (_error) {
    }
  }

  throw new Error('Gemini returned invalid structured JSON')
}

function generateFallbackSummary(values, score) {
  const fields = ['hemoglobin', 'rbc', 'wbc', 'platelets']
  if (fields.some((field) => isUnavailable(values[field]))) {
    return getMissingValuesInsight()
  }

  const priority = ['hemoglobin', 'platelets', 'wbc', 'rbc']
  const labels = {
    hemoglobin: 'Hemoglobin',
    platelets: 'Platelets',
    wbc: 'WBC',
    rbc: 'RBC',
  }

  const firstAbnormalField = priority.find((field) => {
    const status = getStatusForValue(values[field], field)
    return status === 'low' || status === 'high'
  })

  if (!firstAbnormalField) {
    return {
      mainInsight: {
        title: 'Blood test looks okay',
        message: 'The main numbers we checked are in a normal range.',
        severity: 'normal',
      },
      bullets: [
        'The main numbers do not look out of place',
        'Keep up good daily habits and regular checkups',
      ],
      suggestions: getSimpleSuggestions(firstAbnormalField, 'normal'),
    }
  }

  const status = getStatusForValue(values[firstAbnormalField], firstAbnormalField)
  const value = values[firstAbnormalField]
  const { unit, min, max } = RANGES[firstAbnormalField]

  const severity = firstAbnormalField === 'hemoglobin'
    ? 'high'
    : firstAbnormalField === 'platelets'
      ? 'moderate'
      : firstAbnormalField === 'wbc'
        ? 'moderate'
        : 'low'

  return {
    mainInsight: {
      title: `${getSimpleFieldName(firstAbnormalField)} is ${status}`,
      message: `${getSimpleFieldName(firstAbnormalField)} is ${value} ${unit}. ${getSimpleValueMeaning(firstAbnormalField, status)}`,
      severity,
    },
    bullets: [
      `${getSimpleFieldName(firstAbnormalField)} is not in the usual range`,
      'The other numbers also matter for the full picture',
    ],
    suggestions: getSimpleSuggestions(firstAbnormalField, status),
    ...(score === null
      ? {}
      : {
        confidenceNote:
            score >= 75
              ? 'The overall pattern looks fairly steady.'
              : 'A few numbers may need a closer look over time.',
      }),
  }
}

/**
 * Generate AI insights from OCR extracted text
 * Dynamically extracts CBC values from text, calculates health score, and generates insights
 * @param {string} ocrText - OCR extracted text from CBC report
 * @param {number} timeoutMs - Request timeout in milliseconds
 * @returns {object} Structured insight with mainInsight, bullets, suggestions
 */
export async function generateAISummaryFromOCRText(ocrText, timeoutMs, gender = 'female') {
  const apiKey = getAiApiKey()

  if (!ocrText || typeof ocrText !== 'string' || !ocrText.trim()) {
    console.warn('[ARISE] Empty OCR text provided for AI summary')
    return getMissingValuesInsight()
  }

  try {
    // Step 1: Extract CBC values from OCR text
    console.log('[ARISE] Extracting CBC values from OCR text…')
    const values = extractCBCValuesFromOCR(ocrText)
    const detectedCount = countDetectedValues(values)

    if (detectedCount === 0) {
      console.warn('[ARISE] No CBC values extracted from text')
      return getMissingValuesInsight()
    }

    // Step 2: Calculate health score from extracted values
    const score = scoreHealth(values, gender)
    console.log('[ARISE] Health score:', score, '| Detected fields:', detectedCount)

    // Step 3: Build abnormalities list
    const abnormalities = buildAbnormalitiesList(values, gender)
    console.log('[ARISE] Abnormalities detected:', abnormalities.length)

    // Step 4: Build status summary
    const statusSummary = buildStatusSummary(score, abnormalities)
    console.log('[ARISE] Status summary:', statusSummary)

    // Step 5: Return fallback if no API key
    if (!apiKey) {
      console.log('[ARISE] No API key, using fallback summary')
      return {
        score: score ?? 0,
        statusSummary,
        abnormalities,
        mainInsight: generateFallbackMainInsight(abnormalities, score),
        bullets: generateFallbackBullets(abnormalities),
        suggestions: getSimpleSuggestions(abnormalities[0]?.name, abnormalities.length > 0 ? 'abnormal' : 'normal'),
      }
    }

    // Step 6: Filter and format only non-null values for AI
    const valuesToSend = Object.entries(values)
      .filter(([, v]) => !isUnavailable(v))
      .reduce((acc, [k, v]) => {
        const status = getStatusForValue(v, k, gender)
        const range = RANGES[k]
        let unit = range.unit
        let min, max
        
        if (k === 'hemoglobin' && range.male && range.female) {
          const rangeObj = gender === 'male' ? range.male : range.female
          min = rangeObj.min
          max = rangeObj.max
        } else {
          min = range.min || range.min
          max = range.max || range.max
        }
        
        acc[k] = { value: v, unit, status, range: `${min}–${max}` }
        return acc
      }, {})

    console.log('[ARISE] Sending to AI only non-null values:', Object.keys(valuesToSend).length)

    // Step 7: Build AI prompt with only abnormal values mentioned
    const abnormalOnly = abnormalities.map(a => 
      `- ${a.name}: ${a.value} ${a.unit} (${a.status}) - ${a.reason}`
    ).join('\n')

    const normalCount = detectedCount - abnormalities.length
    
    const prompt = `You are a clinical health assistant analyzing a CBC (Complete Blood Count) report.

EXTRACTED VALUES (all non-null, detected values):
${Object.entries(valuesToSend)
  .map(([k, v]) => `${k}: ${v.value} ${v.unit} (normal range: ${v.range}, status: ${v.status})`)
  .join('\n')}

ABNORMAL VALUES DETECTED (${abnormalities.length}):
${abnormalOnly || 'None - all values are normal'}

NORMAL VALUES: ${normalCount}
PATIENT HEALTH SCORE: ${score ?? 'unknown'}/100

Your task: Analyze ONLY the values provided above. Generate a clinical assessment that:
1. Mentions ONLY abnormal values
2. Does NOT include null/missing values
3. Keeps explanation to 2-3 sentences maximum
4. Avoids medical diagnosis - focus on observations
5. Uses simple, patient-friendly language
6. Never hallucinate data not provided above

Return ONLY valid JSON in this exact shape:
{
  "title": "Brief summary of main finding (max 10 words)",
  "message": "2-3 sentence explanation based ONLY on provided values",
  "severity": "normal|low|moderate|high",
  "keyFindings": [
    "specific abnormal finding 1",
    "specific abnormal finding 2"
  ]
}

Important: If all values are normal, return severity="normal" with positive message.
Return JSON only, no markdown, no extra text.`

    // Step 8: Call AI with structured data
    console.log('[ARISE] Sending structured CBC data to AI for analysis…')
    const text = await geminiGenerateContent(
      apiKey,
      {
        contents: [{ parts: [{ text: prompt }] }],
      },
      timeoutMs
    )

    // Step 9: Parse and enhance response
    let aiResponse
    try {
      aiResponse = JSON.parse(text)
    } catch (parseErr) {
      console.warn('[ARISE] AI response parse failed, using fallback:', parseErr.message)
      aiResponse = {
        title: generateFallbackMainInsight(abnormalities, score),
        message: buildStatusSummary(score, abnormalities),
        severity: score >= 75 ? 'normal' : score >= 50 ? 'moderate' : 'high',
        keyFindings: abnormalities.map(a => a.reason)
      }
    }

    // Step 10: Return structured output
    return {
      score: score ?? 0,
      statusSummary,
      abnormalities,
      mainInsight: {
        title: aiResponse.title || 'Health Assessment',
        message: aiResponse.message || statusSummary,
        severity: aiResponse.severity || (score >= 75 ? 'normal' : 'high')
      },
      bullets: aiResponse.keyFindings || abnormalities.map(a => a.reason),
      suggestions: getSimpleSuggestions(abnormalities[0]?.name, abnormalities.length > 0 ? 'abnormal' : 'normal'),
      confidence: {
        detectedFields: detectedCount,
        abnormalitiesFound: abnormalities.length,
        assessmentReliable: detectedCount >= 4
      }
    }
  } catch (error) {
    console.warn('[ARISE] AI summary generation failed:', error.message)
    
    // Fallback: Return best-effort summary using extracted values
    try {
      const values = extractCBCValuesFromOCR(ocrText)
      const score = scoreHealth(values, gender)
      const abnormalities = buildAbnormalitiesList(values, gender)
      const statusSummary = buildStatusSummary(score, abnormalities)
      
      return {
        score: score ?? 0,
        statusSummary,
        abnormalities,
        mainInsight: {
          title: generateFallbackMainInsight(abnormalities, score),
          message: statusSummary,
          severity: score >= 75 ? 'normal' : 'high'
        },
        bullets: abnormalities.map(a => a.reason),
        suggestions: getSimpleSuggestions(abnormalities[0]?.name, abnormalities.length > 0 ? 'abnormal' : 'normal'),
      }
    } catch (fallbackError) {
      console.error('[ARISE] Fallback failed:', fallbackError.message)
      return getMissingValuesInsight()
    }
  }
}

// Helper: Build status summary string
function buildStatusSummary(score, abnormalities) {
  if (abnormalities.length === 0) {
    return `All detected CBC values are within normal ranges. Health score: ${score || 'N/A'}/100`
  }
  
  const abnormalNames = abnormalities.slice(0, 2).map(a => a.name).join(', ')
  const moreText = abnormalities.length > 2 ? ` and ${abnormalities.length - 2} more` : ''
  return `${abnormalNames}${moreText} ${abnormalities.length === 1 ? 'is' : 'are'} outside normal range. Health score: ${score || 'N/A'}/100`
}

// Helper: Build fallback main insight
function generateFallbackMainInsight(abnormalities, score) {
  if (abnormalities.length === 0) {
    return 'Blood values look normal'
  }
  
  const topAbnormality = abnormalities[0]
  return `${topAbnormality.name} is ${topAbnormality.status}`
}

/**
 * Legacy function: Generate AI insights from pre-extracted values
 * Maintains backward compatibility with existing code
 */
async function generateAISummary(values, score, timeoutMs) {
  const apiKey = getAiApiKey()
  const fields = ['hemoglobin', 'rbc', 'wbc', 'platelets']

  if (fields.some((field) => isUnavailable(values[field]))) {
    return getMissingValuesInsight()
  }

  if (!apiKey) return generateFallbackSummary(values, score)

  try {
    const valueLines = Object.entries(values)
      .map(([k, v]) => {
        if (isUnavailable(v)) return `${k}: 0 (not detected)`
        const { min, max, unit } = RANGES[k]
        const status = getStatusForValue(v, k)
        return `${k}: ${v} ${unit} (normal: ${min}–${max}) — ${status}`
      })
      .join('\n')

    const prompt = `You are a health assistant explaining CBC (Complete Blood Count) reports in very simple language.

Given values:

${valueLines}

Return ONLY valid JSON in this exact shape:
{
  "mainInsight": {
    "title": "",
    "message": "",
    "severity": "low | moderate | high | normal"
  },
  "bullets": [
    "short bullet insight 1",
    "short bullet insight 2"
  ],
  "suggestions": [
    {
      "title": "",
      "description": ""
    }
  ],
  "confidenceNote": ""
}

Rules:
- Use everyday words and avoid medical jargon
- Do not sound like a diagnosis or mention diseases
- If a value is low, explain what low usually means in normal life
- If a value is high, explain what high usually means in normal life
- Give 1 or 2 simple food or lifestyle tips only
- If all values are normal, say the main numbers look okay
- Prioritize the most important abnormal value for mainInsight using this order: Hemoglobin > Platelets > WBC > RBC
- Keep the tone calm, kind, and reassuring
- Return JSON only, no markdown, no extra text

Overall health score: ${score ?? 'unknown'}/100`

    const text = await geminiGenerateContent(
      apiKey,
      {
        contents: [{ parts: [{ text: prompt }] }],
      },
      timeoutMs
    )

    return parseStructuredSummary(text)
  } catch (error) {
    console.warn('[ARISE] AI summary failed, using fallback:', error.message)
    return generateFallbackSummary(values, score)
  }
}

// ──────────────────────────────────────────────────────────────
// FILE UPLOAD TO SUPABASE
// ──────────────────────────────────────────────────────────────
export async function uploadReportFile({
  userId,
  fileUri,
  fileName,
  mimeType,
}) {
  try {
    const timestamp = Date.now()
    const safeName = fileName
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/\s+/g, '_')
    const filePath = `reports/${userId}/${timestamp}_${safeName}`

    console.log('[ARISE] Reading file…')
    const base64 = await readFileAsBase64(fileUri)

    console.log('[ARISE] Converting to binary…')
    const arrayBuffer = decode(base64)

    console.log('[ARISE] Uploading to Supabase storage:', filePath)
    const { error } = await supabase.storage
      .from('cbc-reports')
      .upload(filePath, arrayBuffer, {
        contentType: mimeType,
        upsert: false,
      })

    if (error) {
      throw new Error('Storage upload failed: ' + error.message)
    }

    console.log('[ARISE] File uploaded successfully')

    const { data: urlData } = supabase.storage
      .from('cbc-reports')
      .getPublicUrl(filePath)

    return {
      filePath,
      fileUrl: urlData.publicUrl,
    }
  } catch (error) {
    console.error('[ARISE] Upload error:', error)
    throw error
  }
}

// ──────────────────────────────────────────────────────────────
// MAIN ANALYSIS PIPELINE
// ──────────────────────────────────────────────────────────────
/**
 * analyzeReport — runs the full CBC analysis pipeline
 */
export async function analyzeReport({
  reportId,
  fileUri,
  filePath,
  fileType,
  timeoutMs = DEFAULT_AI_TIMEOUT_MS,
  preExtractedText = null,
}) {
  try {
    let values = {
      hemoglobin: null,
      rbc: null,
      wbc: null,
      platelets: null,
      mcv: null,
      mch: null,
      mchc: null,
      neutrophils: null,
      lymphocytes: null,
      esr: null,
    }
    let score = null
    let summary = null
    let geminiError = null
    let extractedText = ''

    console.log('[ARISE] Starting analysis for report:', reportId, `(${AI_PIPELINE_VERSION})`)

    let fileBase64 = null
    if (fileUri) {
      console.log('[ARISE] Converting local file to base64…')
      fileBase64 = await readFileAsBase64(fileUri)
    } else if (filePath) {
      console.log('[ARISE] Fetching file via signed URL…')
      fileBase64 = await fetchBase64ViaSignedUrl(filePath)
    } else {
      throw new Error('Either fileUri or filePath must be provided')
    }

    // If the caller provided pre-extracted OCR text (e.g. from Google Vision), use it
    if (preExtractedText) {
      console.log('[ARISE] Using pre-extracted OCR text provided by caller')
      extractedText = String(preExtractedText || '').trim()
      console.log('[ARISE][OCR] Pre-extracted text length:', extractedText.length)
    }

    try {
      if (!extractedText) {
        extractedText = await extractRawTextWithGemini(fileBase64, fileType, timeoutMs)
      }

      if (__DEV__) {
        console.log('[OCR] Raw OCR text sample:', extractedText.slice(0, 240))
      } else {
        console.log('[OCR] Raw OCR text length:', extractedText.length)
      }

      if (extractedText) {
        if (isReferenceRangeOnlyDocument(extractedText)) {
          console.warn('[ARISE] Reference-range heuristic matched, but continuing because the report may still contain measured patient values.')
        }

        values = extractExtendedCBCFromText(extractedText)
        console.log('[ARISE][CBC] Values from extractExtendedCBCFromText:', values)
      } else {
        // OCR fallback: try the older Gemini extraction path only when OCR text cannot be obtained.
        const extracted = await extractCBCWithGemini(fileBase64, fileType, timeoutMs)
        if (extracted) {
          values = {
            hemoglobin: normalizeFieldValue('hemoglobin', extracted.hemoglobin),
            rbc: normalizeFieldValue('rbc', extracted.rbc),
            wbc: normalizeFieldValue('wbc', extracted.wbc),
            platelets: normalizeFieldValue('platelets', extracted.platelets),
            mcv: null,
            mch: null,
            mchc: null,
            neutrophils: null,
            lymphocytes: null,
            esr: null,
          }
          console.log('[ARISE][CBC] Values from legacy Gemini extraction fallback:', values)
        }
      }
    } catch (err) {
      geminiError = err.message
      console.error('[ARISE] Primary extraction failed:', err.message)
    }

    const summaryValues = {
      hemoglobin: values.hemoglobin,
      rbc: values.rbc,
      wbc: values.wbc,
      platelets: values.platelets,
      mcv: values.mcv,
      mch: values.mch,
      mchc: values.mchc,
      neutrophils: values.neutrophils,
      lymphocytes: values.lymphocytes,
      esr: values.esr,
    }

    const hasDetectedValues = Object.values(summaryValues).some((v) => !isUnavailable(v))
    score = scoreHealth(summaryValues)
    console.log('[ARISE] Health score:', score)
    
    // Log what was detected
    if (!hasDetectedValues) {
      console.warn('[ARISE] ⚠️  No CBC values detected in extracted text')
      console.warn('[ARISE] Extracted text sample:', extractedText?.substring(0, 200))
    } else {
      const detectedCount = Object.entries(values).filter(([, v]) => !isUnavailable(v)).length
      console.log(`[ARISE] ✓ Detected ${detectedCount} CBC values`)
    }

    try {
      summary = extractedText
        ? await generateAISummaryFromOCRText(extractedText, timeoutMs)
        : generateFallbackSummary(summaryValues, score)
    } catch (err) {
      console.warn('[ARISE] AI summary failed, using fallback:', err.message)
      summary = generateFallbackSummary(summaryValues, score)
    }

    if (geminiError) {
      const aiKey = getAiApiKey()
      const normalizeError = isOpenRouterKey(aiKey)
        ? normalizeOpenRouterError(0, geminiError)
        : normalizeGeminiError(geminiError)
      summary = {
        ...(summary || generateFallbackSummary(summaryValues, score)),
        confidenceNote: `Extraction fallback applied: ${normalizeError}`,
      }
    }

    if (!hasDetectedValues) {
      summary = getMissingValuesInsight()
    }

    if (!summary || typeof summary !== 'object') {
      summary = generateFallbackSummary(summaryValues, score)
    }

    const normalizedCbcValues = {
      hemoglobin: values.hemoglobin ?? null,
      rbc: values.rbc ?? null,
      wbc: values.wbc ?? null,
      platelets: values.platelets ?? null,
      mcv: values.mcv ?? null,
      mch: values.mch ?? null,
      mchc: values.mchc ?? null,
      neutrophils: values.neutrophils ?? null,
      lymphocytes: values.lymphocytes ?? null,
      esr: values.esr ?? null,
    }

    const analysisPayload = {
      report_id: reportId,
      hemoglobin: normalizedCbcValues.hemoglobin,
      rbc: normalizedCbcValues.rbc,
      wbc: normalizedCbcValues.wbc,
      platelets: normalizedCbcValues.platelets,
      mcv: normalizedCbcValues.mcv,
      mch: normalizedCbcValues.mch,
      mchc: normalizedCbcValues.mchc,
      neutrophils: normalizedCbcValues.neutrophils,
      lymphocytes: normalizedCbcValues.lymphocytes,
      esr: normalizedCbcValues.esr,
      cbc_values: normalizedCbcValues,
      health_score: score ?? null,
      ai_summary: JSON.stringify(summary),
    }

    console.log('[SUPABASE] Final payload being saved', analysisPayload)
    const { data, error } = await supabase
      .from('report_analysis')
      .insert(analysisPayload)
      .select()
      .single()

    if (error) {
      console.error('[ARISE] Database error:', error)
      return {
        success: false,
        error: `Database error: ${error.message}`,
      }
    }

    console.log('[ARISE] Analysis saved successfully ✓')
    if (!hasDetectedValues) {
      return {
        success: false,
        data,
        error: 'No CBC values detected. Please upload a clearer report PDF and retry.',
      }
    }

    return { success: true, data }
  } catch (err) {
    console.error('[ARISE] Pipeline error:', err)
    return {
      success: false,
      error: toReadableError(err) || 'Analysis pipeline failed',
    }
  }
}

async function extractRawTextWithGemini(fileBase64, mimeType, timeoutMs) {
  const apiKey = getAiApiKey()
  if (!apiKey) {
    throw new Error('EXPO_PUBLIC_GEMINI_API_KEY is missing from .env')
  }

  const prompt = `Extract all visible report text exactly as plain text.
Do not summarize.
Do not return JSON.
Keep line breaks where possible.`

  const text = await geminiGenerateContent(
    apiKey,
    {
      contents: [
        {
          parts: [
            { inlineData: { data: fileBase64, mimeType } },
            { text: prompt },
          ],
        },
      ],
    },
    timeoutMs
  )

  return String(text || '').trim()
}

function parseScaledNumber(raw, field) {
  if (!raw) return null
  const compact = String(raw)
    .toLowerCase()
    .replace(/,/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  const sci = compact.match(/(\d+(?:\.\d+)?)\s*(?:x|×|\*)\s*10\s*\^?\s*(\d+)/i)
  if (sci) {
    const base = Number(sci[1])
    const exp = Number(sci[2])
    if (!Number.isNaN(base) && !Number.isNaN(exp)) {
      const value = base * 10 ** exp
      return Math.round(value)
    }
  }

  const n = Number((compact.match(/\d+(?:\.\d+)?/) || [])[0])
  if (Number.isNaN(n)) return null

  if (/(lakh|lakhs)\b/i.test(compact)) {
    return Math.round(n * 100000)
  }

  if (/\b[k]\b|\bthousand\b/i.test(compact)) {
    return Math.round(n * 1000)
  }

  if (/\bmillion\b|\bm\/?u?l\b|\bm\b/i.test(compact) && field === 'rbc') {
    return Number(n.toFixed(2))
  }

  return n
}

function extractCBCValuesFromOCR(ocrText) {
  const lines = String(ocrText || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const text = lines.join('\n')

  console.log('[PARSER] Split OCR lines array:', lines.length, 'lines')

  const values = {
    hemoglobin: null,
    rbc: null,
    wbc: null,
    platelets: null,
    mcv: null,
    mch: null,
    mchc: null,
    neutrophils: null,
    lymphocytes: null,
    esr: null,
  }

  function extractNum(textValue) {
    const match = String(textValue).match(/(\d+(?:\.\d+)?)/)
    return match ? parseFloat(match[1]) : null
  }

  // IMPROVED HELPER: Extract numeric value from current or next few lines
  function extractNextNumber(startIndex, maxLinesToCheck = 2) {
    if (startIndex < 0 || startIndex >= lines.length) {
      return null
    }

    // Check current line first
    const currentLine = lines[startIndex] || ''
    let num = extractNum(currentLine)
    if (num !== null) {
      console.log(`[EXTRACT] Found number on same line: "${currentLine.substring(0, 60)}" → ${num}`)
      return num
    }

    // Check next 1-2 lines
    for (let offset = 1; offset <= maxLinesToCheck && startIndex + offset < lines.length; offset++) {
      const nextLine = lines[startIndex + offset] || ''

      // Skip empty lines and lines that are clearly labels/headers (all alphabetic)
      if (!nextLine.trim() || /^[a-zA-Z\s()]*$/.test(nextLine)) {
        continue
      }

      num = extractNum(nextLine)
      if (num !== null) {
        console.log(`[EXTRACT] Found number on line +${offset}: "${nextLine.substring(0, 60)}" → ${num}`)
        return num
      }
    }

    return null
  }

  // Process each line looking for field labels
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const lineLower = line.toLowerCase()

    // HEMOGLOBIN / HGB
    if ((lineLower.includes('haemoglobin') || lineLower.includes('hemoglobin') || lineLower.includes('hgb')) && values.hemoglobin === null) {
      const val = extractNextNumber(i)
      if (val !== null) {
        values.hemoglobin = normalizeFieldValue('hemoglobin', val)
        console.log(`[EXTRACT] hemoglobin = ${values.hemoglobin} (from: "${line}")`)
      }
      continue
    }

    // RBC / RED BLOOD CELLS
    if ((lineLower.includes('rbc') || lineLower.includes('red blood cell') || lineLower.includes('erythrocyte')) && values.rbc === null) {
      const val = extractNextNumber(i)
      if (val !== null) {
        values.rbc = normalizeFieldValue('rbc', val)
        console.log(`[EXTRACT] rbc = ${values.rbc} (from: "${line}")`)
      }
      continue
    }

    // WBC / LEUKOCYTE / TLC
    if ((lineLower.includes('wbc') || lineLower.includes('leukocyte') || lineLower.includes('total leukocyte count') || lineLower.includes('tlc') || lineLower.includes('white blood cell')) && values.wbc === null) {
      let wbcVal = extractNextNumber(i)
      if (wbcVal !== null) {
        // WBC is often reported in thousands (e.g., 5.5 means 5500)
        const contextWindow = lines.slice(Math.max(0, i - 1), Math.min(lines.length, i + 5)).join(' ').toLowerCase()
        const hasThousandMarker = /thou|k\/mm|k\/ul|×\s*10\^?3|x\s*10\^?3|10\^3|\/ul|\bk\b/.test(contextWindow)
        if (hasThousandMarker && wbcVal < 1000) {
          console.log(`[EXTRACT] WBC scaling: ${wbcVal} × 1000 = ${Math.round(wbcVal * 1000)} (detected: ${contextWindow.substring(0, 40)})`)
          wbcVal = Math.round(wbcVal * 1000)
        }
        values.wbc = normalizeFieldValue('wbc', wbcVal)
        console.log(`[EXTRACT] wbc = ${values.wbc} (from: "${line}")`)
      }
      continue
    }

    // PLATELETS
    if ((lineLower.includes('platelet') || lineLower.includes('plt')) && values.platelets === null) {
      let plateletVal = extractNextNumber(i)
      if (plateletVal !== null) {
        // Platelets are often reported in thousands (e.g., 180 means 180000)
        const contextWindow = lines.slice(Math.max(0, i - 1), Math.min(lines.length, i + 5)).join(' ').toLowerCase()
        const hasThousandMarker = /thou|k\/mm|k\/ul|×\s*10\^?3|x\s*10\^?3|10\^3|\/ul|\bk\b/.test(contextWindow)
        if (hasThousandMarker && plateletVal < 1000) {
          console.log(`[EXTRACT] Platelets scaling: ${plateletVal} × 1000 = ${Math.round(plateletVal * 1000)} (detected: ${contextWindow.substring(0, 40)})`)
          plateletVal = Math.round(plateletVal * 1000)
        }
        values.platelets = normalizeFieldValue('platelets', plateletVal)
        console.log(`[EXTRACT] platelets = ${values.platelets} (from: "${line}")`)
      }
      continue
    }

    // MCV
    if ((lineLower.includes('mcv') || lineLower.includes('mean corpuscular volume')) && values.mcv === null) {
      const val = extractNextNumber(i)
      if (val !== null) {
        values.mcv = normalizeFieldValue('mcv', val)
        console.log(`[EXTRACT] mcv = ${values.mcv} (from: "${line}")`)
      }
      continue
    }

    // MCH
    if ((lineLower.includes('mch') && !lineLower.includes('mchc')) || lineLower.includes('mean corpuscular hemoglobin')) {
      if (values.mch === null) {
        const val = extractNextNumber(i)
        if (val !== null) {
          values.mch = normalizeFieldValue('mch', val)
          console.log(`[EXTRACT] mch = ${values.mch} (from: "${line}")`)
        }
      }
      continue
    }

    // MCHC
    if ((lineLower.includes('mchc') || lineLower.includes('mean corpuscular hemoglobin concentration')) && values.mchc === null) {
      const val = extractNextNumber(i)
      if (val !== null) {
        values.mchc = normalizeFieldValue('mchc', val)
        console.log(`[EXTRACT] mchc = ${values.mchc} (from: "${line}")`)
      }
      continue
    }

    // NEUTROPHILS
    if ((lineLower.includes('neutrophil') || lineLower.includes('segmented neutrophil')) && !lineLower.includes('band') && values.neutrophils === null) {
      const val = extractNextNumber(i)
      if (val !== null) {
        values.neutrophils = normalizeFieldValue('neutrophils', val)
        console.log(`[EXTRACT] neutrophils = ${values.neutrophils} (from: "${line}")`)
      }
      continue
    }

    // LYMPHOCYTES
    if ((lineLower.includes('lymphocyte') || lineLower.includes('lymph')) && !lineLower.includes('monocyte') && values.lymphocytes === null) {
      const val = extractNextNumber(i)
      if (val !== null) {
        values.lymphocytes = normalizeFieldValue('lymphocytes', val)
        console.log(`[EXTRACT] lymphocytes = ${values.lymphocytes} (from: "${line}")`)
      }
      continue
    }

    // ESR
    if ((lineLower.includes('esr') || lineLower.includes('erythrocyte sedimentation rate') || lineLower.includes('sedimentation rate')) && values.esr === null) {
      const val = extractNextNumber(i)
      if (val !== null) {
        values.esr = normalizeFieldValue('esr', val)
        console.log(`[EXTRACT] esr = ${values.esr} (from: "${line}")`)
      }
      continue
    }
  }

  console.log('[VALUES] Final extracted CBC values:', JSON.stringify(values, null, 2))
  return values
}

function extractCBCWithTfIdf(rawText) {
  return extractCBCValuesFromOCR(rawText)
}

function hasPatientValueEvidence(rawText, field) {
  const text = String(rawText || '').toLowerCase()
  if (!text.trim()) return false

  const keywords = {
    hemoglobin: ['hemoglobin', 'haemoglobin', 'hgb', 'hb'],
    rbc: ['rbc', 'red blood cell', 'red blood cells', 'erythrocyte', 'erythrocytes', 'rbc count'],
    wbc: ['wbc', 'white blood cell', 'white blood cells', 'tlc', 'leukocyte', 'leucocyte', 'wbc count'],
    platelets: ['platelet', 'platelets', 'plt', 'platelet count'],
    mcv: ['mcv', 'mean corpuscular volume', 'mean cell volume'],
    mch: ['mch', 'mean corpuscular hemoglobin', 'mean cell hemoglobin'],
    mchc: ['mchc', 'mean corpuscular hemoglobin concentration'],
    neutrophils: ['neutrophil', 'neutrophils', 'neut', 'pmn', 'polymorphs'],
    lymphocytes: ['lymphocyte', 'lymphocytes', 'lymph', 'lym'],
    esr: ['esr', 'erythrocyte sedimentation rate', 'sedimentation rate', 'sed rate'],
  }

  const fieldKeywords = keywords[field] || []
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  for (const line of lines) {
    if (!fieldKeywords.some((keyword) => line.includes(keyword))) continue

    const hasNumber = /\d/.test(line)
    const hasRangePattern = /\d+(?:\.\d+)?\s*[-–]\s*\d+(?:\.\d+)?/.test(line)
    const isReferenceLine = /(normal range|reference range|male|female)/.test(line)
    if (hasNumber && !hasRangePattern && !isReferenceLine) {
      return true
    }
  }

  return false
}

/**
 * Call Google Vision OCR (DOCUMENT_TEXT_DETECTION) with a base64 image payload.
 * Returns extracted plain text, or an empty string when OCR is unavailable.
 */
export async function callGoogleVisionOcr(imageBase64, mimeType) {
  const apiKey = getVisionApiKey()
  if (!apiKey) {
    console.warn('[ARISE] Vision OCR skipped: EXPO_PUBLIC_VISION_API_KEY is not configured')
    return ''
  }

  try {
    if (!imageBase64) return ''

    // Accept both raw base64 and data-URL forms. Google Vision expects raw base64
    let cleanBase64 = String(imageBase64 || '').trim()
    if (cleanBase64.startsWith('data:')) {
      // Extract base64 after the comma, handling various data URL formats
      const commaIndex = cleanBase64.indexOf(',')
      if (commaIndex !== -1) {
        cleanBase64 = cleanBase64.substring(commaIndex + 1).trim()
      } else {
        console.warn('[ARISE] Vision OCR: Invalid data URL format (no comma found)')
        return ''
      }
    }

    // Validate base64 string - should only contain base64 characters and no whitespace
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(cleanBase64)) {
      console.warn('[ARISE] Vision OCR: Invalid base64 characters detected')
      return ''
    }

    const body = {
      requests: [
        {
          image: { content: cleanBase64 },
          features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
        },
      ],
    }

    const res = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    )

    const raw = await res.text()
    const json = raw ? JSON.parse(raw) : null

    if (!res.ok) {
      const message =
        json?.error?.message || `Vision HTTP ${res.status}`
      console.warn('[ARISE] Vision OCR request failed:', message)
      return ''
    }

    const resp = json?.responses?.[0]
    if (!resp) {
      console.warn('[ARISE] Vision OCR: empty response payload')
      return ''
    }

    if (resp?.error?.message) {
      console.warn('[ARISE] Vision OCR response error:', resp.error.message)
      return ''
    }

    const text = resp.fullTextAnnotation?.text || resp.textAnnotations?.[0]?.description || ''
    return String(text || '').trim()
  } catch (err) {
    console.warn('[ARISE] Vision OCR error (continuing without pre-read):', err?.message || err)
    return ''
  }
}