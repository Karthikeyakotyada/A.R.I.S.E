import { supabase } from './supabaseClient'

// ──────────────────────────────────────────────────────────────
// NORMAL RANGES (used for scoring + UI badges)
// ──────────────────────────────────────────────────────────────
export const RANGES = {
  hemoglobin: { min: 12.0, max: 17.5, unit: 'g/dL' },
  rbc: { min: 3.8, max: 6.1, unit: 'M/µL' },
  wbc: { min: 4000, max: 11000, unit: '/µL' },
  platelets: { min: 150000, max: 450000, unit: '/µL' },
}

// ──────────────────────────────────────────────────────────────
// HELPER — get pass/fail status for a single value
// ──────────────────────────────────────────────────────────────
export function getStatusForValue(value, field) {
  if (value === null || value === undefined) return 'unknown'
  const { min, max } = RANGES[field]
  if (value < min) return 'low'
  if (value > max) return 'high'
  return 'normal'
}

function isUnavailable(value) {
  return value === null || value === undefined || Number(value) <= 0
}

// ──────────────────────────────────────────────────────────────
// BASE64 HELPERS (Web compatible)
// ──────────────────────────────────────────────────────────────

/**
 * Convert a file/blob URL to base64 using fetch + FileReader.
 */
async function fileUriToBase64(fileUri) {
  try {
    const response = await fetch(fileUri)
    if (!response.ok) {
      throw new Error(`Image fetch failed (${response.status})`)
    }
    const blob = await response.blob()
    return await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result.split(',')[1])
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  } catch (error) {
    console.error('[ARISE] Error reading file:', error)
    throw new Error('Failed to read file: ' + error.message)
  }
}

/**
 * Fallback: fetch image via a Supabase signed URL.
 * Used only during re-analysis where the original File object is gone.
 */
async function fetchBase64ViaSignedUrl(filePath) {
  try {
    const { data, error } = await supabase.storage
      .from('cbc-reports')
      .createSignedUrl(filePath, 120)

    if (error || !data?.signedUrl) {
      throw new Error(
        'Signed URL error: ' + (error?.message ?? 'no URL returned')
      )
    }

    console.log('[ARISE] Fetching image via signed URL…')
    const response = await fetch(data.signedUrl)
    if (!response.ok)
      throw new Error(`Image fetch failed (${response.status})`)

    const blob = await response.blob()
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result.split(',')[1])
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  } catch (error) {
    console.error('[ARISE] Signed URL fetch error:', error)
    throw error
  }
}

// ──────────────────────────────────────────────────────────────
// GEMINI REST API — direct fetch, no SDK, full URL control
// ──────────────────────────────────────────────────────────────
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1/models'

// Get API key from environment
const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY || ''

const GEMINI_MODEL_CANDIDATES = [
  'gemini-1.5-flash',
].filter(Boolean)

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
    return 'Rate limit reached. Please try again in a moment.'
  }
  return message
}

async function geminiGenerateContent(apiKey, requestBody) {
  if (!apiKey) {
    throw new Error('Gemini API key is not configured')
  }

  const models = [...new Set(GEMINI_MODEL_CANDIDATES)]
  let lastError = null

  for (const model of models) {
    try {
      const url = `${GEMINI_API_BASE}/${model}:generateContent?key=${apiKey}`

      console.log(`[ARISE] Attempting Gemini API call with model: ${model}`)

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        timeout: 30000,
      })

      const json = await response.json()

      if (response.ok) {
        const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
        console.log('[ARISE] Gemini API success with model:', model)
        return text
      }

      const apiMessage = normalizeGeminiError(extractGeminiErrorMessage(json))
      const isModelUnavailable =
        response.status === 404 ||
        /model unavailable|not found|not supported for generatecontent/i.test(
          apiMessage
        )

      if (isModelUnavailable) {
        console.warn(
          `[ARISE] Model ${model} unavailable, trying next…`
        )
        lastError = new Error(apiMessage)
        continue
      }

      throw new Error(
        apiMessage || `Gemini error (${response.status})`
      )
    } catch (error) {
      console.error(
        `[ARISE] Model ${model} failed:`,
        error.message
      )
      lastError = error
      continue
    }
  }

  throw new Error(
    lastError?.message ||
    'All AI models unavailable. Please try again.'
  )
}

