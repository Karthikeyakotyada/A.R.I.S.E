import { useMemo } from 'react'
import { Platform, StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useTheme } from '../context/ThemeContext'
import { typography } from '../lib/typography'
import { getCardShadowStyle, isDarkTheme } from '../lib/themeUi'

const DARK_GRADIENTS = [
  ['#1A3040', '#0B1722'],
  ['#152A3A', '#07111A'],
  ['#1B2E42', '#0A1620'],
]

const LIGHT_GRADIENTS = [
  ['#e6f7f3', '#f4fbfb'],
  ['#e8f4ff', '#f6fbff'],
  ['#eef9f2', '#fafefd'],
]

/**
 * @param {{ item: import('../lib/announcements').AnnouncementItem, index?: number, width: number }} props
 */
export default function AnnouncementBanner({ item, index = 0, width: cardWidth }) {
  const { theme, isDark } = useTheme()
  const styles = useMemo(() => createStyles(theme, isDark), [theme, isDark])
  const gradients = isDark ? DARK_GRADIENTS : LIGHT_GRADIENTS
  const gradientColors = gradients[index % gradients.length]

  return (
    <View style={[styles.shell, { width: cardWidth }]}>
      <View style={styles.card}>
        <LinearGradient
          colors={gradientColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        {isDark ? (
          <LinearGradient
            colors={['rgba(39, 225, 193, 0.14)', 'transparent', 'rgba(24, 182, 255, 0.08)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
        ) : null}
        <View style={styles.glowOrb} pointerEvents="none" />
        <View style={styles.content}>
          <View style={styles.iconWrap}>
            <Text style={styles.icon}>{item.icon}</Text>
          </View>
          <View style={styles.textBlock}>
            <Text style={styles.title} numberOfLines={2}>
              {item.title}
            </Text>
            {item.subtitle ? (
              <Text style={styles.subtitle} numberOfLines={2}>
                {item.subtitle}
              </Text>
            ) : null}
          </View>
        </View>
      </View>
    </View>
  )
}

function createStyles(theme, isDark) {
  const dark = isDarkTheme(theme) || isDark
  return StyleSheet.create({
    shell: {
      ...getCardShadowStyle(theme),
    },
    card: {
      minHeight: 118,
      borderRadius: theme.radius.card,
      overflow: 'hidden',
      borderWidth: dark ? 1 : 1,
      borderColor: dark ? 'rgba(39, 225, 193, 0.22)' : 'rgba(11, 107, 99, 0.15)',
      position: 'relative',
      ...(Platform.OS === 'web' && dark
        ? { boxShadow: '0px 12px 32px rgba(0,0,0,0.45), 0px 0px 24px rgba(39, 225, 193, 0.1)' }
        : {}),
    },
    glowOrb: {
      position: 'absolute',
      width: 100,
      height: 100,
      borderRadius: 50,
      top: -36,
      right: -24,
      backgroundColor: dark ? 'rgba(39, 225, 193, 0.12)' : 'rgba(11, 107, 99, 0.08)',
    },
    content: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      paddingHorizontal: 16,
      paddingVertical: 16,
      zIndex: 1,
    },
    iconWrap: {
      width: 48,
      height: 48,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: dark ? 'rgba(39, 225, 193, 0.12)' : 'rgba(255, 255, 255, 0.85)',
      borderWidth: 1,
      borderColor: dark ? 'rgba(39, 225, 193, 0.28)' : 'rgba(11, 107, 99, 0.12)',
      ...(Platform.OS === 'web' && dark
        ? { boxShadow: '0px 0px 16px rgba(39, 225, 193, 0.25)' }
        : {
            shadowColor: theme.colors.primary,
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.35,
            shadowRadius: 10,
            elevation: 3,
          }),
    },
    icon: {
      fontSize: 24,
    },
    textBlock: {
      flex: 1,
      gap: 6,
      minWidth: 0,
    },
    title: {
      ...typography.style.extraBold,
      fontSize: 17,
      lineHeight: 22,
      color: theme.colors.text,
    },
    subtitle: {
      ...typography.style.medium,
      fontSize: 13,
      lineHeight: 18,
      color: theme.colors.textSecondary,
    },
  })
}
