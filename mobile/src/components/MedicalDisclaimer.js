import { useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { useTheme } from '../context/ThemeContext'
import { typography } from '../lib/typography'
import { isDarkTheme } from '../lib/themeUi'

export default function MedicalDisclaimer() {
  const { theme } = useTheme()
  const styles = useMemo(() => createStyles(theme), [theme])
  const dark = isDarkTheme(theme)

  return (
    <View style={styles.wrap}>
      <View style={styles.iconWrap}>
        <MaterialCommunityIcons
          name="alert-circle-outline"
          size={16}
          color={dark ? '#FCD34D' : '#b45309'}
        />
      </View>
      <View style={styles.content}>
        <Text style={styles.title}>Medical disclaimer</Text>
        <Text style={styles.text}>
          This analysis is AI-generated and not a medical diagnosis. Please consult a qualified doctor.
        </Text>
      </View>
    </View>
  )
}

function createStyles(theme) {
  const dark = isDarkTheme(theme)
  return StyleSheet.create({
    wrap: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      borderWidth: dark ? 0 : 1,
      borderColor: dark ? 'transparent' : '#fde68a',
      backgroundColor: dark ? 'rgba(245, 158, 11, 0.08)' : '#fffbeb',
      borderRadius: theme.radius.md,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    iconWrap: {
      width: 28,
      height: 28,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: dark ? 'rgba(251, 191, 36, 0.12)' : 'rgba(245, 158, 11, 0.15)',
      marginTop: 1,
    },
    content: {
      flex: 1,
      gap: 3,
    },
    title: {
      color: dark ? '#FCD34D' : '#92400e',
      ...typography.style.semiBold,
      fontSize: 12,
      letterSpacing: 0.2,
    },
    text: {
      color: dark ? 'rgba(252, 211, 77, 0.85)' : '#78350f',
      fontSize: 12,
      lineHeight: 17,
      ...typography.style.regular,
    },
  })
}
