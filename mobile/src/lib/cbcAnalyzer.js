import { EncodingType, readAsStringAsync } from 'expo-file-system/legacy'
import { Platform } from 'react-native'
import { decode } from 'base64-arraybuffer'
import { supabase } from './supabaseClient'

export const RANGES = {
  // Core CBC parameters
  hemoglobin: { min: 12.0, max: 17.5, unit: 'g/dL' },
  rbc: { min: 3.8, max: 6.1, unit: 'M/µL' },
  wbc: { min: 4000, max: 11000, unit: '/µL' },
  platelets: { min: 150000, max: 450000, unit: '/µL' },
  // Extended CBC parameters
  mcv: { min: 80, max: 100, unit: 'fL' },
  mch: { min: 27, max: 33, unit: 'pg' },
  mchc: { min: 32, max: 36, unit: 'g/dL' },
  neutrophils: { min: 40, max: 75, unit: '%' },
  lymphocytes: { min: 20, max: 40, unit: '%' },
  esr: { min: 0, max: 20, unit: 'mm/hr' },
}

export function getStatusForValue(value, field) {
  if (value === null || value === undefined || Number(value) <= 0) return 'unknown'
  const range = RANGES[field]
  if (!range) return 'unknown'
  const { min, max } = range
  if (value < min) return 'low'
  if (value > max) return 'high'
  return 'normal'
}

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

async function readFileAsBase64(fileUri) {
  const shouldUseFetchOnly =
    Platform.OS === 'web' || /^blob:/i.test(String(fileUri || '')) || /^https?:/i.test(String(fileUri || ''))

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

// ──────────────────────────────────────────────────────────────
// AI PROVIDER ROUTING (Gemini + OpenRouter)
// ──────────────────────────────────────────────────────────────
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1/models'
const OPENROUTER_API_BASE = 'https://openrouter.ai/api/v1/chat/completions'
const DEFAULT_GEMINI_MODEL_CANDIDATES = ['gemini-1.5-flash']
const DEFAULT_OPENROUTER_MODEL_CANDIDATES = [
  'google/gemini-2.0-flash-001',
  'google/gemini-2.5-flash-lite',
  'google/gemini-2.5-flash',
]
const DEFAULT_AI_TIMEOUT_MS = 35000
const AI_PIPELINE_VERSION = '2026-03-29-r2'

function isOpenRouterKey(apiKey) {
  return /^sk-or-v1-/i.test(String(apiKey || '').trim())
}

function getModelCandidates(apiKey) {
  const configuredModel = String(process.env.EXPO_PUBLIC_GEMINI_MODEL || '').trim()
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
    return "You're offline or connection is unstable."
  }
  return message
}

