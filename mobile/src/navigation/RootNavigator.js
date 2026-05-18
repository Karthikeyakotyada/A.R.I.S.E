import { ActivityIndicator, Platform, Text, View } from 'react-native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '../context/AuthContext'
import { theme } from '../lib/theme'
import { typography } from '../lib/typography'
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

const TAB_ACTIVE = theme.colors.primary
const TAB_INACTIVE = '#9aacb5'
const FLOATING_TAB_HEIGHT = 62
const FLOATING_TAB_RADIUS = 30
const FLOATING_TAB_MARGIN_H = 16

const FLOATING_TAB_SHADOW =
  Platform.OS === 'web'
    ? { boxShadow: '0px 10px 28px rgba(15, 23, 42, 0.1), 0px 2px 8px rgba(15, 23, 42, 0.05)' }
    : Platform.OS === 'ios'
      ? {
          shadowColor: '#0f172a',
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.1,
          shadowRadius: 18,
        }
      : { elevation: 10 }

function FloatingTabBarBackground() {
  return (
    <View
      style={{
        flex: 1,
        borderRadius: FLOATING_TAB_RADIUS,
        backgroundColor: theme.colors.surface,
        borderWidth: 1,
        borderColor: 'rgba(214, 228, 225, 0.75)',
        overflow: 'hidden',
      }}
    />
  )
}

function tabIcon(name, color, focused) {
  return <Ionicons name={name} size={focused ? 22 : 21} color={color} />
}

function AppTabs() {
  const insets = useSafeAreaInsets()
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'web' ? 12 : 8)
  const tabBarBottom = bottomInset + 6
  const sceneBottomPad = tabBarBottom + FLOATING_TAB_HEIGHT + 14

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: TAB_ACTIVE,
        tabBarInactiveTintColor: TAB_INACTIVE,
        tabBarShowLabel: true,
        tabBarLabelStyle: {
          ...typography.style.semiBold,
          fontSize: 11,
          marginTop: 2,
          marginBottom: Platform.OS === 'ios' ? 0 : 2,
        },
        tabBarIconStyle: {
          marginTop: 4,
        },
        tabBarItemStyle: {
          paddingVertical: 4,
        },
        tabBarBackground: FloatingTabBarBackground,
        tabBarStyle: {
          position: 'absolute',
          left: FLOATING_TAB_MARGIN_H,
          right: FLOATING_TAB_MARGIN_H,
          bottom: tabBarBottom,
          height: FLOATING_TAB_HEIGHT,
          borderRadius: FLOATING_TAB_RADIUS,
          backgroundColor: 'transparent',
          borderTopWidth: 0,
          paddingTop: 6,
          paddingBottom: Platform.OS === 'ios' ? 8 : 6,
          ...FLOATING_TAB_SHADOW,
        },
        sceneContainerStyle: {
          backgroundColor: theme.colors.bg,
          paddingBottom: sceneBottomPad,
        },
      }}
    >
      <Tab.Screen
        name="DashboardTab"
        component={DashboardScreen}
        options={{ title: 'Dashboard', tabBarIcon: ({ color, focused }) => tabIcon(focused ? 'grid' : 'grid-outline', color, focused) }}
      />
      <Tab.Screen
        name="UploadTab"
        component={UploadReportScreen}
        options={{ title: 'Upload', tabBarIcon: ({ color, focused }) => tabIcon(focused ? 'cloud-upload' : 'cloud-upload-outline', color, focused) }}
      />
      <Tab.Screen
        name="ReportsTab"
        component={ReportsScreen}
        options={{ title: 'Reports', tabBarIcon: ({ color, focused }) => tabIcon(focused ? 'document-text' : 'document-text-outline', color, focused) }}
      />
      <Tab.Screen
        name="HealthTab"
        component={HealthLogsScreen}
        options={{ title: 'Health', tabBarIcon: ({ color, focused }) => tabIcon(focused ? 'pulse' : 'pulse-outline', color, focused) }}
      />
      <Tab.Screen
        name="ProfileTab"
        component={ProfileScreen}
        options={{ title: 'Profile', tabBarIcon: ({ color, focused }) => tabIcon(focused ? 'person-circle' : 'person-circle-outline', color, focused) }}
      />
    </Tab.Navigator>
  )
}

function AuthStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: '#ffffff' },
        headerShadowVisible: false,
        headerTitleStyle: { ...typography.style.extraBold, color: '#0f172a' },
      }}
    >
      <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Signup" component={SignupScreen} options={{ headerShown: false }} />
    </Stack.Navigator>
  )
}

function LoadingSplash() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.bg }}>
      <ActivityIndicator size="large" color={theme.colors.primary} />
      <Text style={{ marginTop: 10, color: '#64748b', ...typography.style.semiBold }}>Loading ARISE...</Text>
    </View>
  )
}

export default function RootNavigator() {
  const { user, loading } = useAuth()

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
        headerStyle: { backgroundColor: '#ffffff' },
        headerShadowVisible: false,
        headerTitleStyle: { ...typography.style.extraBold, color: '#0f172a' },
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
