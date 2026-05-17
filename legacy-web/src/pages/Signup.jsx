import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

// Icons
const EyeIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.964-7.178z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
)

const EyeSlashIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
  </svg>
)

const AlertIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 flex-shrink-0 mt-0.5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
  </svg>
)

const CheckIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 flex-shrink-0 mt-0.5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
)

const SpinnerIcon = () => (
  <svg className="animate-spin w-5 h-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
)

const GoogleIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M23 12.25c0-.92-.06-1.81-.19-2.68H12v5.07h6.19c-.27 1.39-.91 2.6-1.93 3.39v2.46h3.13c1.83-1.68 2.88-4.16 2.88-7.24z" fill="#4285F4" />
    <path d="M12 23.5c2.6 0 4.77-.87 6.36-2.35l-3.13-2.46c-.87.58-1.99.93-3.23.93-2.48 0-4.58-1.67-5.33-3.91H3.66v2.53C5.25 22.38 8.38 23.5 12 23.5z" fill="#34A853" />
    <path d="M6.67 14.81c-.19-.58-.3-1.19-.3-1.81s.11-1.23.3-1.81V8.66H3.66C2.98 10.09 2.6 11.5 2.6 13c0 1.5.38 2.91 1.06 4.34l3.01-2.53z" fill="#FBBC04" />
    <path d="M12 4.5c1.4 0 2.66.48 3.65 1.41l2.73-2.73C16.76.99 14.6 0 12 0 8.38 0 5.25 1.12 3.66 3.34l3.01 2.53c.75-2.24 2.85-3.37 5.33-3.37z" fill="#EA4335" />
  </svg>
)

