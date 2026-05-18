import { useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useTheme } from '../context/ThemeContext'
import { typography } from '../lib/typography'

export default function StatCard({ value, label, tone = 'primary' }) {
  const { theme, isDark } = useTheme()
  const styles = useMemo(() => createStyles(theme), [theme])

  const palettes = {
    primary: {
      bg: isDark ? 'rgba(39, 225, 193, 0.1)' : '#e6fffa',
      text: theme.colors.primary,
    },
    sky: {
      bg: isDark ? 'rgba(24, 182, 255, 0.1)' : '#e0f2fe',
      text: theme.colors.accent,
    },
    orange: {
      bg: isDark ? 'rgba(231, 111, 81, 0.12)' : '#fff7ed',
      text: theme.colors.accentWarm,
    },
  }

  const palette = palettes[tone] || palettes.primary

  return (
    <View style={[styles.card, { backgroundColor: palette.bg }]}>
      <Text style={[styles.value, { color: palette.text }]}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  )
}

function createStyles(theme) {
  return StyleSheet.create({
    card: {
      flex: 1,
      borderRadius: 16,
      padding: 14,
      gap: 4,
    },
    value: {
      ...typography.style.bold,
      fontSize: 30,
    },
    label: {
      ...typography.style.semiBold,
      color: theme.colors.textSecondary,
      fontSize: 13,
    },
  })
}
