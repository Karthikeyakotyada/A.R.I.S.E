import { useState, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { Link } from 'react-router-dom'
import ReportList from '../components/ReportList'
import HealthLogsPreview from '../components/HealthLogsPreview'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'

export default function Dashboard() {
  const { user } = useAuth()
  const [reportCount, setReportCount] = useState(0)

  const handleCountChange = useCallback((count) => {
    setReportCount(count)
  }, [])

  const displayName = user?.user_metadata?.name || user?.email?.split('@')[0] || 'User'

  const stats = [
    { label: 'Reports Uploaded', value: reportCount > 0 ? reportCount : '—', icon: '📊' },
    { label: 'Health Logs', value: '—', icon: '🫀' },
    { label: 'AI Insights', value: '—', icon: '🧠' },
  ]

  return (
    <div className="py-6">

        {/* Welcome Banner */}
        <div className="bg-gradient-to-r from-primary-600 to-secondary-500 rounded-2xl p-6 sm:p-8 text-white mb-6 shadow-lg shadow-primary-200/40 animate-fade-in">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-primary-100 text-sm font-medium mb-1">Welcome back 👋</p>
              <h2 className="text-2xl sm:text-3xl font-bold mb-2">{displayName}</h2>
              <p className="text-primary-100 text-sm max-w-md">
                Your AI-powered health intelligence dashboard is ready. Upload CBC reports to get instant insights.
              </p>
            </div>
            <div className="hidden md:flex flex-col items-center gap-3">
              <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center text-3xl">
                🏥
              </div>
              <Button as={Link} to="/upload" variant="ghost" size="xs" className="bg-white/20 border border-white/20 text-white hover:bg-white/30">
                + Upload Report
              </Button>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          {stats.map((stat) => (
            <Card key={stat.label} className="active:scale-[0.995]" bodyClassName="p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-2xl">{stat.icon}</span>
                <span className="text-xs text-slate-400 font-medium bg-slate-50 px-2 py-1 rounded-full">
                  {stat.label === 'Reports Uploaded' && reportCount > 0 ? 'Updated' : 'No data yet'}
                </span>
              </div>
              <p className="text-2xl font-bold text-slate-800 mb-1">{stat.value}</p>
              <p className="text-sm text-slate-500">{stat.label}</p>
            </Card>
          ))}
        </div>

        {/* Health Logs History */}
        <div className="mb-6">
          <HealthLogsPreview limit={3} compact />
        </div>

        {/* My Reports Section */}
        <ReportList onCountChange={handleCountChange} />
    </div>
  )
}
