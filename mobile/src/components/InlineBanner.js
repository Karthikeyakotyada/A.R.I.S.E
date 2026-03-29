import { useEffect, useRef } from 'react'
import { Animated, Platform, StyleSheet, Text, View } from 'react-native'

const USE_NATIVE_DRIVER = Platform.OS !== 'web'

export default function InlineBanner({ message, tone = 'info' }) {
  const opacity = useRef(new Animated.Value(0)).current
  const translateY = useRef(new Animated.Value(-6)).current

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 220,
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 220,
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
    ]).start()
  }, [opacity, translateY])

  const toneStyles =
    tone === 'success'
      ? styles.success
      : tone === 'error'
        ? styles.error
        : tone === 'warning'
          ? styles.warning
          : styles.info

  return (
    <Animated.View style={[styles.wrap, toneStyles, { opacity, transform: [{ translateY }] }]}>
      <Text style={styles.text}>{message}</Text>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  text: {
    fontSize: 13,
    fontWeight: '700',
  },
  info: {
    backgroundColor: '#eff6ff',
    borderColor: '#bfdbfe',
  },
  warning: {
    backgroundColor: '#fff7ed',
    borderColor: '#fdba74',
  },
  success: {
    backgroundColor: '#f0fdf4',
    borderColor: '#86efac',
  },
  error: {
    backgroundColor: '#fef2f2',
    borderColor: '#fca5a5',
  },
})
