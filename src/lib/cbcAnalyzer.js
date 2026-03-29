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
async function generateAISummary(values, score) {
  if (!GEMINI_API_KEY) {
    return generateFallbackSummary(values, score)
  }

  try {
    const valueLines = Object.entries(values)
      .map(([k, v]) => {
        if (v === null || v === undefined) return `${k}: not detected`
        const { min, max, unit } = RANGES[k]
        const status = getStatusForValue(v, k)
        return `${k}: ${v} ${unit} (normal: ${min}–${max}) — ${status}`
      })
      .join('\n')

    const prompt = `You are ARISE, an AI health assistant. A patient uploaded a CBC (Complete Blood Count) report with the following values:

${valueLines}
Overall health score: ${score ?? 'unknown'}/100

Write a clear, empathetic 3–4 sentence health summary for the patient.
- Mention each detected value briefly (normal, low, or high)
- Suggest what low/high values might indicate
- End with an appropriate recommendation
- Keep it friendly, non-alarming, and under 120 words
- Do NOT use markdown formatting, just plain text`

    const text = await geminiGenerateContent(GEMINI_API_KEY, {
      contents: [{ parts: [{ text: prompt }] }],
    })

    return text.trim()
  } catch (error) {
    console.warn('[ARISE] AI summary failed, using fallback:', error.message)
    return generateFallbackSummary(values, score)
  }
}

function generateFallbackSummary(values, score) {
  const MESSAGES = {
    hemoglobin: {
      low: 'Hemoglobin is below normal, possibly indicating mild anemia.',
      high: 'Hemoglobin is above normal, which may indicate dehydration or polycythemia.',
      normal: 'Hemoglobin is within the healthy range.',
      unknown: 'Hemoglobin could not be detected.',
    },
    rbc: {
      low: 'Red blood cell count is low, which may cause fatigue.',
      high: 'Red blood cell count is elevated.',
      normal: 'Red blood cell count is normal.',
      unknown: 'RBC count could not be detected.',
    },
    wbc: {
      low: 'White blood cell count is low, suggesting a possible immune concern.',
      high: 'White blood cell count is high, possibly indicating infection or inflammation.',
      normal: 'White blood cell count is normal.',
      unknown: 'WBC count could not be detected.',
    },
    platelets: {
      low: 'Platelet count is low, which may increase bleeding risk.',
      high: 'Platelet count is elevated.',
      normal: 'Platelet count is normal.',
      unknown: 'Platelet count could not be detected.',
    },
  }

  const lines = Object.keys(MESSAGES).map(
    (f) => MESSAGES[f][getStatusForValue(values[f], f)]
  )

  if (score !== null) {
    if (score >= 75) {
      lines.push('Overall, your CBC results look healthy.')
    } else if (score >= 50) {
      lines.push('Some values need attention. Please consult your doctor.')
    } else {
      lines.push(
        'Multiple values are outside normal ranges. Please seek medical advice.'
      )
    }
  }

  return lines.join(' ')
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
    let summary = ''
    let geminiError = null

    const isPdf = fileType === 'application/pdf'

    if (isPdf) {
      summary =
        'Automatic analysis is not available for PDF files. Please re-upload as a JPG or PNG image for full AI analysis.'
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
        summary = `Note: CBC value extraction encountered an issue (${normalizeGeminiError(geminiError)}). The summary below is based on limited data. ${summary}`
      }
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
        ai_summary: summary,
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