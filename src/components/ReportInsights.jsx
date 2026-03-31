import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { getStatusForValue, RANGES, analyzeReport } from '../lib/cbcAnalyzer'

function parseAiSummary(summary) {
  if (!summary) return null

  const fallback = (message) => ({
    mainInsight: {
      title: 'Summary',
      message,
      severity: 'normal',
    },
    bullets: [],
    suggestions: [],
  })

  if (typeof summary === 'object') {
    if (summary.mainInsight && typeof summary.mainInsight === 'object') return summary
    return fallback('Analysis completed.')
  }

  const raw = String(summary).trim()
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw)
    if (parsed?.mainInsight && typeof parsed.mainInsight === 'object') return parsed
  } catch (_error) {
  }

  return fallback(raw)
}

function severityClass(severity) {
  if (severity === 'high') return 'bg-red-100 text-red-700'
  if (severity === 'moderate') return 'bg-amber-100 text-amber-700'
  if (severity === 'low') return 'bg-sky-100 text-sky-700'
  return 'bg-emerald-100 text-emerald-700'
}

// ──────────────────────────────────────────────────────────────
// Sub-components
// ──────────────────────────────────────────────────────────────

function HealthScoreRing({ score }) {
  if (score === null) return null
  const color = score >= 75 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444'
  const label = score >= 75 ? 'Good' : score >= 50 ? 'Fair' : 'Low'
  const circumference = 2 * Math.PI * 36
  const offset = circumference - (score / 100) * circumference

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-24 h-24">
        <svg className="w-24 h-24 -rotate-90" viewBox="0 0 80 80">
          {/* Track */}
          <circle cx="40" cy="40" r="36" fill="none" stroke="#e2e8f0" strokeWidth="7" />
          {/* Score arc */}
          <circle
            cx="40" cy="40" r="36"
            fill="none"
            stroke={color}
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 1s ease-out' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-slate-800" style={{ color }}>{score}</span>
          <span className="text-xs font-medium text-slate-400">/ 100</span>
        </div>
      </div>
      <span
        className="text-xs font-semibold px-2.5 py-1 rounded-full"
        style={{ background: `${color}18`, color }}
      >
        {label}
      </span>
    </div>
  )
}

