import { StyleSheet, Text, View } from 'react-native'
import { theme } from '../lib/theme'
import { typography } from '../lib/typography'

export default function StatCard({ value, label, tone = 'primary' }) {
  const colors = {
    primary: { bg: '#e6fffa', text: theme.colors.primary },
    sky: { bg: '#e0f2fe', text: theme.colors.sky },
    orange: { bg: '#fff7ed', text: theme.colors.accent },
  }

  const palette = colors[tone] || colors.primary

  return (
    <View style={[styles.card, { backgroundColor: palette.bg }]}> 
      <Text style={[styles.value, { color: palette.text }]}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
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
    color: '#334155',
    fontSize: 13,
  },
})
