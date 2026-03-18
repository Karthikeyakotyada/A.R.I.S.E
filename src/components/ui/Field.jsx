function cls(...parts) {
  return parts.filter(Boolean).join(' ')
}

export function Input({ className = '', ...props }) {
  return (
    <input
      className={cls(
        'w-full px-4 py-3 rounded-2xl border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400',
        'focus:outline-none focus:ring-4 focus:ring-primary-100 focus:border-primary-300 transition',
        className
      )}
      {...props}
    />
  )
}

export function Textarea({ className = '', ...props }) {
  return (
    <textarea
      className={cls(
        'w-full px-4 py-3 rounded-2xl border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400',
        'focus:outline-none focus:ring-4 focus:ring-primary-100 focus:border-primary-300 transition resize-none',
        className
      )}
      {...props}
    />
  )
}

export function Field({ label, hint, children }) {
  return (
    <label className="block">
      {label && <span className="text-xs font-bold text-slate-600">{label}</span>}
      <div className="mt-1">{children}</div>
      {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
    </label>
  )
}

