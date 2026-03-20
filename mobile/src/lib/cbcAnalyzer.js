import * as FileSystem from 'expo-file-system'
import { decode } from 'base64-arraybuffer'
import { supabase } from './supabaseClient'

export const RANGES = {
  hemoglobin: { min: 12.0, max: 17.5, unit: 'g/dL' },
  rbc: { min: 3.8, max: 6.1, unit: 'M/uL' },
  wbc: { min: 4000, max: 11000, unit: '/uL' },
  platelets: { min: 150000, max: 450000, unit: '/uL' },
}

export function getStatusForValue(value, field) {
  if (value === null || value === undefined) return 'unknown'
  const { min, max } = RANGES[field]
  if (value < min) return 'low'
  if (value > max) return 'high'
  return 'normal'
}

async function readFileAsBase64(fileUri) {
  return FileSystem.readAsStringAsync(fileUri, {
    encoding: FileSystem.EncodingType.Base64,
  })
}

async function fetchBase64ViaSignedUrl(filePath) {
  const { data, error } = await supabase.storage
    .from('cbc-reports')
    .createSignedUrl(filePath, 120)

  if (error || !data?.signedUrl) {
    throw new Error('Signed URL error: ' + (error?.message ?? 'no URL returned'))
  }

  const downloaded = await FileSystem.downloadAsync(
    data.signedUrl,
    FileSystem.cacheDirectory + `signed-${Date.now()}`
  )

  return readFileAsBase64(downloaded.uri)
}

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1/models'
const GEMINI_MODEL_CANDIDATES = [
  process.env.EXPO_PUBLIC_GEMINI_MODEL,
  'gemini-2.0-flash',
  'gemini-1.5-flash',
].filter(Boolean)
const DEFAULT_AI_TIMEOUT_MS = 35000

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
  return message
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

async function geminiGenerateContent(apiKey, requestBody, timeoutMs = DEFAULT_AI_TIMEOUT_MS) {
  const models = [...new Set(GEMINI_MODEL_CANDIDATES)]
  let lastError = null

  for (const model of models) {
    const url = `${GEMINI_API_BASE}/${model}:generateContent?key=${apiKey}`
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      })

      const json = await res.json()
      if (res.ok) {
        return json.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
      }

      const apiMessage = normalizeGeminiError(extractGeminiErrorMessage(json))
      const isModelUnavailable =
        res.status === 404 || /model unavailable|not found|not supported for generatecontent/i.test(apiMessage)

      if (isModelUnavailable) {
        lastError = new Error(apiMessage)
        continue
      }

      throw new Error(apiMessage || `Gemini error (${res.status})`)
    } catch (err) {
      const friendly = toReadableError(err)
      if (/offline or connection is unstable|timed out/i.test(friendly)) {
        throw new Error(friendly)
      }
      lastError = new Error(friendly)
    } finally {
      clearTimeout(timeout)
    }
  }

  throw new Error(lastError?.message || 'AI model unavailable. Please try again.')
}

async function extractCBCWithGemini(imageBase64, mimeType, timeoutMs) {
  const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY
  if (!apiKey) throw new Error('EXPO_PUBLIC_GEMINI_API_KEY is missing')

  const prompt = `You are a medical data extractor. Analyze this Complete Blood Count (CBC) report image and extract the following test values.

Return ONLY a valid JSON object:
{
  "hemoglobin": <number in g/dL, or null>,
  "rbc": <number in millions per microliter (M/uL), or null>,
  "wbc": <number in cells per microliter (/uL), or null>,
  "platelets": <number in cells per microliter (/uL), or null>
}

Important conversion rules:
- WBC/TLC values like "8.2 x 10^3" mean 8200
- Platelets like "2.5 lakhs" mean 250000
- Platelets like "180 x 10^3" mean 180000
- If this is not a CBC report, return all nulls`

  const text = await geminiGenerateContent(apiKey, {
    contents: [
      {
        parts: [
          { inlineData: { data: imageBase64, mimeType } },
          { text: prompt },
        ],
      },
    ],
  }, timeoutMs)

  const clean = text.replace(/```json\s*/i, '').replace(/```/g, '').trim()
  try {
    return JSON.parse(clean)
  } catch {
    const match = clean.match(/\{[\s\S]*\}/)
    if (match) return JSON.parse(match[0])
    throw new Error('Gemini non-JSON response')
  }
}

