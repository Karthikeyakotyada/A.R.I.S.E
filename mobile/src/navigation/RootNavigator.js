import { ActivityIndicator, Text, View } from 'react-native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '../context/AuthContext'
import { theme } from '../lib/theme'
import LoginScreen from '../screens/LoginScreen'
import SignupScreen from '../screens/SignupScreen'
import DashboardScreen from '../screens/DashboardScreen'
import UploadReportScreen from '../screens/UploadReportScreen'
import ReportsScreen from '../screens/ReportsScreen'
import ReportViewerScreen from '../screens/ReportViewerScreen'
import AnalysisHistoryScreen from '../screens/AnalysisHistoryScreen'
import HealthScreen from '../screens/HealthScreen'
import HealthLogsScreen from '../screens/HealthLogsScreen'
import ProfileScreen from '../screens/ProfileScreen'

const Stack = createNativeStackNavigator()
const Tab = createBottomTabNavigator()

function tabIcon(name, color) {
  return <Ionicons name={name} size={19} color={color} />
}

function AppTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: '#64748b',
        tabBarLabelStyle: { fontSize: 12, fontWeight: '700' },
        tabBarStyle: {
          height: 64,
          paddingTop: 6,
          paddingBottom: 8,
          backgroundColor: '#ffffff',
          borderTopColor: '#dbe4ef',
          borderTopWidth: 1,
        },
      }}
    >
      <Tab.Screen
        name="DashboardTab"
        component={DashboardScreen}
        options={{ title: 'Dashboard', tabBarIcon: ({ color, focused }) => tabIcon(focused ? 'grid' : 'grid-outline', color) }}
      />
      <Tab.Screen
        name="UploadTab"
        component={UploadReportScreen}
        options={{ title: 'Upload', tabBarIcon: ({ color, focused }) => tabIcon(focused ? 'cloud-upload' : 'cloud-upload-outline', color) }}
      />
      <Tab.Screen
        name="ReportsTab"
        component={ReportsScreen}
        options={{ title: 'Reports', tabBarIcon: ({ color, focused }) => tabIcon(focused ? 'document-text' : 'document-text-outline', color) }}
      />
      <Tab.Screen
        name="HealthTab"
        component={HealthScreen}
        options={{ title: 'Health', tabBarIcon: ({ color, focused }) => tabIcon(focused ? 'pulse' : 'pulse-outline', color) }}
      />
      <Tab.Screen
        name="ProfileTab"
        component={ProfileScreen}
        options={{ title: 'Profile', tabBarIcon: ({ color, focused }) => tabIcon(focused ? 'person-circle' : 'person-circle-outline', color) }}
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
        headerTitleStyle: { fontWeight: '800', color: '#0f172a' },
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
      <Text style={{ marginTop: 10, color: '#64748b', fontWeight: '600' }}>Loading ARISE...</Text>
    </View>
  )
}

export default function RootNavigator() {
  const { user, loading } = useAuth()

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
        headerTitleStyle: { fontWeight: '800', color: '#0f172a' },
      }}
    >
      <Stack.Screen name="Home" component={AppTabs} options={{ headerShown: false }} />
      <Stack.Screen name="ReportViewer" component={ReportViewerScreen} options={{ title: 'Report Viewer' }} />
      <Stack.Screen name="AnalysisHistory" component={AnalysisHistoryScreen} options={{ title: 'Analysis History' }} />
      <Stack.Screen name="HealthLogs" component={HealthLogsScreen} options={{ title: 'Health Logs' }} />
    </Stack.Navigator>
  )
}
