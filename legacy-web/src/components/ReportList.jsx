import { useState, useEffect, useCallback, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import Card from './ui/Card'
import Button from './ui/Button'
import Spinner from './ui/Spinner'
import EmptyState from './ui/EmptyState'
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

function FileTypeBadge({ ext }) {
  const colors = {
    PDF:  'bg-red-50 text-red-600 border-red-100',
    JPG:  'bg-indigo-50 text-indigo-600 border-indigo-100',
    JPEG: 'bg-indigo-50 text-indigo-600 border-indigo-100',
    PNG:  'bg-purple-50 text-purple-600 border-purple-100',
  }
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border ${colors[ext] || 'bg-slate-50 text-slate-500 border-slate-100'}`}>
      {ext}
    </span>
  )
}

function FileTypeIcon({ ext }) {
  if (ext === 'PDF') {
    return (
      <div className="w-10 h-10 rounded-2xl bg-red-50 border border-red-100 flex items-center justify-center">
        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 3h6l3 3v15A2.25 2.25 0 0114.25 23h-6.5A2.25 2.25 0 015.5 21V5.25A2.25 2.25 0 017.75 3z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6" />
        </svg>
      </div>
    )
  }
  return (
    <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center">
      <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-indigo-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 6a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 6v12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18V6z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 16.5l4.159-4.159a2.25 2.25 0 013.182 0l2.409 2.409 1.659-1.659a2.25 2.25 0 013.182 0L21 15.909" />
      </svg>
    </div>
  )
}

function SkeletonCard() {
  return (
    <Card className="animate-pulse hover:shadow-sm" bodyClassName="">
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-slate-100" />
            <div className="min-w-0">
              <div className="h-3.5 w-44 bg-slate-100 rounded mb-2" />
              <div className="h-2.5 w-28 bg-slate-100 rounded" />
            </div>
          </div>
          <div className="h-6 w-14 bg-slate-100 rounded-full" />
        </div>
        <div className="mt-4 flex gap-2">
          <div className="h-10 flex-1 bg-slate-100 rounded-2xl" />
          <div className="h-10 w-24 bg-slate-100 rounded-2xl" />
        </div>
      </div>
    </Card>
  )
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

export default function ReportList({ onCountChange }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [deletingId, setDeletingId] = useState(null)

  const fetchReports = useCallback(async () => {
    if (!user) return
    setLoading(true)
    setError('')
    try {
      const { data, error: fetchError } = await supabase
        .from('reports')
        .select('*')
        .eq('user_id', user.id)
        .order('uploaded_at', { ascending: false })

      if (fetchError) throw fetchError
      setReports(data || [])
      onCountChange?.(data?.length || 0)
    } catch (err) {
      setError('Could not load your reports. Please refresh.')
    } finally {
      setLoading(false)
    }
  }, [user, onCountChange])

  useEffect(() => {
    fetchReports()
  }, [fetchReports])

  const cards = useMemo(() => {
    return (reports || []).map((r) => ({
      ...r,
      ext: getExt(r.file_name),
    }))
  }, [reports])

  async function handleDelete(report) {
    const ok = confirmDanger(`Delete "${report.file_name}"?\n\nThis will remove the report and its analysis.`)
    if (!ok) return

    setDeletingId(report.id)
    setError('')
    try {
      const filePath = getStoragePath(report.file_url)

      // 1) delete analysis rows (best-effort)
      await supabase.from('report_analysis').delete().eq('report_id', report.id)

      // 2) delete storage object (best-effort)
      if (filePath) {
        await supabase.storage.from('cbc-reports').remove([filePath])
      }

      // 3) delete report row
      const { error: dbError } = await supabase
        .from('reports')
        .delete()
        .eq('id', report.id)
        .eq('user_id', user.id)

      if (dbError) throw dbError

      await fetchReports()
    } catch (err) {
      setError(err?.message || 'Delete failed. Please try again.')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div>
      {/* Section Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary-600 to-secondary-500 flex items-center justify-center shadow-sm">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="white" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">My Reports</h2>
            {!loading && !error && (
              <p className="text-xs text-slate-400">
                {reports.length === 0 ? 'No reports yet' : `${reports.length} report${reports.length !== 1 ? 's' : ''} uploaded`}
              </p>
            )}
          </div>
        </div>

        <Button as={Link} to="/upload" variant="primary" size="xs">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Upload
        </Button>
      </div>

      {/* Error */}
      {!loading && error && (
        <div className="mb-4">
          <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-100 rounded-2xl">
            <span className="text-red-500 text-xl flex-shrink-0">⚠️</span>
            <div className="min-w-0">
              <p className="text-red-700 text-sm font-semibold break-words">{error}</p>
              <button onClick={fetchReports} className="mt-2 text-xs text-primary-700 hover:underline font-semibold">
                Refresh
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => <SkeletonCard key={i} />)}
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && reports.length === 0 && (
        <EmptyState
          title="No reports uploaded"
          description="Upload a CBC report to view it here and get AI insights."
          actionLabel="Upload Report"
          actionTo="/upload"
        />
      )}

      {/* Cards */}
      {!loading && !error && reports.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {cards.map((report) => (
            <div key={report.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden group">
              <button
                type="button"
                onClick={() => navigate(`/reports/${report.id}`)}
                className="w-full text-left p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <FileTypeIcon ext={report.ext} />
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900 truncate">{report.file_name}</p>
                      <p className="text-xs text-slate-400 mt-1">{formatDate(report.uploaded_at)}</p>
                    </div>
                  </div>
                  <FileTypeBadge ext={report.ext} />
                </div>
              </button>

              <div className="px-5 pb-5">
                <div className="flex items-center gap-2">
                  <Button as={Link} to={`/reports/${report.id}`} variant="soft" className="flex-1">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    View Report
                  </Button>

                  <Button
                    type="button"
                    onClick={() => handleDelete(report)}
                    disabled={deletingId === report.id}
                    variant="danger"
                  >
                    {deletingId === report.id ? (
                      <Spinner size={20} className="border-red-200 border-t-red-600" />
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 7.5h12M9 7.5V6a1.5 1.5 0 011.5-1.5h3A1.5 1.5 0 0115 6v1.5m-7.5 0l.75 12A2.25 2.25 0 0010.494 21h3.012a2.25 2.25 0 002.244-1.5l.75-12" />
                      </svg>
                    )}
                    Delete
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
