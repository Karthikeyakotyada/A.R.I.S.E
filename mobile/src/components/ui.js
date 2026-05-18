import { useEffect, useMemo, useRef } from 'react'
import { ActivityIndicator, Animated, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs'
import { useTheme } from '../context/ThemeContext'
import { typography } from '../lib/typography'
import { getScrollBottomPadding } from '../lib/navLayout'
import { getCardShadowStyle, getScreenBackgroundColors, isDarkTheme } from '../lib/themeUi'

const USE_NATIVE_DRIVER = Platform.OS !== 'web'

function primaryButtonShadow(theme) {
  const dark = isDarkTheme(theme)
  return Platform.OS === 'web'
    ? {
        boxShadow: dark
          ? '0px 4px 16px rgba(39, 225, 193, 0.18), 0px 2px 8px rgba(0, 0, 0, 0.35)'
          : '0px 4px 8px rgba(11, 47, 46, 0.18)',
      }
    : {}
}

function createStyles(theme) {
  const dark = isDarkTheme(theme)
  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    screenGradient: {
      ...StyleSheet.absoluteFillObject,
    },
    container: {
      gap: 14,
    },
    scrollContent: {
      padding: 18,
    },
    card: {
      backgroundColor: theme.colors.card,
      borderRadius: theme.radius.card,
      borderWidth: theme.ui.cardBorderWidth,
      borderColor: theme.colors.border,
      padding: 16,
      gap: 12,
      ...getCardShadowStyle(theme),
    },
    heading: {
      ...typography.style.bold,
      fontSize: 22,
      color: theme.colors.text,
    },
    subtle: {
      ...typography.style.regular,
      color: theme.colors.textSecondary,
      fontSize: 14,
      lineHeight: 20,
    },
    primaryButton: {
      backgroundColor: theme.colors.primary,
      minHeight: 50,
      borderRadius: theme.radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 16,
      ...primaryButtonShadow(theme),
      ...(dark ? { elevation: 4 } : { elevation: 2 }),
    },
    primaryButtonText: {
      ...typography.style.semiBold,
      color: theme.colors.onPrimary,
      fontSize: 15,
    },
    ghostButton: {
      borderWidth: theme.ui.cardBorderWidth || 1,
      borderColor: theme.colors.border,
      minHeight: 44,
      borderRadius: theme.radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 14,
      backgroundColor: theme.colors.ghostBg,
    },
    ghostButtonText: {
      color: theme.colors.ghostText,
      ...typography.style.bold,
      fontSize: 14,
    },
    inputWrap: {
      gap: 6,
    },
    label: {
      color: theme.colors.text,
      ...typography.style.bold,
      fontSize: 13,
    },
    input: {
      borderWidth: 1,
      borderColor: theme.colors.inputBorder,
      borderRadius: 12,
      minHeight: 48,
      paddingHorizontal: 13,
      color: theme.colors.inputText,
      backgroundColor: theme.colors.inputBg,
    },
    disabled: {
      opacity: 0.5,
    },
    pressed: {
      opacity: 0.85,
    },
    emptyWrap: {
      borderWidth: theme.ui.cardBorderWidth || 1,
      borderColor: theme.colors.emptyBorder,
      borderStyle: 'dashed',
      borderRadius: 14,
      padding: 18,
      alignItems: 'center',
      gap: 6,
      backgroundColor: theme.colors.emptyBg,
    },
    emptyIcon: {
      fontSize: 14,
      color: theme.colors.muted,
    },
    emptyTitle: {
      color: theme.colors.text,
      fontSize: 14,
      ...typography.style.bold,
    },
    emptySubtitle: {
      color: theme.colors.muted,
      fontSize: 13,
      textAlign: 'center',
    },
    skeletonLine: {
      height: 10,
      borderRadius: 999,
      backgroundColor: theme.colors.skeleton,
    },
  })
}

function ScreenBackdrop({ theme }) {
  if (!theme.ui.screenGradient) return null
  const colors = getScreenBackgroundColors(theme)
  return (
    <LinearGradient
      colors={colors}
      locations={[0, 0.45, 1]}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    />
  )
}

