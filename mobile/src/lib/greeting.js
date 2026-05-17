/**
 * Time-based dashboard hero greeting (device local time).
 * Morning 5:00–11:59 · Afternoon 12:00–16:59 · Evening 17:00–20:59 · Night → Welcome Back
 */
export function getTimeGreetingPhrase(date = new Date()) {
  const hour = date.getHours()
  if (hour >= 5 && hour < 12) return 'Good Morning'
  if (hour >= 12 && hour < 17) return 'Good Afternoon'
  if (hour >= 17 && hour < 21) return 'Good Evening'
  return 'Welcome Back'
}

export function getFirstName(fullName) {
  const trimmed = String(fullName || '').trim()
  if (!trimmed) return null
  const first = trimmed.split(/\s+/)[0]
  if (!first) return null
  return first.charAt(0).toUpperCase() + first.slice(1)
}

/**
 * Resolve display name from profile row and Supabase auth user (never hardcoded).
 */
export function resolveDisplayName({ user, profile } = {}) {
  const fromProfile = String(profile?.name || '').trim()
  const fromMeta = String(user?.user_metadata?.name || '').trim()
  const fromEmail = user?.email?.split('@')[0]?.trim()
  return fromProfile || fromMeta || fromEmail || 'User'
}

/** e.g. "Good Afternoon, Rahul!" or "Welcome Back, Sneha!" */
export function formatHeroGreeting(displayName, date = new Date()) {
  const phrase = getTimeGreetingPhrase(date)
  const firstName = getFirstName(displayName) || 'there'
  return `${phrase}, ${firstName}!`
}

/** Hero date line — e.g. "17 Sunday, May" (device local date) */
export function formatHeroDateLine(date = new Date()) {
  const day = date.getDate()
  const weekday = date.toLocaleDateString(undefined, { weekday: 'long' })
  const month = date.toLocaleDateString(undefined, { month: 'long' })
  return `${day} ${weekday}, ${month}`
}
