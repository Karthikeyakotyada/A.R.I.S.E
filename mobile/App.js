import { useEffect } from 'react'
import { StatusBar } from 'expo-status-bar'
import { NavigationContainer, DefaultTheme } from '@react-navigation/native'
import { LogBox, Platform, Text, TextInput } from 'react-native'
import * as SplashScreen from 'expo-splash-screen'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { AuthProvider } from './src/context/AuthContext'
import { DialogProvider } from './src/context/DialogContext'
import { ToastProvider } from './src/context/ToastContext'
import RootNavigator from './src/navigation/RootNavigator'
import AppErrorBoundary from './src/components/AppErrorBoundary'
import { theme } from './src/lib/theme'
import { typography } from './src/lib/typography'
import { logEnvDiagnostics } from './src/lib/env'

logEnvDiagnostics()
SplashScreen.preventAutoHideAsync().catch(() => {})

Text.defaultProps = {
  ...(Text.defaultProps || {}),
  style: [typography.style.regular, Text.defaultProps?.style],
}

TextInput.defaultProps = {
  ...(TextInput.defaultProps || {}),
  style: [typography.style.regular, TextInput.defaultProps?.style],
}

const defaultGlobalErrorHandler = global.ErrorUtils?.getGlobalHandler?.()

LogBox.ignoreLogs([
  'AuthApiError: Invalid Refresh Token: Refresh Token Not Found',
])

if (global.ErrorUtils?.setGlobalHandler) {
  global.ErrorUtils.setGlobalHandler((error, isFatal) => {
    console.error('[ARISE] Global JS error', { isFatal, message: error?.message, stack: error?.stack })
    if (typeof defaultGlobalErrorHandler === 'function') {
      defaultGlobalErrorHandler(error, isFatal)
    }
  })
}

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: theme.colors.primary,
    background: theme.colors.bg,
    card: theme.colors.surface,
    text: theme.colors.text,
    border: theme.colors.border,
  },
}

export default function App() {
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {})
  }, [])

  return (
    <AppErrorBoundary>
      <SafeAreaProvider>
        <ToastProvider>
          <DialogProvider>
            <AuthProvider>
              <NavigationContainer
                theme={navTheme}
                onUnhandledAction={(action) => {
                  console.error('[ARISE] Navigation unhandled action:', action)
                }}
                onStateChange={(state) => {
                  const routeName = state?.routes?.[state.index || 0]?.name || 'unknown'
                  console.log('[ARISE] Navigation route:', routeName)
                }}
              >
                <StatusBar style="dark" />
                <RootNavigator />
              </NavigationContainer>
            </AuthProvider>
          </DialogProvider>
        </ToastProvider>
      </SafeAreaProvider>
    </AppErrorBoundary>
  )
}
