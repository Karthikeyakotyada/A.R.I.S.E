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

export function resolveReportStatus(report, latestAnalysis) {
  const raw = report?.analysis_status
  if (raw && REPORT_STATUS_META[raw]) return raw
  if (latestAnalysis?.id) return REPORT_ANALYSIS_STATUS.COMPLETE
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

export async function analyzeExistingReport({ reportId, fileUri, filePath, fileType, timeoutMs = 35000 }) {
  await updateReportStatus(reportId, REPORT_ANALYSIS_STATUS.PENDING)

  const result = await analyzeReport({
    reportId,
    fileUri,
    filePath,
    fileType,
    timeoutMs,
  })

  await updateReportStatus(
    reportId,
    result.success ? REPORT_ANALYSIS_STATUS.COMPLETE : REPORT_ANALYSIS_STATUS.FAILED
  )

  return result
}