export function Screen({ children, scroll = true, refreshing = false, onRefresh, contentBottomPadding }) {
  const { theme } = useTheme()
  const styles = useMemo(() => createStyles(theme), [theme])
  const insets = useSafeAreaInsets()
  const tabBarHeight = useBottomTabBarHeight()
  const scrollBottomPadding =
    contentBottomPadding ?? getScrollBottomPadding(insets, tabBarHeight)
  const scrollContentStyle = useMemo(
    () => [styles.scrollContent, { paddingBottom: scrollBottomPadding }],
    [styles.scrollContent, scrollBottomPadding]
  )
  const opacity = useRef(new Animated.Value(0)).current
  const translateY = useRef(new Animated.Value(8)).current

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 260,
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 260,
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
    ]).start()
  }, [opacity, translateY])

  const animatedStyle = {
    opacity,
    transform: [{ translateY }],
  }

  if (!scroll) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScreenBackdrop theme={theme} />
        <Animated.View style={[styles.container, animatedStyle]}>{children}</Animated.View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenBackdrop theme={theme} />
      <ScrollView
        contentContainerStyle={scrollContentStyle}
        showsVerticalScrollIndicator
        keyboardShouldPersistTaps="handled"
        refreshControl={
          onRefresh ? (
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />
          ) : undefined
        }
      >
        <Animated.View style={[styles.container, animatedStyle]}>{children}</Animated.View>
      </ScrollView>
    </SafeAreaView>
  )
}

export function Card({ children, style }) {
  const { theme } = useTheme()
  const styles = useMemo(() => createStyles(theme), [theme])
  return <View style={[styles.card, style]}>{children}</View>
}

export function Heading({ children }) {
  const { theme } = useTheme()
  const styles = useMemo(() => createStyles(theme), [theme])
  return <Text style={styles.heading}>{children}</Text>
}

export function Subtle({ children, style }) {
  const { theme } = useTheme()
  const styles = useMemo(() => createStyles(theme), [theme])
  return <Text style={[styles.subtle, style]}>{children}</Text>
}

export function PrimaryButton({ title, onPress, disabled, loading, style }) {
  const { theme } = useTheme()
  const styles = useMemo(() => createStyles(theme), [theme])
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.primaryButton,
        (disabled || loading) && styles.disabled,
        pressed && !(disabled || loading) && styles.pressed,
        pressed && !(disabled || loading) && { transform: [{ scale: 0.985 }] },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={theme.colors.onPrimary} />
      ) : (
        <Text style={styles.primaryButtonText}>{title}</Text>
      )}
    </Pressable>
  )
}

export function GhostButton({ title, onPress, disabled }) {
  const { theme } = useTheme()
  const styles = useMemo(() => createStyles(theme), [theme])
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.ghostButton,
        pressed && !disabled && { transform: [{ scale: 0.99 }], opacity: 0.9 },
      ]}
    >
      <Text style={styles.ghostButtonText}>{title}</Text>
    </Pressable>
  )
}

export function InputField({ label, style, ...props }) {
  const { theme } = useTheme()
  const styles = useMemo(() => createStyles(theme), [theme])
  return (
    <View style={styles.inputWrap}>
      {!!label && <Text style={styles.label}>{label}</Text>}
      <TextInput
        placeholderTextColor={theme.colors.muted}
        style={[styles.input, style]}
        {...props}
      />
    </View>
  )
}

export function EmptyState({ title, subtitle }) {
  const { theme } = useTheme()
  const styles = useMemo(() => createStyles(theme), [theme])
  return (
    <View style={styles.emptyWrap}>
      <Text style={styles.emptyIcon}>•</Text>
      <Text style={styles.emptyTitle}>{title}</Text>
      {!!subtitle && <Text style={styles.emptySubtitle}>{subtitle}</Text>}
    </View>
  )
}

export function SkeletonLine({ width = '100%' }) {
  const { theme } = useTheme()
  const styles = useMemo(() => createStyles(theme), [theme])
  return <View style={[styles.skeletonLine, { width }]} />
}
