import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import Card from './ui/Card'
import Button from './ui/Button'
import Spinner from './ui/Spinner'
import EmptyState from './ui/EmptyState'

function formatDate(ts) {
  return new Date(ts).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function Stat({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-3">
      <p className="text-[11px] font-bold text-slate-500">{label}</p>
      <p className="text-sm font-extrabold text-slate-900 mt-1">{value ?? '—'}</p>
    </div>
  )
}

export default function HealthLogsPreview({ limit = 3, compact = false }) {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [logs, setLogs] = useState([])

  const fetchLogs = useCallback(async () => {
    if (!user) return
    setLoading(true)
    setError('')
    try {
      const { data, error: fetchError } = await supabase
        .from('health_logs')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(limit)

      if (fetchError) throw fetchError
      setLogs(data || [])
    } catch (err) {
      setError(err?.message || 'Could not load health logs.')
    } finally {
      setLoading(false)
    }
  }, [user, limit])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-extrabold text-slate-900">Health Logs History</p>
          <p className="text-xs text-slate-400 mt-1">Your latest entries</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button as={Link} to="/health/logs" variant="soft" size="xs" className="hidden sm:inline-flex">
            View all
          </Button>
          <Button as={Link} to="/health/logs" variant="primary" size="xs">
            + Add
          </Button>
        </div>
      </div>

      <div className="mt-4">
        {error && (
          <div className="mb-3 flex items-start gap-2 p-3 rounded-2xl bg-red-50 border border-red-100">
            <span className="text-red-500">⚠️</span>
            <p className="text-xs font-semibold text-red-700 break-words">{error}</p>
          </div>
        )}

        {loading ? (
          <div className="py-8 flex items-center justify-center">
            <Spinner size={28} />
          </div>
        ) : logs.length === 0 ? (
          <EmptyState
            title="No data yet"
            description="Add your first entry to see it here."
            actionLabel="Go to Health Logs"
            actionTo="/health/logs"
          />
        ) : (
          <div className="space-y-3">
            {logs.map((log) => (
              <div key={log.id} className="rounded-2xl border border-slate-100 bg-slate-50/40 p-4">
                <p className="text-xs font-semibold text-slate-400">{formatDate(log.created_at)}</p>
                <div className={`mt-2 grid ${compact ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-4'} gap-3`}>
                  <Stat label="Heart Rate" value={log.heart_rate} />
                  <Stat label="BP" value={log.blood_pressure} />
                  {!compact && <Stat label="Sugar" value={log.blood_sugar} />}
                  {!compact && <Stat label="Temp" value={log.temperature} />}
                </div>
                {log.symptoms && (
                  <p className="mt-3 text-sm text-slate-600">
                    <span className="font-bold text-slate-700">Symptoms:</span> {log.symptoms}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  )
}