async function extractCBCWithGemini(imageBase64, mimeType) {
  if (!GEMINI_API_KEY) {
    throw new Error('EXPO_PUBLIC_GEMINI_API_KEY is missing from .env')
  }

  const prompt = `You are a medical data extractor. Analyze this Complete Blood Count (CBC) report image and extract the following test values.

Return ONLY a valid JSON object — no markdown, no explanation, just the raw JSON:
{
  "hemoglobin": <number in g/dL, or null if not found>,
  "rbc": <number in millions per microliter (M/µL), or null if not found>,
  "wbc": <number in cells per microliter (/µL), or null if not found>,
  "platelets": <number in cells per microliter (/µL), or null if not found>
}

Important conversion rules:
- WBC/TLC values reported as "8.2 × 10³" mean 8200 — report as 8200
- Platelets reported as "2.5 lakhs" or "2.5 L" mean 250000 — report as 250000
- Platelets reported as "180 × 10³" mean 180000 — report as 180000
- Hemoglobin: look for Hb, HGB, Haemoglobin — value should be between 5–25
- RBC: look for Red Blood Cells, Erythrocytes — value should be between 1–10
- If a value is clearly present but you cannot determine units, make your best estimate
- If this is not a medical report or no CBC values are visible, return all nulls`

  console.log('[ARISE] Calling Gemini Vision API for extraction…')

  const text = await geminiGenerateContent(GEMINI_API_KEY, {
    contents: [
      {
        parts: [
          { inlineData: { data: imageBase64, mimeType } },
          { text: prompt },
        ],
      },
    ],
  })

  console.log('[ARISE] Gemini raw response:', text.substring(0, 100))

  const clean = text
    .replace(/```json\s*/i, '')
    .replace(/```/g, '')
    .trim()

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
        console.log('[ARISE] Extracted values (fallback parse):', parsed)
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

// ──────────────────────────────────────────────────────────────
// AI SUMMARY — Gemini generates a plain-English explanation
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

async function generateAISummary(values, score) {
  const fields = ['hemoglobin', 'rbc', 'wbc', 'platelets']

  if (fields.some((field) => isUnavailable(values[field]))) {
    return getMissingValuesInsight()
  }

  if (!GEMINI_API_KEY) {
    return generateFallbackSummary(values, score)
  }

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

    const text = await geminiGenerateContent(GEMINI_API_KEY, {
      contents: [{ parts: [{ text: prompt }] }],
    })

    return parseStructuredSummary(text)
  } catch (error) {
    console.warn('[ARISE] AI summary failed, using fallback:', error.message)
    return generateFallbackSummary(values, score)
  }
}

// ──────────────────────────────────────────────────────────────
// FILE UPLOAD TO SUPABASE STORAGE
// ──────────────────────────────────────────────────────────────
export async function uploadReportFile({
  userId,
  fileUri,
  fileName,
  mimeType,
}) {
  try {
    const timestamp = new Date().getTime()
    const fileExtension = fileName.split('.').pop()
    const newFileName = `${userId}/${timestamp}_${fileName}`

    console.log('[ARISE] Uploading file to storage:', newFileName)

    // Read file as binary
    const fileData = await FileSystem.readAsStringAsync(fileUri, {
      encoding: FileSystem.EncodingType.Base64,
    })

    // Convert base64 to Uint8Array for upload
    const binaryString = atob(fileData)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }

    // Upload to Supabase storage
    const { data, error } = await supabase.storage
      .from('cbc-reports')
      .upload(newFileName, bytes, {
        contentType: mimeType,
        cacheControl: '3600',
      })

    if (error) {
      throw new Error('Storage upload failed: ' + error.message)
    }

    console.log('[ARISE] File uploaded to storage:', data)

    // Generate public URL
    const { data: urlData } = supabase.storage
      .from('cbc-reports')
      .getPublicUrl(newFileName)

    const fileUrl = urlData.publicUrl

    return {
      filePath: newFileName,
      fileUrl,
    }
  } catch (error) {
    console.error('[ARISE] Upload error:', error)
    throw error
  }
}

