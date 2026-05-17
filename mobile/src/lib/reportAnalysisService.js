import { supabase } from './supabaseClient'
import { analyzeReport } from './cbcAnalyzer'

export const REPORT_ANALYSIS_STATUS = {
  UPLOADED: 'uploaded',
  PENDING: 'analysis_pending',
  COMPLETE: 'analysis_complete',
  FAILED: 'analysis_failed',
}

export const REPORT_STATUS_META = {
  uploaded: { label: 'Uploaded', tone: 'info' },
  analysis_pending: { label: 'Analyzing', tone: 'warning' },
  analysis_complete: { label: 'Complete', tone: 'success' },
  analysis_failed: { label: 'Failed', tone: 'error' },
}

function hasDetectedValues(analysis) {
  if (!analysis) return false
  const fields = ['hemoglobin', 'rbc', 'wbc', 'platelets', 'mcv', 'mch', 'mchc', 'neutrophils', 'lymphocytes', 'esr']
  const sources = [analysis, analysis?.cbc_values].filter(Boolean)
  return sources.some((source) =>
    fields.some((field) => {
      const value = Number(source[field])
      return Number.isFinite(value) && value > 0
    })
  )
}

export function resolveReportStatus(report, latestAnalysis) {
  const raw = report?.analysis_status
  if (raw && REPORT_STATUS_META[raw]) {
    if (
      raw === REPORT_ANALYSIS_STATUS.COMPLETE &&
      latestAnalysis?.id &&
      !hasDetectedValues(latestAnalysis)
    ) {
      return REPORT_ANALYSIS_STATUS.FAILED
    }
    return raw
  }
  if (latestAnalysis?.id) {
    return hasDetectedValues(latestAnalysis)
      ? REPORT_ANALYSIS_STATUS.COMPLETE
      : REPORT_ANALYSIS_STATUS.FAILED
  }
  return REPORT_ANALYSIS_STATUS.UPLOADED
}

export function inferFileType(fileName, mimeType) {
  if (mimeType) return mimeType
  const lower = fileName?.toLowerCase() || ''
  if (lower.endsWith('.pdf')) return 'application/pdf'
  if (lower.endsWith('.png')) return 'image/png'
  return 'image/jpeg'
}

export async function updateReportStatus(reportId, status) {
  const { error } = await supabase
    .from('reports')
    .update({ analysis_status: status })
    .eq('id', reportId)

  if (error) {
    // Backward-safe if schema migration has not been applied yet.
    return { success: false, error: error.message }
  }

  return { success: true }
}

function buildAnalysisFailureMessage(result) {
  if (!result) return 'Analysis failed for an unknown reason.'
  if (result.error) return String(result.error)
  if (result.data && !hasDetectedValues(result.data)) {
    return 'No CBC values detected. Please upload a clearer report and retry.'
  }
  return 'Analysis failed. Please try again.'
}

export async function analyzeExistingReport({ reportId, fileUri, filePath, fileType, timeoutMs = 35000, preExtractedText = null }) {
  const statusUpdate = await updateReportStatus(reportId, REPORT_ANALYSIS_STATUS.PENDING)
  if (!statusUpdate.success) {
    console.warn('[ARISE] Could not mark report as pending:', statusUpdate.error)
  }

  let result
  try {
    result = await analyzeReport({
      reportId,
      fileUri,
      filePath,
      fileType,
      timeoutMs,
      preExtractedText,
    })
  } catch (error) {
    console.error('[ARISE] analyzeReport threw:', error?.message || error)
    result = {
      success: false,
      error: error?.message || 'Analysis pipeline crashed',
    }
  }

  const nextStatus = result.success
    ? REPORT_ANALYSIS_STATUS.COMPLETE
    : REPORT_ANALYSIS_STATUS.FAILED

  const finalStatusUpdate = await updateReportStatus(reportId, nextStatus)
  if (!finalStatusUpdate.success) {
    console.warn('[ARISE] Could not update report status:', finalStatusUpdate.error)
  }

  if (!result.success && !result.error) {
    result.error = buildAnalysisFailureMessage(result)
  }

  return result
}