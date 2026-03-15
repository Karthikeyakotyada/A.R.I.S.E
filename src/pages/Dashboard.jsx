import { useState, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { useNavigate, Link } from 'react-router-dom'
import ReportList from '../components/ReportList'

export default function Dashboard() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [reportCount, setReportCount] = useState(0)

  const handleSignOut = async () => {
    await signOut()
    navigate('/login', { replace: true })
  }

  const handleCountChange = useCallback((count) => {
    setReportCount(count)
  }, [])

  const displayName = user?.user_metadata?.name || user?.email?.split('@')[0] || 'User'
  const initials = displayName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  const stats = [
    { label: 'Reports Uploaded', value: reportCount > 0 ? reportCount : '—', icon: '📊' },
    { label: 'AI Insights', value: '—', icon: '🧠' },
    { label: 'Health Score', value: '—', icon: '❤️' },
  ]

  return (
    <div className="min-h-screen bg-slate-50">

      {/* Top Navigation */}
      <header className="bg-white border-b border-slate-100 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">

            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary-600 to-secondary-500 flex items-center justify-center shadow-sm">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="white" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <span className="font-bold text-slate-900 text-lg tracking-tight">ARISE</span>
                <span className="hidden sm:block text-xs text-slate-400 -mt-1">AI Health Intelligence</span>
              </div>
            </div>

            {/* Nav + User */}
            <div className="flex items-center gap-2 sm:gap-3">

              {/* Upload Report Nav Link */}
              <Link
                to="/upload"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-primary-600 to-secondary-500 text-white text-sm font-semibold shadow-sm shadow-primary-200/40 hover:from-primary-700 hover:to-secondary-600 transition-all duration-200"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                <span className="hidden sm:inline">Upload Report</span>
                <span className="sm:hidden">Upload</span>
              </Link>

              {/* User info */}
              <div className="hidden sm:flex flex-col items-end">
                <span className="text-sm font-medium text-slate-900">{displayName}</span>
                <span className="text-xs text-slate-400">{user?.email}</span>
              </div>
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary-500 to-secondary-500 flex items-center justify-center text-white text-sm font-bold shadow-sm">
                {initials}
              </div>
              <button
                onClick={handleSignOut}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 text-sm font-medium transition-all duration-200"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
                </svg>
                <span className="hidden sm:block">Sign out</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">

        {/* Welcome Banner */}
        <div className="bg-gradient-to-r from-primary-600 to-secondary-500 rounded-2xl p-8 text-white mb-8 shadow-lg shadow-primary-200/40 animate-fade-in">
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
              <Link
                to="/upload"
                className="px-4 py-2 rounded-xl bg-white/20 hover:bg-white/30 text-white text-xs font-semibold transition-all duration-200 border border-white/20"
              >
                + Upload Report
              </Link>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
          {stats.map((stat) => (
            <div key={stat.label} className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm hover:shadow-md transition-shadow duration-200">
              <div className="flex items-center justify-between mb-3">
                <span className="text-2xl">{stat.icon}</span>
                <span className="text-xs text-slate-400 font-medium bg-slate-50 px-2 py-1 rounded-full">
                  {stat.label === 'Reports Uploaded' && reportCount > 0 ? 'Updated' : 'No data yet'}
                </span>
              </div>
              <p className="text-2xl font-bold text-slate-800 mb-1">{stat.value}</p>
              <p className="text-sm text-slate-500">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* My Reports Section */}
        <ReportList onCountChange={handleCountChange} />

      </main>
    </div>
  )
}
