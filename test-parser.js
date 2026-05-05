// Test the improved CBC parser with realistic OCR samples
// Run with: node test-parser.js

// Sample OCR text with both same-line and multi-line formats
const sampleOCRText1 = `
COMPLETE BLOOD COUNT REPORT
Date: 05-May-2026
Patient: John Doe

Haemoglobin 15.5 g/dL
RBC 4.8 million/µL
Total Leukocyte Count 5.2 × 10³/µL
Platelets 245 × 10³/µL
MCV 78.5 fL
MCH 28.3 pg
MCHC 36.1 g/dL
Segmented Neutrophils 72.0 %
Lymphocytes 24.0 %
ESR 12 mm/hr
`;

// Sample with multi-line format
const sampleOCRText2 = `
CBC REPORT

Haemoglobin
12.90

RBC
4.5

Total WBC Count
5.5

Platelet Count
180

MCH
27.7

MCHC
36

Neutrophils
76.1

Lymphocytes
18.5
`;

// Minimal parser for testing (same as in cbcAnalyzer.js)
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

  function normalizeFieldValue(fieldName, value) {
    if (value === null || value === undefined) return null
    const n = Number(value)
    if (Number.isNaN(n)) return null
    return n
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
        if (/thou|k\/mm|k\/ul|×10³|x10³/.test(contextWindow) && wbcVal < 1000) {
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
        if (/thou|k\/mm|k\/ul|×10³|x10³/.test(contextWindow) && plateletVal < 1000) {
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

// Test with both samples
console.log('='.repeat(80))
console.log('TEST 1: Same-line format (Haemoglobin 15.5)')
console.log('='.repeat(80))
const result1 = extractCBCValuesFromOCR(sampleOCRText1)
console.log('\nRESULT 1:', JSON.stringify(result1, null, 2))

console.log('\n' + '='.repeat(80))
console.log('TEST 2: Multi-line format')
console.log('='.repeat(80))
const result2 = extractCBCValuesFromOCR(sampleOCRText2)
console.log('\nRESULT 2:', JSON.stringify(result2, null, 2))

// Validation
console.log('\n' + '='.repeat(80))
console.log('VALIDATION')
console.log('='.repeat(80))
const tests = [
  { label: 'Test 1 - hemoglobin', actual: result1.hemoglobin, expected: 15.5 },
  { label: 'Test 1 - rbc', actual: result1.rbc, expected: 4.8 },
  { label: 'Test 1 - wbc', actual: result1.wbc, expected: 5200 },
  { label: 'Test 1 - platelets', actual: result1.platelets, expected: 245000 },
  { label: 'Test 2 - hemoglobin', actual: result2.hemoglobin, expected: 12.90 },
  { label: 'Test 2 - rbc', actual: result2.rbc, expected: 4.5 },
  { label: 'Test 2 - wbc', actual: result2.wbc, expected: 5500 },
  { label: 'Test 2 - platelets', actual: result2.platelets, expected: 180000 },
]

tests.forEach(({ label, actual, expected }) => {
  const status = actual === expected ? '✓ PASS' : '✗ FAIL'
  console.log(`${status}: ${label} (got: ${actual}, expected: ${expected})`)
})
