import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { BlurView } from 'expo-blur'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { typography } from '../lib/typography'
import { getFloatingTabShadow } from '../lib/themeUi'
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

const FLOATING_TAB_HEIGHT = 64
const FLOATING_TAB_MARGIN_H = 18

function FloatingTabBarBackground() {
  const { theme, isDark } = useTheme()
  const radius = theme.radius.tab

  if (isDark && Platform.OS !== 'web') {
    return (
      <View style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }]}>
        <BlurView
          intensity={Platform.OS === 'ios' ? 48 : 72}
          tint="dark"
          style={StyleSheet.absoluteFill}
        />
        <LinearGradient
          colors={['rgba(22, 35, 45, 0.55)', 'rgba(11, 23, 34, 0.88)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View
          style={{
            ...StyleSheet.absoluteFillObject,
            borderRadius: radius,
            borderWidth: 1,
            borderColor: theme.colors.tabBarBorder,
          }}
        />
      </View>
    )
  }

  return (
    <View
      style={{
        flex: 1,
        borderRadius: radius,
        backgroundColor: isDark ? theme.colors.tabBarBg : theme.colors.surface,
        borderWidth: isDark ? 1 : 1,
        borderColor: theme.colors.tabBarBorder,
        overflow: 'hidden',
      }}
    >
      {isDark ? (
        <LinearGradient
          colors={['rgba(22, 35, 45, 0.92)', 'rgba(11, 23, 34, 0.96)']}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
    </View>
  )
}

function tabIcon(name, color, focused) {
  return <Ionicons name={name} size={focused ? 22 : 21} color={color} />
}

function AppTabs() {
  const insets = useSafeAreaInsets()
  const { theme, isDark } = useTheme()
  const tabRadius = theme.radius.tab
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'web' ? 12 : 8)
  const tabBarBottom = bottomInset + 8

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.tabInactive,
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
          borderRadius: tabRadius,
          backgroundColor: 'transparent',
          borderTopWidth: 0,
          paddingTop: 6,
          paddingBottom: Platform.OS === 'ios' ? 8 : 6,
          ...getFloatingTabShadow(theme),
        },
        sceneContainerStyle: {
          backgroundColor: theme.colors.background,
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
