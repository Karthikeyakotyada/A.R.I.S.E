export default function Spinner({ size = 20, className = '' }) {
  const s = typeof size === 'number' ? `${size}px` : size
  return (
    <div
      className={`inline-block rounded-full border-4 border-primary-100 border-t-primary-600 animate-spin ${className}`}
      style={{ width: s, height: s }}
    />
  )
}

