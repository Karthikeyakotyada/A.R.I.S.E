import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import ReportInsights from '../components/ReportInsights'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'
import Spinner from '../components/ui/Spinner'
import { confirmDanger } from '../lib/confirm'

function formatDate(timestamp) {
  return new Date(timestamp).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getExt(fileName) {
  return fileName?.split('.').pop()?.toUpperCase() || 'FILE'
}

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

function Badge({ ext }) {
  const colors = {
    PDF:  'bg-red-50 text-red-600 border-red-100',
    JPG:  'bg-indigo-50 text-indigo-600 border-indigo-100',
    JPEG: 'bg-indigo-50 text-indigo-600 border-indigo-100',
    PNG:  'bg-purple-50 text-purple-600 border-purple-100',
  }
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border ${colors[ext] || 'bg-slate-50 text-slate-500 border-slate-100'}`}>
      {ext}
    </span>
  )
}

export default function ReportViewer() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showInsights, setShowInsights] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [downloading, setDownloading] = useState(false)

  const ext = useMemo(() => getExt(report?.file_name), [report?.file_name])
  const isPdf = ext === 'PDF'

  const fetchReport = useCallback(async () => {
    if (!user || !id) return
    setLoading(true)
    setError('')
    try {
      const { data, error: fetchError } = await supabase
        .from('reports')
        .select('*')
        .eq('id', id)
        .eq('user_id', user.id)
        .single()

      if (fetchError) throw fetchError
      setReport(data)
    } catch (err) {
      setError(err?.message || 'Could not load this report.')
    } finally {
      setLoading(false)
    }
  }, [user, id])

  useEffect(() => {
    fetchReport()
  }, [fetchReport])

  async function handleDownload() {
    if (!report?.file_url) return
    setDownloading(true)
    setError('')
    try {
      const res = await fetch(report.file_url)
      if (!res.ok) throw new Error(`Download failed (${res.status})`)
      const blob = await res.blob()

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = report.file_name || 'report'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err?.message || 'Download failed. Please try again.')
    } finally {
      setDownloading(false)
    }
  }

  async function handleDelete() {
    if (!report) return
    const ok = confirmDanger(`Delete "${report.file_name}"?\n\nThis will remove the report and its analysis.`)
    if (!ok) return

    setDeleting(true)
    setError('')
    try {
      const filePath = getStoragePath(report.file_url)
      await supabase.from('report_analysis').delete().eq('report_id', report.id)
      if (filePath) await supabase.storage.from('cbc-reports').remove([filePath])

      const { error: dbError } = await supabase
        .from('reports')
        .delete()
        .eq('id', report.id)
        .eq('user_id', user.id)

      if (dbError) throw dbError

      navigate('/reports', { replace: true })
    } catch (err) {
      setError(err?.message || 'Delete failed. Please try again.')
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="py-10 flex flex-col items-center justify-center gap-4">
        <Spinner size={40} />
        <p className="text-sm text-slate-500 font-medium">Loading report…</p>
      </div>
    )
  }

  if (!report) {
    return (
      <div className="py-10">
        <Card className="hover:shadow-sm">
          <p className="text-sm font-semibold text-slate-800">Report not found</p>
          <p className="text-sm text-slate-500 mt-1">{error || 'Please go back to your reports.'}</p>
          <div className="mt-4">
            <Link to="/reports" className="text-sm font-semibold text-primary-700 hover:underline">
              Back to Reports
            </Link>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="py-6 space-y-4">
      {error && (
        <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-100 rounded-2xl">
          <span className="text-red-500 text-xl flex-shrink-0">⚠️</span>
          <p className="text-red-700 text-sm font-semibold break-words">{error}</p>
        </div>
      )}

      <Card>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900 truncate">{report.file_name}</p>
            <p className="text-xs text-slate-400 mt-1">{formatDate(report.uploaded_at)}</p>
          </div>
          <Badge ext={ext} />
        </div>

        <div className="mt-4 flex flex-col sm:flex-row gap-2">
          <Button type="button" onClick={handleDownload} disabled={downloading} variant="soft" className="flex-1">
            {downloading ? <Spinner size={20} className="border-slate-200 border-t-slate-700" /> : (
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v10.5m0 0l3.75-3.75M12 13.5L8.25 9.75M4.5 21h15" />
              </svg>
            )}
            Download report
          </Button>

          <Button type="button" onClick={() => setShowInsights(true)} variant="primary" className="flex-1">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
            View Insights
          </Button>

          <Button type="button" onClick={handleDelete} disabled={deleting} variant="danger" className="sm:w-40">
            {deleting ? <Spinner size={20} className="border-red-200 border-t-red-600" /> : (
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 7.5h12M9 7.5V6a1.5 1.5 0 011.5-1.5h3A1.5 1.5 0 0115 6v1.5m-7.5 0l.75 12A2.25 2.25 0 0010.494 21h3.012a2.25 2.25 0 002.244-1.5l.75-12" />
              </svg>
            )}
            Delete
          </Button>
        </div>
      </Card>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <p className="text-sm font-bold text-slate-900">Viewer</p>
          <Link to="/reports" className="text-sm font-semibold text-primary-700 hover:underline">
            Back
          </Link>
        </div>

        <div className="bg-slate-50 flex justify-center">
          {isPdf ? (
            <iframe title="report" src={report.file_url} className="w-full max-w-5xl h-[75vh]" />
          ) : (
            <div className="p-4 w-full max-w-5xl">
              <img
                src={report.file_url}
                alt={report.file_name}
                className="w-full rounded-2xl border border-slate-200 bg-white"
              />
            </div>
          )}
        </div>
      </div>

      {showInsights && (
        <ReportInsights
          report={report}
          onClose={() => setShowInsights(false)}
        />
      )}
    </div>
  )
}