function geminiRequestToOpenRouterMessages(requestBody) {
  const parts = requestBody?.contents?.[0]?.parts || []
  const content = []

  for (const part of parts) {
    if (part?.text) {
      content.push({ type: 'text', text: part.text })
    }
    if (part?.inlineData?.data && part?.inlineData?.mimeType) {
      content.push({
        type: 'image_url',
        image_url: {
          url: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`,
        },
      })
    }
  }

  return [{ role: 'user', content }]
}

function getOpenRouterMaxTokens(requestBody) {
  const promptText = String(
    requestBody?.contents?.[0]?.parts
      ?.map((part) => part?.text || '')
      .join(' ') || ''
  ).toLowerCase()

  if (/extract all visible report text exactly/.test(promptText)) {
    return 2500
  }
  if (/return only a valid json object/.test(promptText)) {
    return 450
  }
  if (/health summary/.test(promptText) || /under 120 words/.test(promptText)) {
    return 320
  }

  return 900
}

function extractOpenRouterText(payload) {
  const content = payload?.choices?.[0]?.message?.content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string') return item
        if (item?.type === 'text') return item?.text || ''
        return ''
      })
      .join('')
      .trim()
  }
  return ''
}

async function openRouterGenerateContent(
  apiKey,
  requestBody,
  timeoutMs = DEFAULT_AI_TIMEOUT_MS
) {
  const models = getModelCandidates(apiKey)
  let lastError = null

  for (const model of models) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)

    try {
      console.log(`[ARISE] Attempting OpenRouter with model: ${model}`)

      const res = await fetch(OPENROUTER_API_BASE, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'X-OpenRouter-Title': 'ARISE Mobile',
        },
        // Defensive fallback prevents runtime breakage if hot-reload serves stale scope.
        // In normal flow, getOpenRouterMaxTokens is defined at module scope.
        
        body: JSON.stringify({
          model,
          max_tokens:
            typeof getOpenRouterMaxTokens === 'function'
              ? getOpenRouterMaxTokens(requestBody)
              : 900,
          messages: geminiRequestToOpenRouterMessages(requestBody),
        }),
        signal: controller.signal,
      })

      const json = await res.json()

      if (res.ok) {
        const text = extractOpenRouterText(json)
        if (text) {
          console.log(`[ARISE] OpenRouter success with model: ${model}`)
          return text
        }
        throw new Error('OpenRouter returned empty content')
      }

      const rawMessage = extractGeminiErrorMessage(json)
      const apiMessage = normalizeOpenRouterError(res.status, rawMessage)
      const isAuthError =
        res.status === 401 ||
        res.status === 403 ||
        /authentication failed|verify EXPO_PUBLIC_GEMINI_API_KEY/i.test(apiMessage)
      const isModelUnavailable =
        res.status === 404 ||
        ((res.status === 400 || res.status === 422) &&
          /not a valid model id|invalid model|unknown model|model unavailable|not found/i.test(
            String(rawMessage || apiMessage)
          ))
      const isQuotaLimited =
        res.status === 429 || /rate limit|quota|too many requests|insufficient credits|payment required/i.test(apiMessage)

      if (isAuthError) {
        throw new Error(apiMessage)
      }

      if (isModelUnavailable || isQuotaLimited) {
        console.warn(
          `[ARISE] OpenRouter model ${model} ${isQuotaLimited ? 'quota-limited' : 'unavailable'}, trying next…`
        )
        lastError = new Error(apiMessage)
        continue
      }

      throw new Error(apiMessage || `OpenRouter error (${res.status})`)
    } catch (err) {
      const friendly = toReadableError(err)
      console.error(`[ARISE] OpenRouter model ${model} failed:`, friendly)

      if (/openrouter authentication failed|verify EXPO_PUBLIC_GEMINI_API_KEY/i.test(String(friendly))) {
        throw new Error(friendly)
      }

      if (/offline or connection is unstable|timed out/i.test(friendly)) {
        throw new Error(friendly)
      }

      lastError = new Error(friendly)
    } finally {
      clearTimeout(timeout)
    }
  }

  throw new Error(lastError?.message || 'All OpenRouter models unavailable. Please try again.')
}

async function geminiGenerateContent(
  apiKey,
  requestBody,
  timeoutMs = DEFAULT_AI_TIMEOUT_MS
) {
  if (!apiKey) {
    throw new Error('EXPO_PUBLIC_GEMINI_API_KEY is not configured')
  }

  if (isOpenRouterKey(apiKey)) {
    return openRouterGenerateContent(apiKey, requestBody, timeoutMs)
  }

  const models = getModelCandidates(apiKey)
  let lastError = null

  for (const model of models) {
    const url = `${GEMINI_API_BASE}/${model}:generateContent?key=${apiKey}`
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
  const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY
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

  console.log('[ARISE] Gemini response:', text.substring(0, 100))

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
export function scoreHealth(values) {
  const fields = ['hemoglobin', 'rbc', 'wbc', 'platelets']
  let score = 100
  let known = 0

  for (const field of fields) {
    const v = values[field]
    if (isUnavailable(v)) continue
    known++
    const { min, max } = RANGES[field]
    const range = max - min
    if (v < min) {
      score -= Math.min(25, Math.round(((min - v) / range) * 30))
    } else if (v > max) {
      score -= Math.min(25, Math.round(((v - max) / range) * 30))
    }
  }

  if (known === 0) return null
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
function getSimpleFieldName(field) {
  const names = {
    hemoglobin: 'blood strength',
    rbc: 'red blood cells',
    wbc: 'germ-fighting cells',
    platelets: 'bleeding help cells',
  }

  return names[field] || 'blood count'
}

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
export async function generateAISummaryFromOCRText(ocrText, timeoutMs) {
  const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY

  if (!ocrText || typeof ocrText !== 'string' || !ocrText.trim()) {
    console.warn('[ARISE] Empty OCR text provided for AI summary')
    return getMissingValuesInsight()
  }

  try {
    // Step 1: Extract CBC values dynamically from OCR text
    console.log('[ARISE] Extracting CBC values from OCR text dynamically…')
    const values = extractCBCValuesFromOCR(ocrText)
    const detectedCount = countDetectedValues(values)

    if (detectedCount === 0) {
      console.warn('[ARISE] No CBC values extracted from text')
      return getMissingValuesInsight()
    }

    // Step 2: Calculate health score from extracted values
    const score = scoreHealth(values)
    console.log('[ARISE] Calculated health score from extracted values:', score, 'detected fields:', detectedCount)

    // Step 3: Return fallback if no API key
    if (!apiKey) {
      console.log('[ARISE] No API key, using fallback summary')
      return generateFallbackSummary(values, score)
    }

    // Step 4: Format extracted values as structured data for Gemini
    const valueLines = Object.entries(values)
      .map(([k, v]) => {
        if (isUnavailable(v)) return `${k}: not detected`
        const { min, max, unit } = RANGES[k]
        const status = getStatusForValue(v, k)
        return `${k}: ${v} ${unit} (reference: ${min}–${max}, status: ${status})`
      })
      .join('\n')

    // Step 5: Build prompt with OCR context and structured values
    const prompt = `You are a clinical health assistant analyzing a Complete Blood Count (CBC) report extracted via OCR.

The following CBC values were extracted from the patient's report:

${valueLines}

Context from report text: "${ocrText.substring(0, 300)}${ocrText.length > 300 ? '...' : ''}"

Based on these extracted values, return ONLY valid JSON in this exact shape:
{
  "mainInsight": {
    "title": "",
    "message": "",
    "severity": "low | moderate | high | normal"
  },
  "bullets": [
    "specific finding 1",
    "specific finding 2"
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
- Base insights ONLY on the extracted values provided above
- Keep insights short, clear, and user-friendly
- Do not give medical prescriptions or diagnoses
- Suggestions must be general lifestyle or home remedies only
- If all values are normal, return a positive main insight
- Prioritize the most important abnormal value for mainInsight: Hemoglobin > Platelets > WBC > RBC
- Keep tone calm, supportive, and non-alarmist
- If values seem unclear or conflicting, mention confidence concerns in confidenceNote
- Return JSON only, no markdown, no extra text

Patient health score: ${score ?? 'unknown'}/100
Detected fields: ${detectedCount}/4`

    // Step 6: Call Gemini with structured data
    console.log('[ARISE] Sending structured CBC data to Gemini for analysis…')
    const text = await geminiGenerateContent(
      apiKey,
      {
        contents: [{ parts: [{ text: prompt }] }],
      },
      timeoutMs
    )

    // Step 7: Parse and return structured response
    const parsed = parseStructuredSummary(text)
    console.log('[ARISE] AI-generated insight:', parsed.mainInsight.title)
    return parsed
  } catch (error) {
    console.warn('[ARISE] AI summary generation failed:', error.message)
    
    // Fallback: Return best-effort insight using extracted values
    try {
      const values = extractCBCValuesFromOCR(ocrText)
      const score = scoreHealth(values)
      return generateFallbackSummary(values, score)
    } catch (fallbackError) {
      console.error('[ARISE] Fallback failed:', fallbackError.message)
      return getMissingValuesInsight()
    }
  }
}

/**
 * Legacy function: Generate AI insights from pre-extracted values
 * Maintains backward compatibility with existing code
 */
async function generateAISummary(values, score, timeoutMs) {
  const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY
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
      console.log('[ARISE][OCR] Pre-extracted text:', extractedText)
    }

    try {
      if (!extractedText) {
        extractedText = await extractRawTextWithGemini(fileBase64, fileType, timeoutMs)
      }

      console.log('[OCR] Raw OCR text:', extractedText)

      if (extractedText) {
        if (isReferenceRangeOnlyDocument(extractedText)) {
          throw new Error('Reference range table detected; no patient result values found.')
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
    }

    const hasDetectedValues = Object.values(summaryValues).some((v) => !isUnavailable(v))
    score = scoreHealth(summaryValues)
    console.log('[ARISE] Health score:', score)

    try {
      summary = extractedText
        ? await generateAISummaryFromOCRText(extractedText, timeoutMs)
        : generateFallbackSummary(summaryValues, score)
    } catch (err) {
      console.warn('[ARISE] AI summary failed, using fallback:', err.message)
      summary = generateFallbackSummary(summaryValues, score)
    }

    if (geminiError) {
      summary = {
        ...(summary || generateFallbackSummary(summaryValues, score)),
        confidenceNote: `Extraction fallback applied: ${normalizeGeminiError(geminiError)}`,
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
  const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY
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

function normalizeFieldValue(field, value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return null
  }

  let v = Number(value)

  // Core parameters
  if (field === 'hemoglobin') {
    if (v > 0 && v <= 40) return Number(v.toFixed(2))
    return null
  }

  if (field === 'rbc') {
    if (v > 0 && v <= 20) return Number(v.toFixed(2))
    if (v > 1000000) return Number((v / 1000000).toFixed(2))
    return null
  }

  if (field === 'wbc') {
    if (v > 0 && v < 200) v = v * 1000
    if (v > 0 && v <= 200000) return Math.round(v)
    return null
  }

  if (field === 'platelets') {
    if (v > 0 && v < 1000) v = v * 1000
    if (v > 0 && v <= 2000000) return Math.round(v)
    return null
  }

  // Extended parameters
  if (field === 'mcv') {
    if (v > 0 && v <= 150) return Number(v.toFixed(2))
    return null
  }

  if (field === 'mch') {
    if (v > 0 && v <= 50) return Number(v.toFixed(2))
    return null
  }

  if (field === 'mchc') {
    if (v > 0 && v <= 50) return Number(v.toFixed(2))
    return null
  }

  if (field === 'neutrophils') {
    if (v >= 0 && v <= 100) return Number(v.toFixed(1))
    return null
  }

  if (field === 'lymphocytes') {
    if (v >= 0 && v <= 100) return Number(v.toFixed(1))
    return null
  }

  if (field === 'esr') {
    if (v >= 0 && v <= 200) return Number(v.toFixed(1))
    return null
  }

  return null
}

/**
 * Enhanced CBC extraction supporting 10 parameters
 * Line-by-line OCR parsing with lookahead for split label/value formats
 * Returns object with all fields; missing values are null
 * Maintains backward compatibility with core 4 parameters
 */
function extractCBCValuesFromOCR(ocrText) {
  const lines = String(ocrText || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

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

  // Helper: extract first number from a line
  function extractNumberFromLine(line) {
    const match = line.match(/(\d+(?:\.\d+)?)/)
    return match ? parseFloat(match[1]) : null
  }

  // Helper: set value only if valid and not already set
  function setIfFound(field, value, transform = (v) => v) {
    if (value === null || value === undefined || values[field] !== null) return
    const transformed = transform(value)
    if (transformed !== null && transformed !== undefined) {
      values[field] = transformed
      console.log(`[VALUES] ${field} = ${transformed}`)
    }
  }

  // Process each line independently with strict patterns
  lines.forEach((line) => {
    const lowerLine = line.toLowerCase()
    const num = extractNumberFromLine(line)
    if (num === null) return

    // Hemoglobin
    if (/\bhemoglobin\b|\bhgb\b|\bHb\b/i.test(line)) {
      setIfFound('hemoglobin', num)
    }

    // RBC
    if (/\brbc\b|\bred\s+blood\s+cell\b|\berythrocyte\b/i.test(line)) {
      setIfFound('rbc', num)
    }

    // WBC (normalize if needed)
    if (/\bwbc\b|\btlc\b|\bwhite\s+blood\s+cell\b|\bleukocyte\b/i.test(line)) {
      const normalized = /thou|k\/mm|k\/ul/i.test(line) ? num * 1000 : num
      setIfFound('wbc', normalized)
    }

    // Platelets
    if (/\bplatelet\b|\bplt\b/i.test(line)) {
      setIfFound('platelets', num)
    }

    // MCV (must NOT match MCHC)
    if (/\bmcv\b/i.test(line) && !/mchc/i.test(line)) {
      setIfFound('mcv', num)
    }

    // MCHC (strict word boundary)
    if (/\bmchc\b/i.test(line)) {
      setIfFound('mchc', num)
    }

    // MCH (strict word boundary, must NOT match MCHC)
    if (/\bmch\b(?!c)/i.test(line)) {
      setIfFound('mch', num)
    }

    // Neutrophils
    if (/\bneutrophil\b/i.test(line)) {
      setIfFound('neutrophils', num)
    }

    // Lymphocytes
    if (/\blymphocyte\b/i.test(line)) {
      setIfFound('lymphocytes', num)
    }

    // ESR
    if (/\besr\b|\bsedimentation\s+rate\b/i.test(line)) {
      setIfFound('esr', num)
    }
  })

  console.log('[VALUES] Final extracted:', JSON.stringify(values, null, 2))

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

function withZeroFallback(values) {
  return {
    hemoglobin: values.hemoglobin ?? 0,
    rbc: values.rbc ?? 0,
    wbc: values.wbc ?? 0,
    platelets: values.platelets ?? 0,
  }
}

function countDetectedValues(values) {
  return Object.values(values).reduce(
    (count, value) => (isUnavailable(value) ? count : count + 1),
    0
  )
}

function mergeValues(primary, fallback) {
  const primaryDetected = countDetectedValues(primary)
  const fallbackDetected = countDetectedValues(fallback)
  if (primaryDetected === 0 && fallbackDetected > 0) return fallback

  return {
    hemoglobin: primary.hemoglobin ?? fallback.hemoglobin ?? null,
    rbc: primary.rbc ?? fallback.rbc ?? null,
    wbc: primary.wbc ?? fallback.wbc ?? null,
    platelets: primary.platelets ?? fallback.platelets ?? null,
  }
}

function isReferenceRangeOnlyDocument(rawText) {
  const text = String(rawText || '').toLowerCase()
  if (!text.trim()) return false

  const hasRangeTerms =
    /(normal range|reference range|range \(male\)|range \(female\)|male|female)/i.test(
      text
    )
  const hasManyRanges = (text.match(/\d+(?:\.\d+)?\s*[-–]\s*\d+(?:\.\d+)?/g) || []).length >= 4
  const hasCbcLabels = /(hemoglobin|rbc|wbc|platelet|mcv|mch|mchc|hematocrit|rdw)/i.test(
    text
  )
  const hasResultTerms =
    /(result|value|observed|patient|test report|investigation|findings|units?)/i.test(
      text
    )

  return hasRangeTerms && hasManyRanges && hasCbcLabels && !hasResultTerms
}

function isUnavailable(value) {
  return value === null || value === undefined || Number(value) <= 0
}

/**
 * Call Google Vision OCR (DOCUMENT_TEXT_DETECTION) with a base64 image payload.
 * Returns extracted plain text, or an empty string when OCR is unavailable.
 */
export async function callGoogleVisionOcr(imageBase64, mimeType) {
  const apiKey = process.env.EXPO_PUBLIC_VISION_API_KEY
  if (!apiKey) {
    console.warn('[ARISE] Vision OCR skipped: EXPO_PUBLIC_VISION_API_KEY is not configured')
    return ''
  }

  try {
    if (!imageBase64) return ''

    const body = {
      requests: [
        {
          image: { content: imageBase64 },
          features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
        },
      ],
    }

    const res = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
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