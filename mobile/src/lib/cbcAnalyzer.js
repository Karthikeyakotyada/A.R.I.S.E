import { EncodingType, readAsStringAsync } from 'expo-file-system/legacy'
import { Platform } from 'react-native'
import { decode } from 'base64-arraybuffer'
import { supabase } from './supabaseClient'

export const RANGES = {
  hemoglobin: { min: 12.0, max: 17.5, unit: 'g/dL' },
  rbc: { min: 3.8, max: 6.1, unit: 'M/µL' },
  wbc: { min: 4000, max: 11000, unit: '/µL' },
  platelets: { min: 150000, max: 450000, unit: '/µL' },
}

export function getStatusForValue(value, field) {
  if (value === null || value === undefined || Number(value) <= 0) return 'unknown'
  const { min, max } = RANGES[field]
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

// ──────────────────────────────────────────────────────────────
// AI SUMMARY GENERATION
// ──────────────────────────────────────────────────────────────
function getMissingValuesInsight() {
  return {
    mainInsight: {
      title: 'CBC values needed',
      message:
        'Please provide hemoglobin, RBC, WBC, and platelet values for a complete CBC insight.',
      severity: 'low',
    },
    bullets: [
      'At least one CBC value is missing or unclear',
      'A complete set helps prioritize the most important finding',
    ],
    suggestions: [
      {
        title: 'Review report values',
        description: 'Recheck each number and unit before analysis.',
      },
      {
        title: 'Track CBC trends',
        description: 'Compare results over time to notice changes early.',
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
        title: 'CBC looks stable',
        message: 'All provided CBC values are within expected ranges.',
        severity: 'normal',
      },
      bullets: [
        'Hemoglobin, RBC, WBC, and platelets appear in range',
        'Continue healthy daily habits and regular checkups',
      ],
      suggestions: [
        {
          title: 'Stay well hydrated',
          description: 'Drink enough water daily to support blood health.',
        },
        {
          title: 'Keep balanced meals',
          description: 'Include fruits, vegetables, protein, and iron-rich foods.',
        },
      ],
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
      title: `${labels[firstAbnormalField]} is ${status}`,
      message: `${labels[firstAbnormalField]} is ${value} ${unit} (reference ${min}-${max}), which is the top priority finding right now.`,
      severity,
    },
    bullets: [
      `${labels[firstAbnormalField]} is outside the expected range`,
      'Other CBC values should be viewed together for full context',
    ],
    suggestions: [
      {
        title: 'Support recovery basics',
        description: 'Focus on rest, hydration, and regular balanced meals.',
      },
      {
        title: 'Monitor symptoms',
        description: 'Track fatigue, bruising, or fever and note any changes.',
      },
    ],
    ...(score === null
      ? {}
      : {
        confidenceNote:
            score >= 75
              ? 'Overall pattern appears relatively stable.'
              : 'Some values may need closer follow-up over time.',
      }),
  }
}

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

    const prompt = `You are a health assistant analyzing CBC (Complete Blood Count) reports.

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
- Keep insights short, clear, and user-friendly
- Do not give medical prescriptions
- Suggestions must be general lifestyle or home remedies only
- If all values are normal, return a positive main insight
- Prioritize the most important abnormal value for mainInsight using this order: Hemoglobin > Platelets > WBC > RBC
- Keep tone calm and supportive, not scary
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
}) {
  try {
    let values = { hemoglobin: null, rbc: null, wbc: null, platelets: null }
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

    try {
      if (fileType === 'application/pdf') {
        extractedText = await extractRawTextWithGemini(fileBase64, fileType, timeoutMs)
        if (isReferenceRangeOnlyDocument(extractedText)) {
          throw new Error('Reference range table detected; no patient result values found.')
        }
        values = extractCBCWithTfIdf(extractedText)
      } else {
        extractedText = await extractRawTextWithGemini(fileBase64, fileType, timeoutMs)
        if (isReferenceRangeOnlyDocument(extractedText)) {
          throw new Error('Reference range table detected; no patient result values found.')
        }

        const extracted = await extractCBCWithGemini(fileBase64, fileType, timeoutMs)
        if (extracted) {
          const aiValues = {
            hemoglobin: normalizeFieldValue('hemoglobin', extracted.hemoglobin),
            rbc: normalizeFieldValue('rbc', extracted.rbc),
            wbc: normalizeFieldValue('wbc', extracted.wbc),
            platelets: normalizeFieldValue('platelets', extracted.platelets),
          }

          const textValues = extractCBCWithTfIdf(extractedText)
          values = mergeValues(aiValues, textValues)
        }
      }

      values = keepOnlyTextSupportedValues(values, extractedText)
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
      summary = await generateAISummary(summaryValues, score, timeoutMs)
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

    values = withZeroFallback(values)

    console.log('[ARISE] Saving analysis to Supabase…')
    const { data, error } = await supabase
      .from('report_analysis')
      .insert({
        report_id: reportId,
        hemoglobin: values.hemoglobin,
        rbc: values.rbc,
        wbc: values.wbc,
        platelets: values.platelets,
        health_score: score,
        ai_summary: JSON.stringify(summary),
      })
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

  return null
}

function computeKeywordIdf(lines, keywords) {
  const total = Math.max(lines.length, 1)
  const map = {}
  for (const keyword of keywords) {
    const df = lines.reduce(
      (count, line) => (line.includes(keyword) ? count + 1 : count),
      0
    )
    map[keyword] = Math.log((total + 1) / (df + 1)) + 1
  }
  return map
}

function scoreLineTfIdf(line, keywords, idfMap) {
  let score = 0
  for (const keyword of keywords) {
    const occurrences = line.split(keyword).length - 1
    if (occurrences > 0) {
      score += occurrences * (idfMap[keyword] || 1)
    }
  }

  if (/\d/.test(line)) score += 0.4
  if (/(x|×|\*)\s*10\s*\^?\s*\d+/i.test(line)) score += 0.5
  return score
}

function extractFieldFromTextTfIdf(rawText, field, keywords) {
  const text = String(rawText || '').toLowerCase()
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (!lines.length) return null

  const idfMap = computeKeywordIdf(lines, keywords)

  const scored = lines
    .map((line) => ({
      line,
      score: scoreLineTfIdf(line, keywords, idfMap),
    }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)

  const candidates = scored.slice(0, 6)
  for (const candidate of candidates) {
    const matches = candidate.line.match(/\d+(?:\.\d+)?(?:\s*(?:x|×|\*)\s*10\s*\^?\s*\d+)?(?:\s*(?:k|lakh|lakhs|thousand))?/gi) || []
    for (const token of matches) {
      const parsed = parseScaledNumber(token, field)
      const normalized = normalizeFieldValue(field, parsed)
      if (normalized !== null) return normalized
    }
  }

  return null
}

function extractCBCWithTfIdf(rawText) {
  const fields = {
    hemoglobin: ['hemoglobin', 'haemoglobin', 'hgb', 'hb'],
    rbc: ['rbc', 'red blood cell', 'red blood cells', 'erythrocyte', 'erythrocytes'],
    wbc: ['wbc', 'white blood cell', 'white blood cells', 'tlc', 'leukocyte', 'leucocyte'],
    platelets: ['platelet', 'platelets', 'plt'],
  }

  return {
    hemoglobin: extractFieldFromTextTfIdf(rawText, 'hemoglobin', fields.hemoglobin),
    rbc: extractFieldFromTextTfIdf(rawText, 'rbc', fields.rbc),
    wbc: extractFieldFromTextTfIdf(rawText, 'wbc', fields.wbc),
    platelets: extractFieldFromTextTfIdf(rawText, 'platelets', fields.platelets),
  }
}

function hasPatientValueEvidence(rawText, field) {
  const text = String(rawText || '').toLowerCase()
  if (!text.trim()) return false

  const keywords = {
    hemoglobin: ['hemoglobin', 'haemoglobin', 'hgb', 'hb'],
    rbc: ['rbc', 'red blood cell', 'red blood cells', 'erythrocyte', 'erythrocytes'],
    wbc: ['wbc', 'white blood cell', 'white blood cells', 'tlc', 'leukocyte', 'leucocyte'],
    platelets: ['platelet', 'platelets', 'plt'],
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