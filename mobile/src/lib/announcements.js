import { supabase } from './supabaseClient'

/** @typedef {{ id: string, icon: string, title: string, subtitle: string }} AnnouncementItem */

export const FALLBACK_ANNOUNCEMENTS = /** @type {AnnouncementItem[]} */ ([
  {
    id: 'fallback-1',
    icon: '🚀',
    title: 'AI Health Upgrade',
    subtitle: 'CBC analysis is now faster on ARISE.',
  },
  {
    id: 'fallback-2',
    icon: '💧',
    title: 'Stay Hydrated',
    subtitle: 'Your hydration level may be low today.',
  },
  {
    id: 'fallback-3',
    icon: '🧠',
    title: 'Smart Insights',
    subtitle: 'New AI recommendations are available.',
  },
])

const FALLBACK_ICONS = ['📢', '✨', '💡', '🩺', '🔬']

function extractLeadingEmoji(text) {
  if (!text || typeof text !== 'string') return null
  const trimmed = text.trim()
  const code = trimmed.codePointAt(0)
  if (code === undefined) return null
  const isEmoji =
    (code >= 0x1f300 && code <= 0x1faff) ||
    (code >= 0x2600 && code <= 0x27bf) ||
    code === 0x1f680 ||
    code === 0x1f4a7 ||
    code === 0x1f9e0
  if (!isEmoji) return null
  return String.fromCodePoint(code)
}

function stripLeadingEmoji(text) {
  if (!text || typeof text !== 'string') return text
  const emoji = extractLeadingEmoji(text)
  if (!emoji) return text.trim()
  return text.trim().slice(emoji.length).trim()
}

/**
 * @param {Array<{ id: string, title?: string, subtitle?: string }>} rows
 * @returns {AnnouncementItem[]}
 */
export function mapAnnouncementRows(rows) {
  return (rows || []).map((row, index) => {
    const rawTitle = row.title || 'ARISE Update'
    const emoji = extractLeadingEmoji(rawTitle)
    return {
      id: String(row.id),
      icon: emoji || FALLBACK_ICONS[index % FALLBACK_ICONS.length],
      title: emoji ? stripLeadingEmoji(rawTitle) : rawTitle,
      subtitle: row.subtitle || '',
    }
  })
}

/**
 * @returns {Promise<{ announcements: AnnouncementItem[], fromFallback: boolean, error?: string }>}
 */
export async function fetchActiveAnnouncements() {
  const { data, error } = await supabase
    .from('announcements')
    .select('id, title, subtitle, active, created_at')
    .eq('active', true)
    .order('created_at', { ascending: false })

  if (error) {
    console.warn('[ARISE] announcements fetch failed:', error.message)
    return {
      announcements: FALLBACK_ANNOUNCEMENTS,
      fromFallback: true,
      error: error.message,
    }
  }

  if (!data?.length) {
    return {
      announcements: FALLBACK_ANNOUNCEMENTS,
      fromFallback: true,
    }
  }

  return {
    announcements: mapAnnouncementRows(data),
    fromFallback: false,
  }
}
