import { useEffect, useMemo } from 'react'
import { StatusBar } from 'expo-status-bar'
import { DarkTheme, DefaultTheme, NavigationContainer } from '@react-navigation/native'
import { LogBox, Text, TextInput } from 'react-native'
import * as SplashScreen from 'expo-splash-screen'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { AuthProvider } from './src/context/AuthContext'
import { DialogProvider } from './src/context/DialogContext'
import { ThemeProvider, useTheme } from './src/context/ThemeContext'
import { ToastProvider } from './src/context/ToastContext'
import RootNavigator from './src/navigation/RootNavigator'
import AppErrorBoundary from './src/components/AppErrorBoundary'
import { buildNavigationTheme } from './src/lib/theme'
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

function AppNavigation() {
  const { theme, isDark, isReady } = useTheme()

  const navTheme = useMemo(() => {
    const base = isDark ? DarkTheme : DefaultTheme
    const app = buildNavigationTheme(theme)
    return {
      ...base,
      colors: {
        ...base.colors,
        ...app.colors,
      },
    }
  }, [theme, isDark])

  useEffect(() => {
    if (isReady) {
      SplashScreen.hideAsync().catch(() => {})
    }
  }, [isReady])

  if (!isReady) {
    return null
  }

  return (
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
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <RootNavigator />
    </NavigationContainer>
  )
}

export default function App() {
  return (
    <AppErrorBoundary>
      <SafeAreaProvider>
        <ThemeProvider>
          <ToastProvider>
            <DialogProvider>
              <AuthProvider>
                <AppNavigation />
              </AuthProvider>
            </DialogProvider>
          </ToastProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </AppErrorBoundary>
  )
}
