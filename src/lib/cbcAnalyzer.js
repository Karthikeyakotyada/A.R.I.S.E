import { supabase } from './supabaseClient'

// ──────────────────────────────────────────────────────────────
// NORMAL RANGES (used for scoring + UI badges)
// ──────────────────────────────────────────────────────────────
export const RANGES = {
  hemoglobin: { min: 12.0, max: 17.5, unit: 'g/dL' },
  rbc:        { min: 3.8,  max: 6.1,  unit: 'M/µL' },
  wbc:        { min: 4000, max: 11000, unit: '/µL'  },
  platelets:  { min: 150000, max: 450000, unit: '/µL' },
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
// BASE64 HELPERS
// ──────────────────────────────────────────────────────────────

/** Convert any Blob/File to base64 (no data: prefix) — works locally, no network needed */
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

/**
 * Fallback: fetch image via a Supabase signed URL.
 * Used only during re-analysis where the original File object is gone.
 */
async function fetchBase64ViaSignedUrl(filePath) {
  const { data, error } = await supabase.storage
    .from('cbc-reports')
    .createSignedUrl(filePath, 120)

  if (error || !data?.signedUrl) {
    throw new Error('Signed URL error: ' + (error?.message ?? 'no URL returned'))
  }

  console.log('[ARISE] Fetching image via signed URL…')
  const response = await fetch(data.signedUrl)
  if (!response.ok) throw new Error(`Image fetch failed (${response.status})`)
  const blob = await response.blob()
  return blobToBase64(blob)
}

// ──────────────────────────────────────────────────────────────
// GEMINI REST API — direct fetch, no SDK, full URL control
// ──────────────────────────────────────────────────────────────
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1/models'
const GEMINI_MODEL    = 'gemini-1.5-flash'

async function geminiGenerateContent(apiKey, requestBody) {
  const url = `${GEMINI_API_BASE}/${GEMINI_MODEL}:generateContent?key=${apiKey}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(JSON.stringify(json))
  return json.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
}

async function extractCBCWithGemini(imageBase64, mimeType) {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY
  if (!apiKey) throw new Error('VITE_GEMINI_API_KEY is missing from .env')

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

  console.log('[ARISE] Calling Gemini v1 REST API for Vision extraction…')

  const text = await geminiGenerateContent(apiKey, {
    contents: [{
      parts: [
        { inlineData: { data: imageBase64, mimeType } },
        { text: prompt },
      ],
    }],
  })

  console.log('[ARISE] Gemini raw response:', text)

  const clean = text.replace(/```json\s*/i, '').replace(/```/g, '').trim()

  try {
    const parsed = JSON.parse(clean)
    console.log('[ARISE] Extracted values:', parsed)
    return parsed
  } catch {
    const match = clean.match(/\{[\s\S]*\}/)
    if (match) {
      const parsed = JSON.parse(match[0])
      console.log('[ARISE] Extracted values (fallback parse):', parsed)
      return parsed
    }
    throw new Error('Gemini non-JSON: ' + clean.slice(0, 300))
  }
}

// ──────────────────────────────────────────────────────────────
// HEALTH SCORING  (0 – 100)
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
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY
  if (!apiKey) return generateFallbackSummary(values, score)

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

  const text = await geminiGenerateContent(apiKey, {
    contents: [{ parts: [{ text: prompt }] }],
  })
  return text.trim()
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
    lines.push(
      score >= 75
        ? 'Overall, your CBC results look healthy.'
        : score >= 50
        ? 'Some values need attention. Please consult your doctor.'
        : 'Multiple values are outside normal ranges. Please seek medical advice.'
    )
  }
  return lines.join(' ')
}

// ──────────────────────────────────────────────────────────────
// MAIN PIPELINE
// ──────────────────────────────────────────────────────────────
/**
 * analyzeReport — runs the full CBC analysis pipeline and saves to Supabase.
 *
 * Params:
 *   reportId  — UUID of the record in the reports table
 *   fileBlob  — (preferred) raw File/Blob from the browser input; avoids any storage fetch
 *   filePath  — (fallback) Supabase storage path; used if fileBlob is not available
 *   fileType  — MIME type e.g. 'image/jpeg'
 */
export async function analyzeReport({ reportId, fileBlob, filePath, fileType }) {
  try {
    let values = { hemoglobin: null, rbc: null, wbc: null, platelets: null }
    let score = null
    let summary = ''
    let geminiError = null

    const isPdf = fileType === 'application/pdf'

    if (isPdf) {
      summary = 'Automatic analysis is not available for PDF files. Please re-upload as a JPG or PNG image for full AI analysis.'
    } else {
      // ── Step 1: Get image as base64 ────────────────────────────
      let imageBase64 = null

      if (fileBlob) {
        // Best path: convert the local file directly — no network fetch
        console.log('[ARISE] Converting local file to base64…')
        imageBase64 = await blobToBase64(fileBlob)
        console.log('[ARISE] Local file converted, size:', Math.round(imageBase64.length / 1024), 'KB')
      } else if (filePath) {
        // Fallback: fetch via signed URL (re-analysis flow)
        imageBase64 = await fetchBase64ViaSignedUrl(filePath)
        console.log('[ARISE] Signed URL image converted, size:', Math.round(imageBase64.length / 1024), 'KB')
      } else {
        throw new Error('Either fileBlob or filePath must be provided.')
      }

      // ── Step 2: Gemini Vision extracts CBC values ───────────────
      try {
        const extracted = await extractCBCWithGemini(imageBase64, fileType)
        if (extracted) {
          values = {
            hemoglobin: extracted.hemoglobin ?? null,
            rbc:        extracted.rbc        ?? null,
            wbc:        extracted.wbc        ?? null,
            platelets:  extracted.platelets  ?? null,
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
        console.warn('[ARISE] AI summary failed, using fallback:', sumErr.message)
        summary = generateFallbackSummary(values, score)
      }

      // If Gemini Vision failed, prepend the error reason to the summary
      if (geminiError) {
        summary = `⚠️ Note: CBC value extraction encountered an error (${geminiError}). The summary below is based on limited data. ${summary}`
      }
    }

    // ── Step 5: Save to Supabase ────────────────────────────────
    const { data, error: dbError } = await supabase
      .from('report_analysis')
      .insert({
        report_id:    reportId,
        hemoglobin:   values.hemoglobin,
        rbc:          values.rbc,
        wbc:          values.wbc,
        platelets:    values.platelets,
        health_score: score,
        ai_summary:   summary,
      })
      .select()
      .single()

    if (dbError) {
      console.error('[ARISE] Supabase insert error:', dbError)
      return { success: false, error: `Database error: ${dbError.message}` }
    }

    console.log('[ARISE] Analysis saved to Supabase ✓', data)
    return { success: true, data }

  } catch (err) {
    console.error('[ARISE] Pipeline error:', err)
    return { success: false, error: err.message || 'Analysis pipeline failed' }
  }
}