export function scoreHealth(values) {
  const fields = ['hemoglobin', 'rbc', 'wbc', 'platelets']
  let score = 100
  let known = 0

  for (const field of fields) {
    const v = values[field]
    if (v === null || v === undefined) continue
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

function generateFallbackSummary(values, score) {
  const MESSAGES = {
    hemoglobin: {
      low: 'Hemoglobin is below normal, which may indicate anemia.',
      high: 'Hemoglobin is above normal.',
      normal: 'Hemoglobin is in the normal range.',
      unknown: 'Hemoglobin could not be detected.',
    },
    rbc: {
      low: 'RBC is low.',
      high: 'RBC is high.',
      normal: 'RBC is normal.',
      unknown: 'RBC could not be detected.',
    },
    wbc: {
      low: 'WBC is low.',
      high: 'WBC is high.',
      normal: 'WBC is normal.',
      unknown: 'WBC could not be detected.',
    },
    platelets: {
      low: 'Platelets are low.',
      high: 'Platelets are high.',
      normal: 'Platelets are normal.',
      unknown: 'Platelets could not be detected.',
    },
  }

  const lines = Object.keys(MESSAGES).map(
    (f) => MESSAGES[f][getStatusForValue(values[f], f)]
  )

  if (score !== null) {
    lines.push(
      score >= 75
        ? 'Overall your report looks healthy.'
        : score >= 50
          ? 'Some values need attention; consult your doctor.'
          : 'Multiple values are outside normal ranges; seek medical advice.'
    )
  }

  return lines.join(' ')
}

async function generateAISummary(values, score, timeoutMs) {
  const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY
  if (!apiKey) return generateFallbackSummary(values, score)

  const valueLines = Object.entries(values)
    .map(([k, v]) => {
      if (v === null || v === undefined) return `${k}: not detected`
      const { min, max, unit } = RANGES[k]
      const status = getStatusForValue(v, k)
      return `${k}: ${v} ${unit} (normal: ${min}-${max}) - ${status}`
    })
    .join('\n')

  const prompt = `You are ARISE, an AI health assistant. Use these CBC values:\n${valueLines}\nOverall health score: ${score ?? 'unknown'}/100\n\nWrite a clear 3-4 sentence summary for the patient. Keep it under 120 words and plain text.`

  const text = await geminiGenerateContent(apiKey, {
    contents: [{ parts: [{ text: prompt }] }],
  }, timeoutMs)

  return text.trim()
}

export async function uploadReportFile({ userId, fileUri, fileName, mimeType }) {
  const timestamp = Date.now()
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/\s+/g, '_')
  const filePath = `reports/${userId}/${timestamp}_${safeName}`

  const base64 = await readFileAsBase64(fileUri)
  const arrayBuffer = decode(base64)

  const { error } = await supabase.storage
    .from('cbc-reports')
    .upload(filePath, arrayBuffer, {
      contentType: mimeType,
      upsert: false,
    })

  if (error) throw error

  const { data: urlData } = supabase.storage.from('cbc-reports').getPublicUrl(filePath)

  return {
    filePath,
    fileUrl: urlData.publicUrl,
  }
}

export async function analyzeReport({ reportId, fileUri, filePath, fileType, timeoutMs = DEFAULT_AI_TIMEOUT_MS }) {
  try {
    let values = { hemoglobin: null, rbc: null, wbc: null, platelets: null }
    let score = null
    let summary = ''
    let geminiError = null

    if (fileType === 'application/pdf') {
      summary = 'Automatic analysis is not available for PDF files. Please use a JPG or PNG image.'
    } else {
      let imageBase64 = null

      if (fileUri) {
        imageBase64 = await readFileAsBase64(fileUri)
      } else if (filePath) {
        imageBase64 = await fetchBase64ViaSignedUrl(filePath)
      } else {
        throw new Error('Either fileUri or filePath is required')
      }

      try {
        const extracted = await extractCBCWithGemini(imageBase64, fileType, timeoutMs)
        values = {
          hemoglobin: extracted.hemoglobin ?? null,
          rbc: extracted.rbc ?? null,
          wbc: extracted.wbc ?? null,
          platelets: extracted.platelets ?? null,
        }
      } catch (err) {
        geminiError = err.message
      }

      score = scoreHealth(values)

      try {
        summary = await generateAISummary(values, score, timeoutMs)
      } catch {
        summary = generateFallbackSummary(values, score)
      }

      if (geminiError) {
        summary = `Note: CBC extraction had an issue (${normalizeGeminiError(geminiError)}). ${summary}`
      }
    }

    const { data, error } = await supabase
      .from('report_analysis')
      .insert({
        report_id: reportId,
        hemoglobin: values.hemoglobin,
        rbc: values.rbc,
        wbc: values.wbc,
        platelets: values.platelets,
        health_score: score,
        ai_summary: summary,
      })
      .select()
      .single()

    if (error) {
      return { success: false, error: `Database error: ${error.message}` }
    }

    return { success: true, data }
  } catch (err) {
    return { success: false, error: toReadableError(err) || 'Analysis pipeline failed' }
  }
}
