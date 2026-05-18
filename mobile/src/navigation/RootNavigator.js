import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { typography } from '../lib/typography'
import FloatingTabBar from './FloatingTabBar'
import LoginScreen from '../screens/LoginScreen'
import SignupScreen from '../screens/SignupScreen'
import DashboardScreen from '../screens/DashboardScreen'
import UploadReportScreen from '../screens/UploadReportScreen'
import ReportsScreen from '../screens/ReportsScreen'
import ReportViewerScreen from '../screens/ReportViewerScreen'
import AnalysisHistoryScreen from '../screens/AnalysisHistoryScreen'
import HealthLogsScreen from '../screens/HealthLogsScreen'
import ProfileScreen from '../screens/ProfileScreen'
import EditProfileScreen from '../screens/EditProfileScreen'
import AuthCallbackScreen from '../screens/AuthCallbackScreen'

const Stack = createNativeStackNavigator()
const Tab = createBottomTabNavigator()

function tabIcon(name, color, focused) {
  return <Ionicons name={name} size={focused ? 23 : 22} color={color} />
}

function AppTabs() {
  const { theme } = useTheme()

  return (
    <Tab.Navigator
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        sceneContainerStyle: {
          backgroundColor: theme.colors.background,
        },
      }}
    >
      <Tab.Screen
        name="DashboardTab"
        component={DashboardScreen}
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color, focused }) => tabIcon(focused ? 'grid' : 'grid-outline', color, focused),
        }}
      />
      <Tab.Screen
        name="UploadTab"
        component={UploadReportScreen}
        options={{
          title: 'Upload',
          tabBarIcon: ({ color, focused }) =>
            tabIcon(focused ? 'cloud-upload' : 'cloud-upload-outline', color, focused),
        }}
      />
      <Tab.Screen
        name="ReportsTab"
        component={ReportsScreen}
        options={{
          title: 'Reports',
          tabBarIcon: ({ color, focused }) =>
            tabIcon(focused ? 'document-text' : 'document-text-outline', color, focused),
        }}
      />
      <Tab.Screen
        name="HealthTab"
        component={HealthLogsScreen}
        options={{
          title: 'Health',
          tabBarIcon: ({ color, focused }) => tabIcon(focused ? 'pulse' : 'pulse-outline', color, focused),
        }}
      />
      <Tab.Screen
        name="ProfileTab"
        component={ProfileScreen}
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, focused }) =>
            tabIcon(focused ? 'person-circle' : 'person-circle-outline', color, focused),
        }}
      />
    </Tab.Navigator>
  )
}

function AuthStack() {
  const { theme } = useTheme()
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.surface },
        headerShadowVisible: false,
        headerTitleStyle: { ...typography.style.extraBold, color: theme.colors.text },
      }}
    >
      <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Signup" component={SignupScreen} options={{ headerShown: false }} />
    </Stack.Navigator>
  )
}

function LoadingSplash() {
  const { theme } = useTheme()
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.background,
      }}
    >
      <ActivityIndicator size="large" color={theme.colors.primary} />
      <Text style={{ marginTop: 10, color: theme.colors.muted, ...typography.style.semiBold }}>
        Loading ARISE...
      </Text>
    </View>
  )
}

export default function RootNavigator() {
  const { user, loading } = useAuth()
  const { theme } = useTheme()

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const { pathname } = window.location
    if (pathname === '/auth/callback') {
      return <AuthCallbackScreen />
    }
  }

  if (loading) {
    return <LoadingSplash />
  }

  if (!user) {
    return <AuthStack />
  }

  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.surface },
        headerShadowVisible: false,
        headerTitleStyle: { ...typography.style.extraBold, color: theme.colors.text },
      }}
    >
      <Stack.Screen name="Home" component={AppTabs} options={{ headerShown: false }} />
      <Stack.Screen name="ReportViewer" component={ReportViewerScreen} options={{ title: 'Report Viewer' }} />
      <Stack.Screen name="AnalysisHistory" component={AnalysisHistoryScreen} options={{ title: 'Analysis History' }} />
      <Stack.Screen name="HealthLogs" component={HealthLogsScreen} options={{ title: 'Health Logs' }} />
      <Stack.Screen name="EditProfile" component={EditProfileScreen} options={{ title: 'Edit Profile' }} />
    </Stack.Navigator>
  )
}
