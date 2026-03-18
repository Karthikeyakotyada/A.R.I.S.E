import { useEffect, useMemo, useState } from 'react'
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

function cls(...parts) {
  return parts.filter(Boolean).join(' ')
}

function Icon({ name, active }) {
  const common = cls('w-5 h-5', active ? 'text-primary-700' : 'text-slate-500')
  switch (name) {
    case 'home':
      return (
        <svg className={common} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l9.75-9.75L21.75 12M4.5 10.5V21h6.75v-5.25h1.5V21H19.5V10.5" />
        </svg>
      )
    case 'upload':
      return (
        <svg className={common} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M12 3v13.5m0-13.5l4.5 4.5M12 3L7.5 7.5" />
        </svg>
      )
    case 'reports':
      return (
        <svg className={common} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6M7.5 3h6l3 3v15A2.25 2.25 0 0114.25 23h-6.5A2.25 2.25 0 015.5 21V5.25A2.25 2.25 0 017.75 3z" />
        </svg>
      )
    case 'health':
      return (
        <svg className={common} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 21s-7.5-4.35-9.75-9A5.625 5.625 0 0112 5.25a5.625 5.625 0 019.75 6.75C19.5 16.65 12 21 12 21z" />
        </svg>
      )
    case 'profile':
      return (
        <svg className={common} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.5 21a7.5 7.5 0 0115 0" />
        </svg>
      )
    default:
      return null
  }
}

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Home', icon: 'home' },
  { to: '/upload', label: 'Upload', icon: 'upload' },
  { to: '/reports', label: 'Reports', icon: 'reports' },
  { to: '/health', label: 'Health', icon: 'health' },
  { to: '/profile', label: 'Profile', icon: 'profile' },
]

function getTitle(pathname) {
  if (pathname.startsWith('/upload')) return 'Upload'
  if (pathname.startsWith('/reports')) return 'Reports'
  if (pathname.startsWith('/health')) return 'Health'
  if (pathname.startsWith('/profile')) return 'Profile'
  return 'Dashboard'
}

function DesktopSidebar({ collapsed }) {
  return (
    <aside
      className={cls(
        'hidden lg:flex lg:flex-col lg:shrink-0 transition-[width] duration-300 ease-out',
        collapsed ? 'lg:w-24' : 'lg:w-72'
      )}
    >
      <div className="sticky top-0 h-screen p-5">
        <div className="h-full rounded-3xl bg-white border border-slate-100 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100">
            <div className={cls('flex items-center', collapsed ? 'justify-center' : 'gap-3')}>
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary-600 to-secondary-500 flex items-center justify-center shadow-sm">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="white" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              {!collapsed && (
                <div className="min-w-0">
                  <p className="font-extrabold text-slate-900 leading-tight">ARISE</p>
                  <p className="text-xs text-slate-400 -mt-0.5">AI Health Intelligence</p>
                </div>
              )}
            </div>
          </div>

          <nav className="p-3">
            <div className="space-y-1.5">
              {NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    cls(
                      cls(
                        'flex items-center px-3 py-2.5 rounded-2xl transition-all duration-200',
                        collapsed ? 'justify-center' : 'gap-3'
                      ),
                      isActive
                        ? 'bg-primary-50 border border-primary-100 text-primary-800 shadow-sm'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <div className={cls('w-9 h-9 rounded-2xl flex items-center justify-center', isActive ? 'bg-white border border-primary-100' : 'bg-slate-50 border border-slate-100')}>
                        <Icon name={item.icon} active={isActive} />
                      </div>
                      {!collapsed && (
                        <span className={cls('text-sm font-semibold', isActive ? 'text-primary-800' : 'text-slate-700')}>
                          {item.label}
                        </span>
                      )}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </nav>
        </div>
      </div>
    </aside>
  )
}

function TopBar({ collapsed, onToggleSidebar }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const title = getTitle(location.pathname)
  const displayName = user?.user_metadata?.name || user?.email?.split('@')[0] || 'User'
  const initials = displayName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return (
    <header className="sticky top-0 z-20 bg-slate-50/70 backdrop-blur supports-[backdrop-filter]:bg-slate-50/50">
      <div className="px-4 sm:px-6 lg:px-8 pt-4 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={onToggleSidebar}
              className="hidden lg:inline-flex items-center justify-center w-11 h-11 rounded-2xl bg-white border border-slate-100 shadow-sm hover:shadow-md transition-all duration-200 active:scale-[0.99]"
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-slate-700" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-400 tracking-wide uppercase">ARISE</p>
              <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 truncate">{title}</h1>
            </div>
          </div>

          <button
            type="button"
            onClick={() => navigate('/profile')}
            className="flex items-center gap-2 rounded-2xl bg-white border border-slate-100 shadow-sm px-3 py-2 hover:shadow-md transition-all duration-200 active:scale-[0.99]"
          >
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-primary-600 to-secondary-500 flex items-center justify-center text-white text-sm font-bold">
              {initials}
            </div>
            <div className="hidden sm:flex flex-col items-start leading-tight">
              <span className="text-sm font-semibold text-slate-900">{displayName}</span>
              <span className="text-xs text-slate-400">{user?.email}</span>
            </div>
          </button>
        </div>
      </div>
    </header>
  )
}

function MobileBottomNav() {
  return (
    <nav className="lg:hidden fixed inset-x-0 bottom-0 z-30">
      <div className="mx-auto max-w-2xl px-4 pb-4">
        <div className="rounded-3xl bg-white/95 backdrop-blur border border-slate-200 shadow-lg shadow-slate-200/60">
          <div className="grid grid-cols-5">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cls(
                    'flex flex-col items-center justify-center gap-1 py-3 transition-all duration-200',
                    isActive ? 'text-primary-700' : 'text-slate-500'
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon name={item.icon} active={isActive} />
                    <span className={cls('text-[11px] font-semibold', isActive ? 'text-primary-700' : 'text-slate-500')}>{item.label}</span>
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </div>
      </div>
    </nav>
  )
}

export default function AppShell() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem('arise.sidebarCollapsed') === '1'
    } catch {
      return false
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem('arise.sidebarCollapsed', sidebarCollapsed ? '1' : '0')
    } catch {
      // ignore
    }
  }, [sidebarCollapsed])

  const toggleSidebar = useMemo(() => {
    return () => setSidebarCollapsed((v) => !v)
  }, [])

  const location = useLocation()

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto flex">
        <DesktopSidebar collapsed={sidebarCollapsed} />

        <div className="flex-1 min-w-0">
          <TopBar collapsed={sidebarCollapsed} onToggleSidebar={toggleSidebar} />
          <main className="px-4 sm:px-6 lg:px-8 pb-28 lg:pb-10">
            <div className="max-w-6xl mx-auto">
              <div key={location.pathname} className="animate-fade-in">
                <Outlet />
              </div>
            </div>
          </main>
        </div>
      </div>

      <MobileBottomNav />
    </div>
  )
}

