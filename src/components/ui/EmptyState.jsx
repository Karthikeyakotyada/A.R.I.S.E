import { Link } from 'react-router-dom'
import Button from './Button'

export default function EmptyState({
  title,
  description,
  actionLabel,
  actionTo,
  icon,
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
      <div className="flex flex-col items-center justify-center py-14 px-6 text-center">
        <div className="w-14 h-14 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center mb-4">
          {icon || (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-7 h-7 text-slate-300">
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 3h6l3 3v15A2.25 2.25 0 0114.25 23h-6.5A2.25 2.25 0 015.5 21V5.25A2.25 2.25 0 017.75 3z" />
            </svg>
          )}
        </div>
        <p className="text-base font-bold text-slate-800 mb-1">{title}</p>
        {description && <p className="text-sm text-slate-500 mb-5 max-w-sm">{description}</p>}
        {actionLabel && actionTo && (
          <Button as={Link} to={actionTo} variant="primary" className="w-auto">
            {actionLabel}
          </Button>
        )}
      </div>
    </div>
  )
}

