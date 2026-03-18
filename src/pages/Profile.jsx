import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'

export default function Profile() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  const displayName = user?.user_metadata?.name || user?.email?.split('@')[0] || 'User'
  const initials = displayName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  async function handleSignOut() {
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <div className="py-6 space-y-4">
      <Card>
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-3xl bg-gradient-to-br from-primary-600 to-secondary-500 flex items-center justify-center text-white text-lg font-extrabold shadow-sm">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="text-lg font-extrabold text-slate-900 truncate">{displayName}</p>
            <p className="text-sm text-slate-500 truncate">{user?.email}</p>
          </div>
        </div>
      </Card>

      <Card>
        <p className="text-sm font-bold text-slate-900">Account</p>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Plan</p>
            <p className="text-sm font-semibold text-slate-800 mt-1">Free</p>
          </div>
          <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Status</p>
            <p className="text-sm font-semibold text-slate-800 mt-1">Active</p>
          </div>
        </div>
      </Card>

      <Card>
        <Button
          type="button"
          onClick={handleSignOut}
          variant="danger"
          className="w-full"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
          </svg>
          Sign out
        </Button>
      </Card>
    </div>
  )
}

