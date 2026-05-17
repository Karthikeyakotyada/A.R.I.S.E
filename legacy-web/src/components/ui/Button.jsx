function cls(...parts) {
  return parts.filter(Boolean).join(' ')
}

export default function Button({
  as = 'button',
  variant = 'primary',
  size = 'md',
  className = '',
  disabled,
  children,
  ...props
}) {
  const Comp = as

  const base = 'inline-flex items-center justify-center gap-2 font-bold transition-all duration-200 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed'
  const sizes = {
    sm: 'px-4 py-2.5 rounded-2xl text-sm',
    md: 'px-5 py-3 rounded-2xl text-sm',
    xs: 'px-3 py-2 rounded-2xl text-xs',
  }
  const variants = {
    primary: 'text-white bg-gradient-to-r from-primary-600 to-secondary-500 shadow-sm shadow-primary-200/40 hover:from-primary-700 hover:to-secondary-600',
    soft: 'bg-slate-50 text-slate-700 border border-slate-200 hover:bg-slate-100',
    outline: 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50',
    danger: 'bg-red-50 text-red-700 border border-red-100 hover:bg-red-100',
    ghost: 'bg-transparent text-slate-700 hover:bg-slate-100',
  }

  return (
    <Comp
      className={cls(base, sizes[size] || sizes.md, variants[variant] || variants.primary, className)}
      disabled={disabled}
      {...props}
    >
      {children}
    </Comp>
  )
}

