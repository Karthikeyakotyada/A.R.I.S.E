import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { Animated, Platform, StyleSheet, Text, View } from 'react-native'

const USE_NATIVE_DRIVER = Platform.OS !== 'web'
const TOAST_SHADOW_STYLE =
  Platform.OS === 'web'
    ? { boxShadow: '0px 3px 8px rgba(0,0,0,0.25)' }
    : {}

const ToastContext = createContext({ showToast: () => {} })

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null)
  const opacity = useRef(new Animated.Value(0)).current
  const translateY = useRef(new Animated.Value(-12)).current
  const timerRef = useRef(null)

  const hideToast = useCallback(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 0,
        duration: 180,
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
      Animated.timing(translateY, {
        toValue: -12,
        duration: 180,
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
    ]).start(() => setToast(null))
  }, [opacity, translateY])

  const showToast = useCallback((message, type = 'info') => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }

    setToast({ message, type })
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

    timerRef.current = setTimeout(() => {
      hideToast()
    }, 2200)
  }, [hideToast, opacity, translateY])

  const value = useMemo(() => ({ showToast }), [showToast])

  const bgColor =
    toast?.type === 'success'
      ? '#166534'
      : toast?.type === 'error'
        ? '#b91c1c'
        : toast?.type === 'warning'
          ? '#9a3412'
          : '#1e3a8a'

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast ? (
        <View style={styles.host}>
          <Animated.View style={[styles.toast, { backgroundColor: bgColor, opacity, transform: [{ translateY }] }]}>
            <Text style={styles.text}>{toast.message}</Text>
          </Animated.View>
        </View>
      ) : null}
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within ToastProvider')
  }
  return context
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    pointerEvents: 'none',
    top: 56,
    left: 14,
    right: 14,
    zIndex: 999,
  },
  toast: {
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 11,
    ...TOAST_SHADOW_STYLE,
    elevation: 5,
  },
  text: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
})
