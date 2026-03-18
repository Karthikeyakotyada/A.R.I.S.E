import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'
import Spinner from '../components/ui/Spinner'
import EmptyState from '../components/ui/EmptyState'
import { Field, Input, Textarea } from '../components/ui/Field'

function formatDate(ts) {
  return new Date(ts).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function toNullableNumber(value) {
  if (value === '' || value === null || value === undefined) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

export default function HealthLogs() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [logs, setLogs] = useState([])

  const [heartRate, setHeartRate] = useState('')
  const [bloodPressure, setBloodPressure] = useState('')
  const [bloodSugar, setBloodSugar] = useState('')
  const [temperature, setTemperature] = useState('')
  const [symptoms, setSymptoms] = useState('')

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
        .limit(50)

      if (fetchError) throw fetchError
      setLogs(data || [])
    } catch (err) {
      setError(err?.message || 'Could not load health logs.')
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  const canSave = useMemo(() => {
    return (
      heartRate !== '' ||
      bloodPressure.trim() !== '' ||
      bloodSugar !== '' ||
      temperature !== '' ||
      symptoms.trim() !== ''
    )
  }, [heartRate, bloodPressure, bloodSugar, temperature, symptoms])

  async function handleSave(e) {
    e.preventDefault()
    if (!user) return
    if (!canSave) {
      setError('Please fill at least one field to save a log.')
      return
    }

    setSaving(true)
    setError('')
    setSuccess('')
    try {
      const payload = {
        user_id: user.id,
        heart_rate: toNullableNumber(heartRate),
        blood_pressure: bloodPressure.trim() || null,
        blood_sugar: toNullableNumber(bloodSugar),
        temperature: toNullableNumber(temperature),
        symptoms: symptoms.trim() || null,
      }

      const { error: insertError } = await supabase
        .from('health_logs')
        .insert(payload)

      if (insertError) throw insertError

      setHeartRate('')
      setBloodPressure('')
      setBloodSugar('')
      setTemperature('')
      setSymptoms('')

      await fetchLogs()
      setSuccess('Saved to Health Logs.')
    } catch (err) {
      setError(err?.message || 'Could not save health log.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="py-6 space-y-4">
      <Card>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-extrabold text-slate-900">Health Logs</h2>
            <p className="text-sm text-slate-500 mt-1">
              Track your daily vitals and symptoms.
            </p>
          </div>
          <Link to="/health" className="text-sm font-semibold text-primary-700 hover:underline">
            Back
          </Link>
        </div>
      </Card>

      {error && (
        <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-100 rounded-2xl">
          <span className="text-red-500 text-xl flex-shrink-0">⚠️</span>
          <p className="text-red-700 text-sm font-semibold break-words">{error}</p>
        </div>
      )}

      {success && (
        <div className="flex items-start gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-2xl">
          <span className="text-emerald-600 text-xl flex-shrink-0">✓</span>
          <p className="text-emerald-700 text-sm font-semibold break-words">{success}</p>
        </div>
      )}

      <Card>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Heart Rate (bpm)">
              <Input
                value={heartRate}
                onChange={(e) => setHeartRate(e.target.value)}
                inputMode="numeric"
                placeholder="e.g., 72"
              />
            </Field>

            <Field label="Blood Pressure">
              <Input
                value={bloodPressure}
                onChange={(e) => setBloodPressure(e.target.value)}
                placeholder="e.g., 120/80"
              />
            </Field>

            <Field label="Blood Sugar (mg/dL)">
              <Input
                value={bloodSugar}
                onChange={(e) => setBloodSugar(e.target.value)}
                inputMode="decimal"
                placeholder="e.g., 98"
              />
            </Field>

            <Field label="Temperature (°F)">
              <Input
                value={temperature}
                onChange={(e) => setTemperature(e.target.value)}
                inputMode="decimal"
                placeholder="e.g., 98.6"
              />
            </Field>
          </div>

          <Field label="Symptoms">
            <Textarea
              value={symptoms}
              onChange={(e) => setSymptoms(e.target.value)}
              placeholder="e.g., headache, fatigue…"
              rows={3}
            />
          </Field>

          <Button
            type="submit"
            disabled={!canSave || saving}
            className="w-full"
          >
            {saving ? (
              <Spinner size={20} className="border-white/40 border-t-white" />
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            )}
            Save Log
          </Button>
        </form>
      </Card>

      <Card>
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-extrabold text-slate-900">History</p>
          <button onClick={fetchLogs} className="text-sm font-semibold text-primary-700 hover:underline">
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="py-10 flex items-center justify-center">
            <Spinner size={32} />
          </div>
        ) : logs.length === 0 ? (
          <EmptyState
            title="No data yet"
            description="Add your first health log using the form above."
            actionLabel="Add a log"
            actionTo="/health/logs"
          />
        ) : (
          <div className="space-y-3">
            {logs.map((log) => (
              <div key={log.id} className="rounded-2xl border border-slate-100 bg-slate-50/40 p-4">
                <p className="text-xs font-semibold text-slate-400">{formatDate(log.created_at)}</p>
                <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <p className="text-[11px] font-bold text-slate-500">Heart Rate</p>
                    <p className="text-sm font-extrabold text-slate-900">{log.heart_rate ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold text-slate-500">BP</p>
                    <p className="text-sm font-extrabold text-slate-900">{log.blood_pressure ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold text-slate-500">Sugar</p>
                    <p className="text-sm font-extrabold text-slate-900">{log.blood_sugar ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold text-slate-500">Temp</p>
                    <p className="text-sm font-extrabold text-slate-900">{log.temperature ?? '—'}</p>
                  </div>
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
      </Card>
    </div>
  )
}

