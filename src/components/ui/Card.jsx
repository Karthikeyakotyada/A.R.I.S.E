export default function Card({ children, className = '', bodyClassName = '' }) {
  return (
    <div className={`bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all duration-200 ${className}`}>
      <div className={`p-5 ${bodyClassName}`}>{children}</div>
    </div>
  )
}