function MetricPill({ label, value, field, unit }) {
  const status = value !== null ? getStatusForValue(value, field) : 'unknown'

  const colors = {
    normal:  { bg: 'bg-emerald-50', border: 'border-emerald-100', badge: 'bg-emerald-100 text-emerald-700', text: 'text-emerald-800' },
    low:     { bg: 'bg-amber-50',   border: 'border-amber-100',   badge: 'bg-amber-100 text-amber-700',    text: 'text-amber-800' },
    high:    { bg: 'bg-red-50',     border: 'border-red-100',     badge: 'bg-red-100 text-red-700',        text: 'text-red-800' },
    unknown: { bg: 'bg-slate-50',   border: 'border-slate-100',   badge: 'bg-slate-100 text-slate-500',    text: 'text-slate-500' },
  }

  const c = colors[status]
  const { min, max } = RANGES[field] || {}

  const icons = {
    normal:  '✓',
    low:     '↓',
    high:    '↑',
    unknown: '?',
  }

  return (
    <div className={`rounded-2xl border p-4 ${c.bg} ${c.border}`}>
      <div className="flex items-start justify-between mb-2">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</p>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${c.badge}`}>
          {icons[status]} {status.charAt(0).toUpperCase() + status.slice(1)}
        </span>
      </div>
      <p className={`text-xl font-bold mb-1 ${c.text}`}>
        {value !== null ? (
          <>
            {field === 'platelets'
              ? value >= 100000
                ? `${(value / 1000).toFixed(0)}K`
                : value.toLocaleString()
              : value}
            <span className="text-xs font-normal text-slate-400 ml-1">{unit}</span>
          </>
        ) : (
          <span className="text-slate-400 text-sm">Not detected</span>
        )}
      </p>
      {min && max && (
        <p className="text-xs text-slate-400">
          Normal: {field === 'platelets' ? `${(min/1000).toFixed(0)}K–${(max/1000).toFixed(0)}K` : `${min}–${max}`} {unit}
        </p>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// Main Component
// ──────────────────────────────────────────────────────────────
export default function ReportInsights({ report, onClose }) {
  const [analysis, setAnalysis] = useState(null)
  const [loading, setLoading] = useState(true)
  const [reanalyzing, setReanalyzing] = useState(false)
  const [error, setError] = useState(null)  // null = no error, string = error message

  // Extract Supabase storage path from the public URL
  // URL format: .../storage/v1/object/public/cbc-reports/<filePath>
  function getStoragePath(fileUrl) {
    try {
      const marker = '/object/public/cbc-reports/'
      const idx = fileUrl.indexOf(marker)
      if (idx === -1) return null
      return decodeURIComponent(fileUrl.slice(idx + marker.length))
    } catch {
      return null
    }
  }

  // Returns true if the analysis has all-null values (stale bad row)
  function isAllNull(row) {
    return row.hemoglobin === null && row.rbc === null &&
           row.wbc === null && row.platelets === null
  }

  useEffect(() => {
    if (!report?.id) return
    fetchAnalysis()
  }, [report?.id])

  async function fetchAnalysis() {
    setLoading(true)
    setError(null)
    try {
      const { data, error: fetchError } = await supabase
        .from('report_analysis')
        .select('*')
        .eq('report_id', report.id)
        .order('analyzed_at', { ascending: false })
        .limit(1)

      if (fetchError) {
        const code = fetchError.code || ''
        const msg = fetchError.message || ''
        if (code === '42P01' || msg.includes('does not exist')) {
          setAnalysis(null)
          return
        }
        if (code === '42501' || msg.includes('security policy')) {
          setError('Permission denied — RLS policy blocked. Re-run report_analysis_table.sql in Supabase SQL Editor.')
          return
        }
        setError(msg || 'Unexpected database error. Try refreshing.')
        return
      }

      const row = data?.[0] ?? null

      // If the stored row has all-null values (failed previous analysis),
      // delete it so the user can re-analyze cleanly
      if (row && isAllNull(row)) {
        await supabase.from('report_analysis').delete().eq('id', row.id)
        setAnalysis(null) // show re-analyze prompt
        return
      }

      setAnalysis(row)
    } catch (err) {
      setError(err.message || 'Network error. Check your internet connection.')
    } finally {
      setLoading(false)
    }
  }

  async function handleReanalyze() {
    const filePath = getStoragePath(report.file_url)
    if (!filePath) {
      setError('Cannot determine file path for re-analysis. Please re-upload this report.')
      return
    }
    setReanalyzing(true)
    setError(null)
    try {
      // Delete any existing (stale) analysis rows for this report
      await supabase.from('report_analysis').delete().eq('report_id', report.id)

      const fileType = report.file_name?.toLowerCase().endsWith('.pdf')
        ? 'application/pdf'
        : report.file_name?.toLowerCase().endsWith('.png')
          ? 'image/png'
          : 'image/jpeg'

      const result = await analyzeReport({
        reportId: report.id,
        filePath,   // signed URL fallback — no fileBlob available here
        fileType,
      })

      if (result.success) {
        setAnalysis(result.data)
      } else {
        setError(result.error || 'Analysis failed. Please try again.')
      }
    } catch (err) {
      setError(err.message || 'Analysis failed. Please try again.')
    } finally {
      setReanalyzing(false)
    }
  }

  const metricFields = [
    { label: 'Hemoglobin', field: 'hemoglobin', unit: 'g/dL' },
    { label: 'RBC',        field: 'rbc',        unit: 'M/µL' },
    { label: 'WBC',        field: 'wbc',        unit: '/µL' },
    { label: 'Platelets',  field: 'platelets',  unit: '/µL' },
  ]

  const structuredSummary = parseAiSummary(analysis?.ai_summary)

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {/* Modal */}
      <div className="bg-white w-full sm:max-w-2xl rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden animate-slide-up max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="bg-gradient-to-r from-primary-600 to-secondary-500 px-6 py-5 flex-shrink-0">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-primary-100 text-xs font-medium mb-0.5">AI Health Analysis</p>
              <h2 className="text-white font-bold text-lg leading-tight line-clamp-1">
                {report.file_name}
              </h2>
              <p className="text-primary-200 text-xs mt-1">
                {new Date(report.uploaded_at).toLocaleDateString('en-IN', {
                  day: '2-digit', month: 'short', year: 'numeric'
                })}
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors flex-shrink-0 ml-3"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="white" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1">

          {/* Loading / Re-analyzing */}
          {(loading || reanalyzing) && (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <div className="w-10 h-10 border-4 border-primary-100 border-t-primary-600 rounded-full animate-spin" />
              <p className="text-sm text-slate-500 font-medium">
                {reanalyzing ? '🔬 Running AI analysis… this may take ~15 seconds' : 'Loading analysis…'}
              </p>
            </div>
          )}

          {/* Error */}
          {!loading && error && (
            <div className="p-6 space-y-4">
              <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-100 rounded-2xl">
                <span className="text-red-500 text-xl flex-shrink-0">⚠️</span>
                <div>
                  <p className="text-red-700 text-sm font-semibold">{error}</p>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={fetchAnalysis}
                  className="px-4 py-2 rounded-xl bg-primary-600 text-white text-sm font-semibold hover:bg-primary-700 transition-colors"
                >
                  Retry
                </button>
                <a
                  href={report.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors"
                >
                  View Original Report
                </a>
              </div>
            </div>
          )}

          {/* No analysis yet — allow re-analyze */}
          {!loading && !reanalyzing && !error && analysis === null && (
            <div className="flex flex-col items-center justify-center py-14 px-6 text-center">
              <div className="w-16 h-16 rounded-2xl bg-primary-50 border border-primary-100 flex items-center justify-center mb-4 text-3xl">
                🔬
              </div>
              <h3 className="text-base font-bold text-slate-800 mb-2">No Analysis Yet</h3>
              <p className="text-sm text-slate-500 max-w-sm mb-6">
                No AI analysis found for this report. Click below to run a fresh analysis now.
              </p>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleReanalyze}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-primary-600 to-secondary-500 text-white text-sm font-semibold shadow-sm hover:from-primary-700 hover:to-secondary-600 transition-all duration-200"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                  </svg>
                  Analyze with AI
                </button>
                <a
                  href={report.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors"
                >
                  View Original
                </a>
              </div>
            </div>
          )}

          {/* Analysis Results */}
          {!loading && !reanalyzing && !error && analysis !== null && (
            <div className="p-6 space-y-6">

              {/* Score + Metrics */}
              <div className="flex items-start gap-6">
                {/* Health Score */}
                <div className="flex-shrink-0">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide text-center mb-3">
                    Health Score
                  </p>
                  <HealthScoreRing score={analysis.health_score} />
                </div>

                {/* Metric Pills grid */}
                <div className="flex-1 grid grid-cols-2 gap-3">
                  {metricFields.map(({ label, field, unit }) => (
                    <MetricPill
                      key={field}
                      label={label}
                      value={analysis[field]}
                      field={field}
                      unit={unit}
                    />
                  ))}
                </div>
              </div>

              {/* AI Summary */}
              {structuredSummary && (
                <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-primary-500 to-secondary-500 flex items-center justify-center">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="white" className="w-3.5 h-3.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                      </svg>
                    </div>
                      <p className="text-sm font-bold text-slate-800">{structuredSummary?.mainInsight?.title || 'AI Health Insights'}</p>
                    </div>
                    <span className={`text-[11px] font-bold px-2 py-1 rounded-full uppercase ${severityClass(String(structuredSummary?.mainInsight?.severity || 'normal'))}`}>
                      {String(structuredSummary?.mainInsight?.severity || 'normal')}
                    </span>
                  </div>
                  <p className="text-sm text-slate-600 leading-relaxed">{structuredSummary?.mainInsight?.message || ''}</p>

                  {Array.isArray(structuredSummary?.bullets) && structuredSummary.bullets.length > 0 && (
                    <ul className="mt-3 space-y-1.5 text-sm text-slate-700 list-disc pl-5">
                      {structuredSummary.bullets.map((bullet, idx) => (
                        <li key={`${bullet}-${idx}`}>{bullet}</li>
                      ))}
                    </ul>
                  )}

                  {Array.isArray(structuredSummary?.suggestions) && structuredSummary.suggestions.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {structuredSummary.suggestions.map((item, idx) => (
                        <div key={`${item?.title || 'suggestion'}-${idx}`} className="rounded-xl border border-slate-200 bg-white p-3">
                          <p className="text-sm font-semibold text-slate-800">{item?.title}</p>
                          <p className="text-xs text-slate-600 mt-0.5">{item?.description}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {structuredSummary?.confidenceNote && (
                    <p className="text-xs text-slate-500 mt-3 italic">{structuredSummary.confidenceNote}</p>
                  )}

                  {/* Disclaimer */}
                  <div className="mt-4 pt-3 border-t border-slate-200">
                    <p className="text-xs text-slate-400 flex items-start gap-1.5">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5 flex-shrink-0 mt-0.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                      </svg>
                      This analysis is generated by AI for informational purposes only and is not a substitute for professional medical advice.
                    </p>
                  </div>
                </div>
              )}

              {/* View Original Button */}
              <a
                href={report.file_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl border-2 border-slate-100 text-slate-600 text-sm font-semibold hover:border-primary-200 hover:text-primary-700 hover:bg-primary-50/50 transition-all duration-200"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                View Original Report
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
