import { Platform } from 'react-native'

export function isDarkTheme(theme) {
  return theme?.scheme === 'dark'
}

export function getScreenBackgroundColors(theme) {
  if (isDarkTheme(theme)) {
    return [theme.colors.gradientTop, theme.colors.background, theme.colors.gradientBottom]
  }
  return [theme.colors.background, theme.colors.background]
}

export function getCardShadowStyle(theme) {
  const dark = isDarkTheme(theme)
  if (Platform.OS === 'web') {
    return dark
      ? { boxShadow: '0px 12px 32px rgba(0, 0, 0, 0.42), 0px 2px 8px rgba(39, 225, 193, 0.04)' }
      : { boxShadow: '0px 6px 14px rgba(11, 19, 32, 0.08)' }
  }
  if (dark) {
    return {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.38,
      shadowRadius: 20,
      elevation: 8,
    }
  }
  return {
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 2,
  }
}

export function getFloatingTabShadow(theme) {
  const dark = isDarkTheme(theme)
  if (Platform.OS === 'web') {
    return dark
      ? {
          boxShadow:
            '0px 16px 40px rgba(0, 0, 0, 0.55), 0px 0px 24px rgba(39, 225, 193, 0.06)',
        }
      : { boxShadow: '0px 10px 28px rgba(15, 23, 42, 0.1), 0px 2px 8px rgba(15, 23, 42, 0.05)' }
  }
  if (dark) {
    return {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: 0.5,
      shadowRadius: 24,
      elevation: 14,
    }
  }
  return {
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 18,
    elevation: 10,
  }
}

export function getHeroGradientColors(theme) {
  if (isDarkTheme(theme)) {
    return theme.colors.heroGradient
  }
  return ['#119e8f', '#0f766e', '#0b5f57', '#094f48']
}

/** @param {'success' | 'error' | 'warning' | 'info'} tone */
export function getReportStatusBadgeColors(theme, tone) {
  const dark = isDarkTheme(theme)
  if (dark) {
    if (tone === 'success') {
      return { bg: 'rgba(39, 225, 193, 0.12)', border: 'rgba(39, 225, 193, 0.28)', text: '#7CEBDC' }
    }
    if (tone === 'error') {
      return { bg: 'rgba(220, 38, 38, 0.14)', border: 'rgba(248, 113, 113, 0.28)', text: '#FCA5A5' }
    }
    if (tone === 'warning') {
      return { bg: 'rgba(245, 158, 11, 0.12)', border: 'rgba(251, 191, 36, 0.28)', text: '#FCD34D' }
    }
    return { bg: 'rgba(24, 182, 255, 0.12)', border: 'rgba(56, 189, 248, 0.28)', text: '#7DD3FC' }
  }
  if (tone === 'success') {
    return { bg: '#dcfce7', border: '#86efac', text: '#166534' }
  }
  if (tone === 'error') {
    return { bg: '#fee2e2', border: '#fca5a5', text: '#991b1b' }
  }
  if (tone === 'warning') {
    return { bg: '#ffedd5', border: '#fdba74', text: '#9a3412' }
  }
  return { bg: '#e0f2fe', border: '#93c5fd', text: '#1e40af' }
}

/** @param {'normal' | 'critical' | 'warning'} severity */
export function getSeverityPalette(theme, severity) {
  const dark = isDarkTheme(theme)
  if (!dark) {
    if (severity === 'normal') {
      return {
        bg: '#ecfdf5',
        border: '#86efac',
        text: '#166534',
        value: '#15803d',
        softBorder: '#bbf7d0',
        tint: 'rgba(22, 163, 74, 0.08)',
      }
    }
    if (severity === 'critical') {
      return {
        bg: '#fef2f2',
        border: '#fca5a5',
        text: '#b91c1c',
        value: '#dc2626',
        softBorder: '#fecaca',
        tint: 'rgba(220, 38, 38, 0.08)',
      }
    }
    return {
      bg: '#fff7ed',
      border: '#fdba74',
      text: '#9a3412',
      value: '#c2410c',
      softBorder: '#fed7aa',
      tint: 'rgba(245, 158, 11, 0.08)',
    }
  }
  if (severity === 'normal') {
    return {
      bg: theme.colors.elevated,
      border: 'rgba(39, 225, 193, 0.35)',
      text: '#7CEBDC',
      value: '#4ADE80',
      softBorder: 'rgba(39, 225, 193, 0.2)',
      tint: 'rgba(39, 225, 193, 0.1)',
    }
  }
  if (severity === 'critical') {
    return {
      bg: theme.colors.elevated,
      border: 'rgba(248, 113, 113, 0.35)',
      text: '#FCA5A5',
      value: '#F87171',
      softBorder: 'rgba(248, 113, 113, 0.22)',
      tint: 'rgba(220, 38, 38, 0.12)',
    }
  }
  return {
    bg: theme.colors.elevated,
    border: 'rgba(251, 191, 36, 0.35)',
    text: '#FCD34D',
    value: '#FBBF24',
    softBorder: 'rgba(251, 191, 36, 0.22)',
    tint: 'rgba(245, 158, 11, 0.1)',
  }
}
