import { StatusBar } from 'expo-status-bar'
import { NavigationContainer, DefaultTheme } from '@react-navigation/native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { AuthProvider } from './src/context/AuthContext'
import { DialogProvider } from './src/context/DialogContext'
import { ToastProvider } from './src/context/ToastContext'
import RootNavigator from './src/navigation/RootNavigator'
import { theme } from './src/lib/theme'

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
  return (
    <SafeAreaProvider>
      <ToastProvider>
        <DialogProvider>
          <AuthProvider>
            <NavigationContainer theme={navTheme}>
              <StatusBar style="dark" />
              <RootNavigator />
            </NavigationContainer>
          </AuthProvider>
        </DialogProvider>
      </ToastProvider>
    </SafeAreaProvider>
  )
}
