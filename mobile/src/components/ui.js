import { useEffect, useRef } from 'react'
import { ActivityIndicator, Animated, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { theme } from '../lib/theme'

const USE_NATIVE_DRIVER = Platform.OS !== 'web'
const CARD_SHADOW_STYLE =
  Platform.OS === 'web'
    ? { boxShadow: '0px 6px 14px rgba(11,19,32,0.08)' }
    : {}

const PRIMARY_BUTTON_SHADOW_STYLE =
  Platform.OS === 'web'
    ? { boxShadow: '0px 4px 8px rgba(11,47,46,0.18)' }
    : {}

export function Screen({ children, scroll = true, refreshing = false, onRefresh }) {
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
        <Animated.View style={[styles.container, animatedStyle]}>{children}</Animated.View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} /> : undefined}
      >
        <Animated.View style={[styles.container, animatedStyle]}>{children}</Animated.View>
      </ScrollView>
    </SafeAreaView>
  )
}

export function Card({ children, style }) {
  return <View style={[styles.card, style]}>{children}</View>
}

export function Heading({ children }) {
  return <Text style={styles.heading}>{children}</Text>
}

export function Subtle({ children, style }) {
  return <Text style={[styles.subtle, style]}>{children}</Text>
}

export function PrimaryButton({ title, onPress, disabled, loading, style }) {
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
      {loading ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.primaryButtonText}>{title}</Text>}
    </Pressable>
  )
}

export function GhostButton({ title, onPress, disabled }) {
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
  return (
    <View style={styles.inputWrap}>
      {!!label && <Text style={styles.label}>{label}</Text>}
      <TextInput placeholderTextColor="#94a3b8" style={[styles.input, style]} {...props} />
    </View>
  )
}

export function EmptyState({ title, subtitle }) {
  return (
    <View style={styles.emptyWrap}>
      <Text style={styles.emptyIcon}>•</Text>
      <Text style={styles.emptyTitle}>{title}</Text>
      {!!subtitle && <Text style={styles.emptySubtitle}>{subtitle}</Text>}
    </View>
  )
}

export function SkeletonLine({ width = '100%' }) {
  return <View style={[styles.skeletonLine, { width }]} />
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  container: {
    gap: 14,
  },
  scrollContent: {
    padding: 18,
    paddingBottom: 28,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 16,
    gap: 12,
    ...CARD_SHADOW_STYLE,
    elevation: 2,
  },
  heading: {
    fontSize: 22,
    color: theme.colors.text,
    fontWeight: '900',
  },
  subtle: {
    color: theme.colors.muted,
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
    ...PRIMARY_BUTTON_SHADOW_STYLE,
    elevation: 2,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 15,
  },
  ghostButton: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    minHeight: 44,
    borderRadius: theme.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    backgroundColor: '#ffffff',
  },
  ghostButtonText: {
    color: '#233746',
    fontWeight: '700',
    fontSize: 14,
  },
  inputWrap: {
    gap: 6,
  },
  label: {
    color: '#223240',
    fontWeight: '700',
    fontSize: 13,
  },
  input: {
    borderWidth: 1,
    borderColor: '#bed0ce',
    borderRadius: 12,
    minHeight: 48,
    paddingHorizontal: 13,
    color: '#0f172a',
    backgroundColor: '#fbfefe',
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.85,
  },
  emptyWrap: {
    borderWidth: 1,
    borderColor: '#cfe1de',
    borderStyle: 'dashed',
    borderRadius: 14,
    padding: 18,
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f5fbfa',
  },
  emptyIcon: {
    fontSize: 14,
    color: '#7c93a2',
  },
  emptyTitle: {
    color: '#2b3f4d',
    fontSize: 14,
    fontWeight: '700',
  },
  emptySubtitle: {
    color: '#64748b',
    fontSize: 13,
    textAlign: 'center',
  },
  skeletonLine: {
    height: 10,
    borderRadius: 999,
    backgroundColor: '#e2e8f0',
  },
})
