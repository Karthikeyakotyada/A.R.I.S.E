import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import HealthLogsPreview from '../components/HealthLogsPreview'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'

export default function Health() {
  const cards = useMemo(() => ([
    {
      title: 'Health Logs',
      subtitle: 'Manual tracking',
      right: <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">New</span>,
      body: 'Log your vitals (heart rate, BP, sugar, temperature) and symptoms to track how you feel day by day.',
      cta: { label: 'Open Health Logs', to: '/health/logs' },
    },
  ]), [])

  return (
    <div className="py-6">
      <div className="mb-5">
        <div className="bg-gradient-to-r from-primary-600 to-secondary-500 rounded-2xl p-6 text-white shadow-lg shadow-primary-200/40">
          <p className="text-primary-100 text-sm font-medium">Your Health</p>
          <h2 className="text-2xl font-extrabold mt-1">Health Logs</h2>
          <p className="text-primary-100 text-sm mt-2 max-w-xl">
            Track your vitals and symptoms to build a simple history you can review anytime.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {cards.map((c) => (
          <Card key={c.title}>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h3 className="text-sm font-extrabold text-slate-900">{c.title}</h3>
                {c.subtitle && <p className="text-xs text-slate-400 mt-1">{c.subtitle}</p>}
              </div>
              {c.right}
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">{c.body}</p>
            {c.cta && (
              <div className="mt-4">
                <Button as={Link} to={c.cta.to} variant="soft">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  {c.cta.label}
                </Button>
              </div>
            )}
          </Card>
        ))}

        <HealthLogsPreview limit={5} />
      </div>
    </div>
  )
}

