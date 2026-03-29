import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { Animated, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native'

const USE_NATIVE_DRIVER = Platform.OS !== 'web'

const DialogContext = createContext({
  showMessage: async () => {},
  showConfirm: async () => false,
})

export function DialogProvider({ children }) {
  const [dialog, setDialog] = useState(null)
  const opacity = useRef(new Animated.Value(0)).current
  const scale = useRef(new Animated.Value(0.96)).current
  const resolverRef = useRef(null)

  const openDialog = useCallback((payload) => {
    setDialog(payload)
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 180,
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
      Animated.timing(scale, {
        toValue: 1,
        duration: 180,
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
    ]).start()
  }, [opacity, scale])

  const closeDialog = useCallback(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 0,
        duration: 150,
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
      Animated.timing(scale, {
        toValue: 0.96,
        duration: 150,
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
    ]).start(() => setDialog(null))
  }, [opacity, scale])

  const showMessage = useCallback(({ title, message, tone = 'info', buttonLabel = 'OK' }) => {
    return new Promise((resolve) => {
      resolverRef.current = resolve
      openDialog({
        type: 'message',
        title,
        message,
        tone,
        buttonLabel,
      })
    })
  }, [openDialog])

  const showConfirm = useCallback(({ title, message, tone = 'warning', confirmLabel = 'Confirm', cancelLabel = 'Cancel' }) => {
    return new Promise((resolve) => {
      resolverRef.current = resolve
      openDialog({
        type: 'confirm',
        title,
        message,
        tone,
        confirmLabel,
        cancelLabel,
      })
    })
  }, [openDialog])

  const resolveAndClose = useCallback((result) => {
    if (resolverRef.current) {
      resolverRef.current(result)
      resolverRef.current = null
    }
    closeDialog()
  }, [closeDialog])

  const value = useMemo(() => ({ showMessage, showConfirm }), [showConfirm, showMessage])

  const toneStyle =
    dialog?.tone === 'success'
      ? styles.success
      : dialog?.tone === 'error'
        ? styles.error
        : dialog?.tone === 'warning'
          ? styles.warning
          : styles.info

  return (
    <DialogContext.Provider value={value}>
      {children}
      <Modal transparent visible={!!dialog} animationType="none" onRequestClose={() => resolveAndClose(false)}>
        <View style={styles.backdropHost}>
          <Pressable style={styles.backdrop} onPress={() => resolveAndClose(false)} />
          <Animated.View style={[styles.card, toneStyle, { opacity, transform: [{ scale }] }]}>
            <Text style={styles.title}>{dialog?.title}</Text>
            <Text style={styles.message}>{dialog?.message}</Text>

            {dialog?.type === 'confirm' ? (
              <View style={styles.row}>
                <Pressable style={styles.secondaryBtn} onPress={() => resolveAndClose(false)}>
                  <Text style={styles.secondaryText}>{dialog?.cancelLabel || 'Cancel'}</Text>
                </Pressable>
                <Pressable style={styles.primaryBtn} onPress={() => resolveAndClose(true)}>
                  <Text style={styles.primaryText}>{dialog?.confirmLabel || 'Confirm'}</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable style={styles.primaryBtn} onPress={() => resolveAndClose(true)}>
                <Text style={styles.primaryText}>{dialog?.buttonLabel || 'OK'}</Text>
              </Pressable>
            )}
          </Animated.View>
        </View>
      </Modal>
    </DialogContext.Provider>
  )
}

export function useDialog() {
  const context = useContext(DialogContext)
  if (!context) {
    throw new Error('useDialog must be used within DialogProvider')
  }
  return context
}

const styles = StyleSheet.create({
  backdropHost: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 18,
  },
  backdrop: {
    position: 'absolute',
    inset: 0,
    backgroundColor: 'rgba(2,6,23,0.35)',
  },
  card: {
    width: '100%',
    borderRadius: 16,
    borderWidth: 1,
    backgroundColor: '#fff',
    padding: 16,
    gap: 12,
  },
  info: { borderColor: '#bfdbfe' },
  warning: { borderColor: '#fdba74' },
  success: { borderColor: '#86efac' },
  error: { borderColor: '#fca5a5' },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
  },
  message: {
    color: '#334155',
    fontSize: 14,
    lineHeight: 20,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  secondaryBtn: {
    flex: 1,
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryText: {
    color: '#334155',
    fontWeight: '700',
  },
  primaryBtn: {
    flex: 1,
    minHeight: 42,
    borderRadius: 12,
    backgroundColor: '#0f766e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryText: {
    color: '#fff',
    fontWeight: '700',
  },
})
