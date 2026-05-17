import { Platform } from 'react-native'

/** SF Pro / system-ui stack — entire app except hero greeting */
export const systemFontFamily = Platform.select({
  ios: 'System',
  android: 'sans-serif',
  web: 'system-ui, -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  default: 'System',
})

/** Dashboard hero greeting only — Times New Roman */
export const heroFontFamily = Platform.select({
  ios: 'Times New Roman',
  android: 'serif',
  web: '"Times New Roman", Times, serif',
  default: 'Times New Roman',
})

const weights = {
  regular: '400',
  medium: '500',
  semiBold: '600',
  bold: '700',
  extraBold: '700',
}

function systemStyle(weightKey) {
  return {
    fontFamily: systemFontFamily,
    fontWeight: weights[weightKey] || '400',
  }
}

export const typography = {
  system: systemFontFamily,
  hero: heroFontFamily,
  /** Spread into StyleSheet entries: { ...typography.style.bold, fontSize: 14 } */
  style: {
    regular: systemStyle('regular'),
    medium: systemStyle('medium'),
    semiBold: systemStyle('semiBold'),
    bold: systemStyle('bold'),
    extraBold: systemStyle('extraBold'),
    /** Hero greeting — Times New Roman bold only */
    hero: {
      fontFamily: heroFontFamily,
      fontWeight: '700',
    },
  },
  /** @deprecated Use typography.style.* — kept for Platform.select / fontFamily-only call sites */
  regular: systemFontFamily,
  medium: systemFontFamily,
  semiBold: systemFontFamily,
  bold: systemFontFamily,
  extraBold: systemFontFamily,
  display: heroFontFamily,
}