// ──────────────────────────────────────────────────────────────
// MAIN PIPELINE
// ──────────────────────────────────────────────────────────────
/**
 * analyzeReport — runs the full CBC analysis pipeline and saves to Supabase.
 *
 * Params:
 *   reportId  — UUID of the record in the reports table
 *   fileUri   — (preferred) file URI from React Native; avoids any storage fetch
 *   filePath  — (fallback) Supabase storage path; used if fileUri is not available
 *   fileType  — MIME type e.g. 'image/jpeg'
 */
export async function analyzeReport({
  reportId,
  fileUri,
  filePath,
  fileType,
}) {
  try {
    let values = { hemoglobin: null, rbc: null, wbc: null, platelets: null }
    let score = null
    let summary = null
    let geminiError = null

    const isPdf = fileType === 'application/pdf'

    if (isPdf) {
      summary = getMissingValuesInsight()
    } else {
      // ── Step 1: Get image as base64 ────────────────────────────
      let imageBase64 = null

      if (fileUri) {
        // Best path: convert the local file directly — no network fetch
        console.log('[ARISE] Converting file to base64…')
        imageBase64 = await fileUriToBase64(fileUri)
        console.log(
          '[ARISE] File converted, size:',
          Math.round(imageBase64.length / 1024),
          'KB'
        )
      } else if (filePath) {
        // Fallback: fetch via signed URL (re-analysis flow)
        imageBase64 = await fetchBase64ViaSignedUrl(filePath)
        console.log(
          '[ARISE] Signed URL image converted, size:',
          Math.round(imageBase64.length / 1024),
          'KB'
        )
      } else {
        throw new Error('Either fileUri or filePath must be provided.')
      }

      // ── Step 2: Gemini Vision extracts CBC values ───────────────
      try {
        const extracted = await extractCBCWithGemini(imageBase64, fileType)
        if (extracted) {
          values = {
            hemoglobin: extracted.hemoglobin ?? null,
            rbc: extracted.rbc ?? null,
            wbc: extracted.wbc ?? null,
            platelets: extracted.platelets ?? null,
          }
        }
      } catch (ocrErr) {
        geminiError = ocrErr.message
        console.error('[ARISE] Gemini Vision FAILED:', ocrErr.message)
        // Continue — values stay null, summary will reflect this
      }

      // ── Step 3: Score ───────────────────────────────────────────
      score = scoreHealth(values)

      // ── Step 4: AI Summary ──────────────────────────────────────
      try {
        summary = await generateAISummary(values, score)
      } catch (sumErr) {
        console.warn(
          '[ARISE] AI summary failed, using fallback:',
          sumErr.message
        )
        summary = generateFallbackSummary(values, score)
      }

      // If Gemini Vision failed, prepend the error reason to the summary
      if (geminiError) {
        summary = {
          ...(summary || generateFallbackSummary(values, score)),
          confidenceNote: `Extraction fallback applied: ${normalizeGeminiError(geminiError)}`,
        }
      }
    }

    if (!summary || typeof summary !== 'object') {
      summary = generateFallbackSummary(values, score)
    }

    // ── Step 5: Save to Supabase ────────────────────────────────
    const { data, error: dbError } = await supabase
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

    if (dbError) {
      console.error('[ARISE] Supabase insert error:', dbError)
      return {
        success: false,
        error: `Database error: ${dbError.message}`,
      }
    }

    console.log('[ARISE] Analysis saved to Supabase ✓', data)
    return { success: true, data }
  } catch (err) {
    console.error('[ARISE] Pipeline error:', err)
    return {
      success: false,
      error: err.message || 'Analysis pipeline failed',
    }
  }
}