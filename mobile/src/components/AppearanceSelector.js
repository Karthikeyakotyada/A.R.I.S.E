import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { APPEARANCE_OPTIONS, useTheme } from '../context/ThemeContext'
import { typography } from '../lib/typography'
import { isDarkTheme } from '../lib/themeUi'

export default function AppearanceSelector() {
  const { preference, setPreference, theme } = useTheme()
  const styles = createStyles(theme)

  return (
    <View style={styles.wrap}>
      {APPEARANCE_OPTIONS.map((option) => {
        const active = preference === option.id
        return (
          <Pressable
            key={option.id}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => setPreference(option.id)}
            style={({ pressed }) => [
              styles.option,
              active && styles.optionActive,
              pressed && styles.optionPressed,
            ]}
          >
            <View style={[styles.iconWrap, active && styles.iconWrapActive]}>
              <Ionicons
                name={option.icon}
                size={20}
                color={active ? theme.colors.primary : theme.colors.muted}
              />
            </View>
            <Text style={[styles.optionLabel, active && styles.optionLabelActive]}>{option.label}</Text>
            {active ? (
              <Ionicons name="checkmark-circle" size={18} color={theme.colors.primary} style={styles.check} />
            ) : null}
          </Pressable>
        )
      })}
    </View>
  )
}

function createStyles(theme) {
  const dark = isDarkTheme(theme)
  return StyleSheet.create({
    wrap: {
      gap: 8,
    },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderRadius: dark ? 18 : 14,
      borderWidth: dark ? 0 : 1,
      borderColor: theme.colors.appearanceOptionBorder,
      backgroundColor: theme.colors.appearanceOptionBg,
    },
    optionActive: {
      borderColor: theme.colors.appearanceOptionActiveBorder,
      backgroundColor: theme.colors.appearanceOptionActiveBg,
    },
    optionPressed: {
      opacity: 0.88,
    },
    iconWrap: {
      width: 36,
      height: 36,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.elevated,
      borderWidth: dark ? 0 : 1,
      borderColor: theme.colors.borderLight,
    },
    iconWrapActive: {
      borderColor: theme.colors.appearanceOptionActiveBorder,
    },
    optionLabel: {
      flex: 1,
      ...typography.style.semiBold,
      fontSize: 15,
      color: theme.colors.text,
    },
    optionLabelActive: {
      color: theme.colors.primary,
    },
    check: {
      marginLeft: 'auto',
    },
  })
}