export default function Signup() {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  })
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})

  const updateField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (fieldErrors[field]) {
      setFieldErrors((prev) => ({ ...prev, [field]: '' }))
    }
  }

  const validate = () => {
    const errors = {}
    if (!form.name.trim()) errors.name = 'Full name is required.'
    if (!form.email.trim()) errors.email = 'Email address is required.'
    if (form.password.length < 8) errors.password = 'Password must be at least 8 characters.'
    if (form.password !== form.confirmPassword) errors.confirmPassword = 'Passwords do not match.'
    return errors
  }

  const handleSignup = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    const errors = validate()
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }

    setLoading(true)

    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: form.email.trim(),
        password: form.password,
        options: {
          data: { name: form.name.trim() },
        },
      })

      if (authError) {
        if (authError.message.includes('already registered')) {
          setError('This email is already registered. Try logging in instead.')
        } else {
          setError(authError.message)
        }
        return
      }

      if (authData.user) {
        const { error: profileError } = await supabase
          .from('profiles')
          .insert({
            id: authData.user.id,
            name: form.name.trim(),
            email: form.email.trim().toLowerCase(),
          })

        if (profileError) {
          console.warn('Profile insert warning:', profileError.message)
        }
      }

      if (authData.session) {
        navigate('/dashboard', { replace: true })
      } else {
        setSuccess(
          'Account created! Please check your email to confirm your account before signing in.'
        )
      }
    } catch (err) {
      setError('An unexpected error occurred. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleSignIn = async () => {
    setError('')
    setGoogleLoading(true)

    try {
      // Log for debugging
      console.log('Starting Google OAuth for signup with redirectTo:', window.location.origin)

      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,  // Simpler redirect URL first
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      })

      console.log('OAuth response:', { data, oauthError })

      if (oauthError) {
        console.error('OAuth error details:', oauthError)
        setError(`OAuth Error: ${oauthError.message || 'Failed to sign up with Google'}`)
        setGoogleLoading(false)
        return
      }

      // If we get here without error, redirect should happen automatically
    } catch (err) {
      console.error('Google sign up error:', err)
      setError(`Error: ${err.message || 'An error occurred during Google sign up'}`)
      setGoogleLoading(false)
    }
  }

  const getPasswordStrength = () => {
    const p = form.password
    if (p.length === 0) return null
    if (p.length < 8) return { level: 0, label: 'Too short', color: 'bg-red-400' }
    const hasUpper = /[A-Z]/.test(p)
    const hasNumber = /[0-9]/.test(p)
    const hasSpecial = /[^A-Za-z0-9]/.test(p)
    const score = [hasUpper, hasNumber, hasSpecial].filter(Boolean).length
    if (score === 0) return { level: 1, label: 'Weak', color: 'bg-orange-400' }
    if (score === 1) return { level: 2, label: 'Fair', color: 'bg-yellow-400' }
    if (score === 2) return { level: 3, label: 'Good', color: 'bg-primary-400' }
    return { level: 4, label: 'Strong', color: 'bg-emerald-500' }
  }

  const strength = getPasswordStrength()

  return (
    <div className="auth-bg min-h-screen flex items-center justify-center p-4 py-12">
      <div className="w-full max-w-md animate-slide-up">

        {/* ARISE Logo + Branding */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-600 to-secondary-500 shadow-lg shadow-primary-200 mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="white" className="w-8 h-8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">
            A<span className="text-primary-600">.</span>R<span className="text-primary-600">.</span>I<span className="text-primary-600">.</span>S<span className="text-primary-600">.</span>E
          </h1>
          <p className="text-slate-500 text-sm mt-1 font-medium">AI Driven Report Insight & Smart Evaluation</p>
        </div>

        {/* Auth Card */}
        <div className="auth-card">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-slate-900">Create your account</h2>
            <p className="text-slate-500 text-sm mt-1">Join ARISE and unlock AI-powered health insights</p>
          </div>

          {/* Error Alert */}
          {error && (
            <div className="alert-error mb-5 animate-fade-in">
              <AlertIcon />
              <span>{error}</span>
            </div>
          )}

          {/* Success Alert */}
          {success && (
            <div className="alert-success mb-5 animate-fade-in">
              <CheckIcon />
              <span>{success}</span>
            </div>
          )}

          {/* Google Sign-In Button */}
          <button
            onClick={handleGoogleSignIn}
            disabled={googleLoading || loading || !!success}
            className="w-full flex justify-center items-center gap-3 py-3 px-4 mb-4 border-2 border-slate-200 rounded-xl text-slate-700 font-semibold text-sm hover:bg-slate-50 hover:border-slate-300 transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {googleLoading ? (
              <>
                <SpinnerIcon />
                <span>Signing up...</span>
              </>
            ) : (
              <>
                <GoogleIcon />
                <span>Sign up with Google</span>
              </>
            )}
          </button>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-100" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-3 bg-white text-slate-400">Or sign up with email</span>
            </div>
          </div>

          <form onSubmit={handleSignup} className="space-y-5" noValidate>

            {/* Full Name */}
            <div>
              <label htmlFor="name" className="label">Full Name</label>
              <input
                id="name"
                type="text"
                value={form.name}
                onChange={(e) => updateField('name', e.target.value)}
                placeholder="Dr. Jane Smith"
                className={`input-field ${fieldErrors.name ? 'input-field-error' : ''}`}
                autoComplete="name"
                autoFocus
                disabled={googleLoading}
              />
              {fieldErrors.name && (
                <p className="text-red-500 text-xs mt-1.5">{fieldErrors.name}</p>
              )}
            </div>

            {/* Email */}
            <div>
              <label htmlFor="email" className="label">Email address</label>
              <input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => updateField('email', e.target.value)}
                placeholder="you@example.com"
                className={`input-field ${fieldErrors.email ? 'input-field-error' : ''}`}
                autoComplete="email"
                disabled={googleLoading}
              />
              {fieldErrors.email && (
                <p className="text-red-500 text-xs mt-1.5">{fieldErrors.email}</p>
              )}
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password" className="label">Password</label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={(e) => updateField('password', e.target.value)}
                  placeholder="Min. 8 characters"
                  className={`input-field pr-12 ${fieldErrors.password ? 'input-field-error' : ''}`}
                  autoComplete="new-password"
                  disabled={googleLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-50"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  disabled={googleLoading}
                >
                  {showPassword ? <EyeSlashIcon /> : <EyeIcon />}
                </button>
              </div>

              {/* Password Strength Bar */}
              {form.password && strength && (
                <div className="mt-2 animate-fade-in">
                  <div className="flex gap-1 mb-1">
                    {[1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                          i <= strength.level ? strength.color : 'bg-slate-100'
                        }`}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-slate-400">
                    Strength: <span className="font-medium text-slate-600">{strength.label}</span>
                  </p>
                </div>
              )}

              {fieldErrors.password && (
                <p className="text-red-500 text-xs mt-1.5">{fieldErrors.password}</p>
              )}
            </div>

            {/* Confirm Password */}
            <div>
              <label htmlFor="confirmPassword" className="label">Confirm Password</label>
              <div className="relative">
                <input
                  id="confirmPassword"
                  type={showConfirm ? 'text' : 'password'}
                  value={form.confirmPassword}
                  onChange={(e) => updateField('confirmPassword', e.target.value)}
                  placeholder="Re-enter your password"
                  className={`input-field pr-12 ${fieldErrors.confirmPassword ? 'input-field-error' : ''}`}
                  autoComplete="new-password"
                  disabled={googleLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-50"
                  aria-label={showConfirm ? 'Hide password' : 'Show password'}
                  disabled={googleLoading}
                >
                  {showConfirm ? <EyeSlashIcon /> : <EyeIcon />}
                </button>
              </div>
              {fieldErrors.confirmPassword && (
                <p className="text-red-500 text-xs mt-1.5">{fieldErrors.confirmPassword}</p>
              )}
            </div>

            {/* Terms notice */}
            <p className="text-xs text-slate-400 leading-relaxed">
              By creating an account, you agree to our{' '}
              <span className="text-primary-600 cursor-pointer hover:underline">Terms of Service</span>{' '}
              and{' '}
              <span className="text-primary-600 cursor-pointer hover:underline">Privacy Policy</span>.
            </p>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || googleLoading || !!success}
              className="btn-primary"
            >
              {loading ? (
                <>
                  <SpinnerIcon />
                  <span className="ml-2">Creating account...</span>
                </>
              ) : (
                'Create account'
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-100" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-3 bg-white text-slate-400">Already have an account?</span>
            </div>
          </div>

          <Link
            to="/login"
            className="flex justify-center items-center w-full py-3 px-4 border-2 border-primary-200 rounded-xl text-primary-600 font-semibold text-sm hover:bg-primary-50 hover:border-primary-300 transition-all duration-200"
          >
            Sign in instead
          </Link>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-slate-400 mt-6">
          © 2026 ARISE Health Intelligence. All rights reserved.
        </p>
      </div>
    </div>
  )
}
