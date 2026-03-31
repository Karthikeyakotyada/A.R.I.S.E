import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Animated,
  StyleSheet,
  StatusBar,
  Text,
  View,
  ScrollView,
  SafeAreaView,
  Pressable,
  RefreshControl,
  Dimensions,
  Image,
  ImageBackground,
  Platform,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { Card, EmptyState, Heading, Screen, Subtle } from '../components/ui'
import { formatDate } from '../lib/helpers'
import PageHeader from '../components/PageHeader'
import StatCard from '../components/StatCard'
import AnimatedListItem from '../components/AnimatedListItem'

const { width } = Dimensions.get('window')
const PREMIUM_CARD_SHADOW =
  Platform.OS === 'web'
    ? { boxShadow: '0px 6px 18px rgba(15,23,42,0.08)' }
    : {}

const INTERACTIVE_CARD_SHADOW =
  Platform.OS === 'web'
    ? { boxShadow: '0px 8px 22px rgba(15,23,42,0.09)' }
    : {}

const METRIC_ACTIVE_SHADOW_STYLE =
  Platform.OS === 'web'
    ? { boxShadow: '0px 10px 24px rgba(15,23,42,0.14)' }
    : {}

const SOFT_BORDER_COLOR = '#e2e8f0'
const HEALTH_SEVERITY_COLORS = {
  normal: '#16a34a',
  warning: '#f59e0b',
  critical: '#dc2626',
}

export default function DashboardScreen({ navigation }) {
  const { user } = useAuth()
  const [reportCount, setReportCount] = useState(0)
  const [recentLogs, setRecentLogs] = useState([])
  const [refreshing, setRefreshing] = useState(false)
  const [profileAvatarUrl, setProfileAvatarUrl] = useState(null)
  const [avatarLoaded, setAvatarLoaded] = useState(false)
  const [selectedMetric, setSelectedMetric] = useState(null)
  const insightAnim = useRef(new Animated.Value(0)).current

  const displayName = user?.user_metadata?.name || user?.email?.split('@')[0] || 'User'

  const loadDashboard = useCallback(async () => {
    if (!user) return
    setRefreshing(true)
    try {
      const [{ data: reports }, { data: logs }, { data: profile }] = await Promise.all([
        supabase.from('reports').select('id').eq('user_id', user.id),
        supabase
          .from('health_logs')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(3),
        supabase
          .from('profiles')
          .select('avatar_url')
          .eq('id', user.id)
          .maybeSingle(),
      ])

      setReportCount(reports?.length || 0)
      setRecentLogs(logs || [])
      setProfileAvatarUrl(profile?.avatar_url || null)
      setAvatarLoaded(true)
    } catch (error) {
      console.error('Error loading dashboard:', error)
      setAvatarLoaded(true)
    } finally {
      setRefreshing(false)
    }
  }, [user])

  useFocusEffect(
    useCallback(() => {
      loadDashboard()
    }, [loadDashboard])
  )

  // Calculate averages from recent logs
  const calculateAverages = () => {
    if (recentLogs.length === 0) return { hr: '-', bp: '-', sugar: '-', temp: '-' }

    const validHeartRates = recentLogs
      .map((log) => log.heart_rate)
      .filter((hr) => hr !== null && hr !== undefined)
    const validBP = recentLogs
      .map((log) => log.blood_pressure)
      .filter((bp) => bp !== null && bp !== undefined)
    const validSugar = recentLogs
      .map((log) => log.blood_sugar)
      .filter((sugar) => sugar !== null && sugar !== undefined)
    const validTemp = recentLogs
      .map((log) => log.temperature)
      .filter((temp) => temp !== null && temp !== undefined)

    const avgHr =
      validHeartRates.length > 0
        ? Math.round(
            validHeartRates.reduce((a, b) => a + b, 0) / validHeartRates.length
          )
        : '-'
    const avgSugar =
      validSugar.length > 0
        ? Math.round(validSugar.reduce((a, b) => a + b, 0) / validSugar.length)
        : '-'
    const avgTemp =
      validTemp.length > 0
        ? (
            validTemp.reduce((a, b) => a + b, 0) / validTemp.length
          ).toFixed(1)
        : '-'

    return { hr: avgHr, bp: validBP[0] || '-', sugar: avgSugar, temp: avgTemp }
  }

  const averages = calculateAverages()
  const BLOOD_SUGAR_MODE =
    String(process.env.EXPO_PUBLIC_BLOOD_SUGAR_MODE || 'random').toLowerCase() === 'fasting'
      ? 'fasting'
      : 'random'

  const toFiniteNumberOrNull = (value) => {
    const n = Number(value)
    return Number.isFinite(n) ? n : null
  }

  const parseBloodPressure = (rawValue) => {
    const [sys, dia] = String(rawValue).split('/').map((part) => toFiniteNumberOrNull(part))
    if (!Number.isFinite(sys) || !Number.isFinite(dia)) return null
    return { systolic: sys, diastolic: dia }
  }

  const getMetricStatus = (key, rawValue) => {
    if (rawValue === '-' || rawValue === null || rawValue === undefined || rawValue === '') {
      return null
    }

    if (key === 'hr') {
      const value = toFiniteNumberOrNull(rawValue)
      if (value === null) return null
      if (value < 60) return { status: 'Low', severity: 'warning', color: HEALTH_SEVERITY_COLORS.warning }
      if (value <= 100) return { status: 'Normal', severity: 'normal', color: HEALTH_SEVERITY_COLORS.normal }
      return { status: 'High', severity: 'critical', color: HEALTH_SEVERITY_COLORS.critical }
    }

    if (key === 'bp') {
      const bp = parseBloodPressure(rawValue)
      if (!bp) return null
      if (bp.systolic >= 140 || bp.diastolic >= 90) {
        return { status: 'High', severity: 'critical', color: HEALTH_SEVERITY_COLORS.critical }
      }
      if (
        (bp.systolic >= 130 && bp.systolic <= 139) ||
        (bp.diastolic >= 80 && bp.diastolic <= 89)
      ) {
        return { status: 'Stage 1', severity: 'warning', color: HEALTH_SEVERITY_COLORS.warning }
      }
      if (bp.systolic >= 120 && bp.systolic <= 129 && bp.diastolic < 80) {
        return { status: 'Elevated', severity: 'warning', color: HEALTH_SEVERITY_COLORS.warning }
      }
      if (bp.systolic < 120 && bp.diastolic < 80) {
        return { status: 'Normal', severity: 'normal', color: HEALTH_SEVERITY_COLORS.normal }
      }
      return { status: 'Elevated', severity: 'warning', color: HEALTH_SEVERITY_COLORS.warning }
    }

    if (key === 'sugar') {
      const value = toFiniteNumberOrNull(rawValue)
      if (value === null) return null
      if (BLOOD_SUGAR_MODE === 'fasting') {
        if (value < 100) return { status: 'Normal', severity: 'normal', color: HEALTH_SEVERITY_COLORS.normal }
        if (value <= 125) return { status: 'Prediabetes', severity: 'warning', color: HEALTH_SEVERITY_COLORS.warning }
        return { status: 'High', severity: 'critical', color: HEALTH_SEVERITY_COLORS.critical }
      }

      if (value < 140) return { status: 'Normal', severity: 'normal', color: HEALTH_SEVERITY_COLORS.normal }
      return { status: 'High', severity: 'critical', color: HEALTH_SEVERITY_COLORS.critical }
    }

    if (key === 'temp') {
      const value = toFiniteNumberOrNull(rawValue)
      if (value === null) return null
      if (value < 95.0) return { status: 'Low', severity: 'warning', color: HEALTH_SEVERITY_COLORS.warning }
      if (value <= 99.0) return { status: 'Normal', severity: 'normal', color: HEALTH_SEVERITY_COLORS.normal }
      if (value <= 100.4) return { status: 'Mild Fever', severity: 'warning', color: HEALTH_SEVERITY_COLORS.warning }
      return { status: 'High', severity: 'critical', color: HEALTH_SEVERITY_COLORS.critical }
    }

    return null
  }

  const getCombinedHealthStatus = (metrics) => {
    const metricStatuses = [
      getMetricStatus('hr', metrics.hr),
      getMetricStatus('bp', metrics.bp),
      getMetricStatus('sugar', metrics.sugar),
      getMetricStatus('temp', metrics.temp),
    ].filter(Boolean)

    if (metricStatuses.length === 0) {
      return { status: 'Unknown', severity: 'warning', color: HEALTH_SEVERITY_COLORS.warning }
    }

    if (metricStatuses.some((m) => m.status === 'High')) {
      return { status: 'High', severity: 'critical', color: HEALTH_SEVERITY_COLORS.critical }
    }
    if (
      metricStatuses.some(
        (m) =>
          m.status === 'Elevated' ||
          m.status === 'Low' ||
          m.status === 'Stage 1' ||
          m.status === 'Prediabetes' ||
          m.status === 'Mild Fever' ||
          m.severity === 'warning'
      )
    ) {
      return { status: 'Elevated', severity: 'warning', color: HEALTH_SEVERITY_COLORS.warning }
    }

    return { status: 'Normal', severity: 'normal', color: HEALTH_SEVERITY_COLORS.normal }
  }

  const healthStatus = getCombinedHealthStatus(averages)

  const metricCards = [
    { key: 'hr', emoji: '❤️', label: 'Heart Rate', value: averages.hr, unit: 'bpm' },
    { key: 'bp', emoji: '🩺', label: 'Blood Pressure', value: averages.bp, unit: 'mmHg' },
    { key: 'sugar', emoji: '🩸', label: 'Blood Sugar', value: averages.sugar, unit: 'mg/dL' },
    { key: 'temp', emoji: '🌡️', label: 'Temperature', value: averages.temp, unit: '°F' },
  ]

  function getSmartInsightMessage(key, status) {
    if (key === 'hr') {
      if (status === 'Normal') return 'Heart rate is within normal range today.'
      if (status === 'Low') return 'Heart rate is lower than usual. Hydrate and monitor symptoms.'
      if (status === 'High') return 'Heart rate is high. Consider medical guidance if this persists.'
      return 'Heart rate data is limited right now.'
    }

    if (key === 'bp') {
      if (status === 'Normal') return 'Blood pressure looks stable at the moment.'
      if (status === 'Elevated') return 'Blood pressure is slightly elevated today.'
      if (status === 'Stage 1') return 'Blood pressure is in Stage 1 range. Monitor daily and review lifestyle factors.'
      if (status === 'High') return 'Blood pressure is high. Please monitor closely and seek care if needed.'
      return 'Blood pressure data is limited right now.'
    }

    if (key === 'sugar') {
      if (status === 'Normal') return 'Blood sugar is within your healthy range.'
      if (status === 'Prediabetes') return 'Blood sugar is in prediabetes range. Consider diet and activity adjustments.'
      if (status === 'High') return 'Blood sugar is high. Follow your care plan and monitor closely.'
      return 'Blood sugar data is limited right now.'
    }

    if (key === 'temp') {
      if (status === 'Normal') return 'Temperature is in a normal range.'
      if (status === 'Low') return 'Temperature is lower than expected. Recheck in a warm setting.'
      if (status === 'Mild Fever') return 'Temperature suggests a mild fever. Rest and stay hydrated.'
      if (status === 'High') return 'Temperature is high. Consider resting and monitoring for fever symptoms.'
      return 'Temperature data is limited right now.'
    }

    return 'Health trend data is being collected.'
  }

  function getInsightPriority(severity) {
    if (severity === 'critical') return 0
    if (severity === 'warning') return 1
    return 2
  }

  const smartInsights = metricCards
    .map((metric) => {
      const insight = getMetricInsight(metric.key, metric.value)
      const palette = getSeverityStyle(insight.severity)
      const icon =
        insight.severity === 'critical'
          ? '⚠️'
          : insight.severity === 'warning'
            ? '💡'
            : '✔'

      return {
        key: metric.key,
        severity: insight.severity,
        status: insight.status,
        label: metric.label,
        icon,
        message: getSmartInsightMessage(metric.key, insight.status),
        palette,
      }
    })
    .filter((item) => item.status !== 'Not available')
    .sort((a, b) => getInsightPriority(a.severity) - getInsightPriority(b.severity))
    .slice(0, 3)

  const displayInsights =
    smartInsights.length > 0
      ? smartInsights
      : [
          {
            key: 'fallback',
            severity: 'warning',
            status: 'Not available',
            label: 'Health Trends',
            icon: '💡',
            message: 'Add more health logs to unlock personalized smart insights.',
            palette: getSeverityStyle('warning'),
          },
        ]

  function getMetricInsight(key, rawValue) {
    if (rawValue === '-' || rawValue === null || rawValue === undefined) {
      return {
        tone: 'unknown',
        status: 'Not available',
        severity: 'warning',
        hint: 'Add more logs to generate reliable trends for this metric.',
      }
    }

    const statusResult = getMetricStatus(key, rawValue)
    if (!statusResult) {
      return {
        tone: 'unknown',
        status: 'Not available',
        severity: 'warning',
        hint: 'Add more logs to improve metric quality.',
      }
    }

    const tone =
      statusResult.severity === 'critical'
        ? 'high'
        : statusResult.severity === 'warning'
          ? 'low'
          : 'good'

    if (key === 'hr') {
      if (statusResult.status === 'Low') {
        return { tone, status: statusResult.status, severity: statusResult.severity, hint: 'Heart rate is below normal. Track dizziness and hydration.' }
      }
      if (statusResult.status === 'Normal') {
        return { tone, status: statusResult.status, severity: statusResult.severity, hint: 'Heart rate is within healthy range.' }
      }
      return { tone: 'high', status: statusResult.status, severity: statusResult.severity, hint: 'Heart rate is above normal. Rest and recheck; consult if persistent.' }
    }

    if (key === 'bp') {
      if (statusResult.status === 'Normal') {
        return { tone, status: statusResult.status, severity: statusResult.severity, hint: 'Blood pressure is currently in a normal range.' }
      }
      if (statusResult.status === 'Elevated') {
        return { tone, status: statusResult.status, severity: statusResult.severity, hint: 'Blood pressure is elevated. Focus on hydration and low-sodium choices.' }
      }
      if (statusResult.status === 'Stage 1') {
        return { tone, status: statusResult.status, severity: statusResult.severity, hint: 'Stage 1 blood pressure range detected. Monitor trends and consult if repeated.' }
      }
      return { tone: 'high', status: statusResult.status, severity: statusResult.severity, hint: 'High blood pressure range detected. Seek medical guidance if this continues.' }
    }

    if (key === 'sugar') {
      if (statusResult.status === 'Normal') {
        return { tone, status: statusResult.status, severity: statusResult.severity, hint: 'Blood sugar is in the expected range.' }
      }
      if (statusResult.status === 'Prediabetes') {
        return { tone, status: statusResult.status, severity: statusResult.severity, hint: 'Prediabetes range detected. Consider routine follow-up and lifestyle adjustments.' }
      }
      return { tone: 'high', status: statusResult.status, severity: statusResult.severity, hint: 'Blood sugar is high. Follow your care plan and monitor closely.' }
    }

    if (key === 'temp') {
      if (statusResult.status === 'Low') {
        return { tone, status: statusResult.status, severity: statusResult.severity, hint: 'Temperature is low. Recheck in a warm environment.' }
      }
      if (statusResult.status === 'Normal') {
        return { tone, status: statusResult.status, severity: statusResult.severity, hint: 'Temperature is in a normal range.' }
      }
      if (statusResult.status === 'Mild Fever') {
        return { tone, status: statusResult.status, severity: statusResult.severity, hint: 'Mild fever range. Rest, hydrate, and monitor symptoms.' }
      }
      return { tone: 'high', status: statusResult.status, severity: statusResult.severity, hint: 'High temperature detected. Monitor closely and seek care if needed.' }
    }

    return {
      tone: 'unknown',
      status: 'Not available',
      severity: 'warning',
      hint: 'Add more logs to improve metric quality.',
    }
  }

  function getSeverityStyle(severity) {
    if (severity === 'normal') {
      return {
        bg: '#ecfdf5',
        border: '#86efac',
        text: '#166534',
        value: '#15803d',
        softBorder: '#bbf7d0',
      }
    }
    if (severity === 'critical') {
      return {
        bg: '#fef2f2',
        border: '#fca5a5',
        text: '#b91c1c',
        value: '#dc2626',
        softBorder: '#fecaca',
      }
    }
    return {
      bg: '#fff7ed',
      border: '#fdba74',
      text: '#9a3412',
      value: '#c2410c',
      softBorder: '#fed7aa',
    }
  }

  const selectedMetricCard = metricCards.find((metric) => metric.key === selectedMetric) || null
  const selectedMetricInsight = selectedMetricCard
    ? getMetricInsight(selectedMetricCard.key, selectedMetricCard.value)
    : null
  const statusSeverityStyle = getSeverityStyle(healthStatus.severity)
  const getLogTimeLabel = (value) => {
    const date = new Date(value)
    if (!Number.isFinite(date.getTime())) return '--:--'
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  const avatarInitial = (displayName || 'U').charAt(0).toUpperCase()
  const avatarUrl = avatarLoaded
    ? (profileAvatarUrl || null)
    : (user?.user_metadata?.avatar_url || null)
  const summaryCards = [
    { key: 'reports', icon: '📄', label: 'Reports', value: String(reportCount) },
    { key: 'logs', icon: '📈', label: 'Recent Logs', value: String(recentLogs.length) },
    { key: 'status', icon: '●', label: 'Status', value: healthStatus.status },
  ]

  useEffect(() => {
    if (selectedMetricCard) {
      insightAnim.setValue(0)
      Animated.timing(insightAnim, {
        toValue: 1,
        duration: 220,
        useNativeDriver: Platform.OS !== 'web',
      }).start()
    }
  }, [insightAnim, selectedMetricCard])

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.brandingBar}>
        <View style={styles.brandingLeft}>
          <View style={styles.logoWrap}>
            <Image source={require('../../assets/app-logo.png')} style={styles.logoImage} />
          </View>
          <View>
            <Text style={styles.brandName}>ARISE</Text>
            <Text style={styles.brandSubtitle}>Health Companion</Text>
          </View>
        </View>

        <Pressable
          style={({ pressed }) => [styles.avatarWrap, pressed && styles.avatarPressed]}
          onPress={() => navigation.navigate('ProfileTab')}
        >
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
          ) : (
            <Text style={styles.avatarText}>{avatarInitial}</Text>
          )}
        </Pressable>
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={loadDashboard}
            tintColor="#1e5a4a"
            colors={['#1e5a4a', '#2a7d6b']}
          />
        }
      >
        {/* Hero Section */}
        <View style={styles.heroCard}>
          <View style={styles.heroGradientTop} />
          <View style={styles.heroGradientBottom} />
          <View style={styles.heroGlowOne} />
          <View style={styles.heroGlowTwo} />
          <View style={styles.headerContent}>
            <Text style={styles.headerGreeting}>Health Dashboard</Text>
            <Text style={styles.headerName}>Hi, {displayName}</Text>
            <Text style={styles.headerSubtitle}>
              Your latest health snapshot, trends, and activity in one place.
            </Text>
          </View>
        </View>

        <View style={styles.summaryCardsRow}>
          {summaryCards.map((card) => {
            const isStatusCard = card.key === 'status'
            return (
            <View
              key={card.key}
              style={[
                styles.summaryCard,
                isStatusCard && {
                  backgroundColor: statusSeverityStyle.bg,
                  borderColor: statusSeverityStyle.softBorder,
                },
              ]}
            >
              <View
                style={[
                  styles.summaryIconWrap,
                  isStatusCard && {
                    backgroundColor: '#ffffff',
                    borderColor: statusSeverityStyle.softBorder,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.summaryIcon,
                    isStatusCard && { color: statusSeverityStyle.value },
                  ]}
                >
                  {card.icon}
                </Text>
              </View>
              <Text
                style={[
                  styles.summaryLabel,
                  isStatusCard && { color: statusSeverityStyle.text },
                ]}
              >
                {card.label}
              </Text>
              <Text
                style={[
                  styles.summaryValue,
                  isStatusCard && { color: statusSeverityStyle.value },
                ]}
              >
                {card.value}
              </Text>
            </View>
            )
          })}
        </View>

        {/* Key Metrics Grid */}
        <View style={styles.metricsContainer}>
          <Text style={styles.metricsTitle}>Vitals At A Glance</Text>
          <Text style={styles.metricsHint}>Tap any card to view quick interpretation.</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.metricsRow}
          >
            {metricCards.map((metric) => (
              (() => {
                const insight = getMetricInsight(metric.key, metric.value)
                const severity = getSeverityStyle(insight.severity)
                return (
              <Pressable
                key={metric.key}
                style={({ pressed, hovered }) => [
                  styles.metricCard,
                  {
                    backgroundColor: severity.bg,
                    borderColor: severity.softBorder,
                  },
                  selectedMetric === metric.key && styles.metricCardActive,
                  selectedMetric === metric.key && {
                    backgroundColor: severity.bg,
                    borderColor: severity.border,
                  },
                  hovered && styles.metricCardHover,
                  (pressed || hovered) && styles.metricCardPressed,
                  {
                    transform: [
                      { translateY: hovered ? -3 : 0 },
                      { scale: pressed ? 0.985 : hovered ? 1.01 : 1 },
                    ],
                  },
                ]}
                onPress={() => setSelectedMetric(selectedMetric === metric.key ? null : metric.key)}
              >
                <View style={styles.metricTopRow}>
                  <View style={styles.metricHeader}>
                    <View style={[styles.metricIconBubble, { backgroundColor: '#ffffff', borderColor: severity.softBorder }]}>
                      <Text style={styles.metricIcon}>{metric.emoji}</Text>
                    </View>
                    <Text style={styles.metricLabel}>{metric.label}</Text>
                  </View>
                  <View style={[styles.metricStatusPill, { backgroundColor: '#ffffff', borderColor: severity.softBorder }]}>
                    <Text style={[styles.metricStatusText, { color: severity.text }]}>{insight.status}</Text>
                  </View>
                </View>
                <Text style={[styles.metricValue, { color: severity.value }]}>{metric.value}</Text>
                <Text style={styles.metricUnit}>{metric.unit}</Text>
                <Text style={[styles.metricQuickStatus, { color: severity.text }]}>Status: {insight.status}</Text>
              </Pressable>
                )
              })()
            ))}
          </ScrollView>

          {selectedMetricCard && selectedMetricInsight ? (
            <Animated.View
              style={[
                styles.metricInsightCard,
                {
                  opacity: insightAnim,
                  transform: [
                    {
                      translateY: insightAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [6, 0],
                      }),
                    },
                  ],
                },
              ]}
            >
              <Text style={styles.metricInsightTitle}>
                {selectedMetricCard.label}: {selectedMetricInsight.status}
              </Text>
              <Text style={styles.metricInsightText}>{selectedMetricInsight.hint}</Text>
            </Animated.View>
          ) : null}
        </View>

        <View style={styles.smartInsightsSection}>
          <Text style={styles.smartInsightsTitle}>Smart Health Insights</Text>
          <Text style={styles.smartInsightsHint}>Personalized highlights from your latest vitals.</Text>

          <View style={styles.smartInsightsList}>
            {displayInsights.map((insight) => (
              <View
                key={insight.key}
                style={[
                  styles.smartInsightCard,
                  {
                    backgroundColor: insight.palette.bg,
                    borderColor: insight.palette.softBorder,
                  },
                ]}
              >
                <View
                  style={[
                    styles.smartInsightIconWrap,
                    { borderColor: insight.palette.softBorder },
                  ]}
                >
                  <Text style={styles.smartInsightIcon}>{insight.icon}</Text>
                </View>

                <View style={styles.smartInsightContent}>
                  <Text style={[styles.smartInsightLabel, { color: insight.palette.text }]}>
                    {insight.label}
                  </Text>
                  <Text style={styles.smartInsightText}>{insight.message}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* Recent Logs Section */}
        <View style={styles.recentLogsSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Health Logs</Text>
            {recentLogs.length > 0 && (
              <Text style={styles.sectionBadge}>{recentLogs.length}</Text>
            )}
          </View>

          {recentLogs.length === 0 ? (
            <View style={styles.emptyStateContainer}>
              <Text style={styles.emptyStateIcon}>📋</Text>
              <Text style={styles.emptyStateTitle}>No health logs yet</Text>
              <Text style={styles.emptyStateSubtitle}>
                Start tracking your vitals from the Health Logs tab.
              </Text>
            </View>
          ) : (
            <View style={styles.logsList}>
              {recentLogs.map((log, index) => (
                <AnimatedListItem key={log.id} index={index}>
                  <View style={styles.timelineRow}>
                    <View style={styles.timelineRail}>
                      <View style={styles.timelineDot} />
                      {index !== recentLogs.length - 1 ? <View style={styles.timelineLine} /> : null}
                    </View>

                    <Pressable
                      style={({ pressed, hovered }) => [
                        styles.logCard,
                        hovered && styles.logCardHover,
                        pressed && styles.logCardPressed,
                        {
                          transform: [{ translateY: hovered ? -2 : 0 }, { scale: pressed ? 0.992 : 1 }],
                        },
                      ]}
                    >
                      <View style={styles.logHeader}>
                        <View style={styles.logDateWrap}>
                          <Text style={styles.logDate}>{formatDate(log.created_at)}</Text>
                          <Text style={styles.logTime}>{getLogTimeLabel(log.created_at)}</Text>
                        </View>
                        <View style={styles.logStatusChip}>
                          <Text style={styles.logStatusText}>Logged</Text>
                        </View>
                      </View>

                      <View style={styles.logMetricsGrid}>
                        <View style={styles.logMetricCell}>
                          <Text style={styles.logMetricLabel}>Heart Rate</Text>
                          <View style={styles.logMetricValueRow}>
                            <Text style={styles.logMetricValue}>{log.heart_rate ?? '-'}</Text>
                            <Text style={styles.logMetricUnit}>bpm</Text>
                          </View>
                        </View>

                        <View style={styles.logMetricCell}>
                          <Text style={styles.logMetricLabel}>Blood Pressure</Text>
                          <View style={styles.logMetricValueRow}>
                            <Text style={styles.logMetricValue}>{log.blood_pressure ?? '-'}</Text>
                            <Text style={styles.logMetricUnit}>mmHg</Text>
                          </View>
                        </View>

                        <View style={styles.logMetricCell}>
                          <Text style={styles.logMetricLabel}>Blood Sugar</Text>
                          <View style={styles.logMetricValueRow}>
                            <Text style={styles.logMetricValue}>{log.blood_sugar ?? '-'}</Text>
                            <Text style={styles.logMetricUnit}>mg/dL</Text>
                          </View>
                        </View>

                        <View style={styles.logMetricCell}>
                          <Text style={styles.logMetricLabel}>Temperature</Text>
                          <View style={styles.logMetricValueRow}>
                            <Text style={styles.logMetricValue}>{log.temperature ?? '-'}</Text>
                            <Text style={styles.logMetricUnit}>°F</Text>
                          </View>
                        </View>
                      </View>
                    </Pressable>
                  </View>
                </AnimatedListItem>
              ))}
            </View>
          )}
        </View>

        {/* Footer Spacing */}
        <View style={styles.footerSpacing} />
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f8fafc',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight || 0 : 0,
  },
  brandingBar: {
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    ...PREMIUM_CARD_SHADOW,
  },
  brandingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logoWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#e8f6f3',
    borderWidth: 1,
    borderColor: '#cfe8e3',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  logoImage: {
    width: 22,
    height: 22,
  },
  brandName: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0b1220',
    letterSpacing: 0.5,
  },
  brandSubtitle: {
    fontSize: 9,
    fontWeight: '500',
    color: '#7b8a9d',
  },
  avatarWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#86efac',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  avatarPressed: {
    opacity: 0.84,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#166534',
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  heroCard: {
    marginTop: 8,
    marginBottom: 10,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#0f766e',
    overflow: 'hidden',
    position: 'relative',
    ...INTERACTIVE_CARD_SHADOW,
  },
  heroGradientTop: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: '62%',
    backgroundColor: '#16a085',
    opacity: 0.18,
  },
  heroGradientBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '62%',
    backgroundColor: '#0b5f57',
    opacity: 0.24,
  },
  heroGlowOne: {
    position: 'absolute',
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(255,255,255,0.11)',
    right: -14,
    top: -18,
  },
  heroGlowTwo: {
    position: 'absolute',
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.08)',
    right: 42,
    bottom: -20,
  },
  headerContent: {
    flex: 1,
  },
  headerGreeting: {
    fontSize: 11,
    fontWeight: '700',
    color: '#ccfbf1',
    letterSpacing: 0.3,
    marginBottom: 1,
    textTransform: 'uppercase',
  },
  headerName: {
    fontSize: 26,
    fontWeight: '900',
    color: '#ffffff',
    marginBottom: 3,
  },
  headerSubtitle: {
    fontSize: 11,
    color: '#d7f9f4',
    fontWeight: '500',
    lineHeight: 15,
  },
  summaryCardsRow: {
    marginTop: 2,
    marginBottom: 16,
    flexDirection: 'row',
    gap: 8,
  },
  summaryCard: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 8,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: SOFT_BORDER_COLOR,
    alignItems: 'center',
    gap: 4,
    ...PREMIUM_CARD_SHADOW,
  },
  summaryIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 8,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryIcon: {
    fontSize: 13,
    color: '#64748b',
  },
  summaryLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: '#708198',
  },
  summaryValue: {
    fontSize: 13,
    color: '#0b1220',
    fontWeight: '900',
  },
  metricsContainer: {
    marginBottom: 12,
  },
  metricsTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: '#0b1220',
  },
  metricsHint: {
    fontSize: 10,
    color: '#7b8a9d',
    marginTop: 2,
    marginBottom: 10,
    fontWeight: '600',
  },
  metricsGrid: {
    display: 'none',
  },
  metricsRow: {
    gap: 12,
    paddingRight: 16,
    paddingBottom: 2,
  },
  metricCard: {
    width: Math.min(width * 0.42, 172),
    minWidth: 148,
    minHeight: 156,
    backgroundColor: '#f8fafc',
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
    borderColor: SOFT_BORDER_COLOR,
    justifyContent: 'space-between',
    elevation: 2,
    ...INTERACTIVE_CARD_SHADOW,
  },
  metricCardHover: {
    elevation: 4,
    ...METRIC_ACTIVE_SHADOW_STYLE,
  },
  metricCardPressed: {
    opacity: 0.97,
  },
  metricCardActive: {
    borderColor: '#9bc5bb',
    elevation: 4,
    ...METRIC_ACTIVE_SHADOW_STYLE,
  },
  metricTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
    gap: 6,
  },
  metricHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    flex: 1,
  },
  metricIconBubble: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricIcon: {
    fontSize: 12,
  },
  metricLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: '#64748b',
  },
  metricStatusPill: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  metricStatusText: {
    fontSize: 9,
    fontWeight: '700',
  },
  metricValue: {
    fontSize: 28,
    fontWeight: '900',
    color: '#1e5a4a',
    marginTop: 1,
    marginBottom: 1,
  },
  metricUnit: {
    fontSize: 10,
    fontWeight: '600',
    color: '#8fa0b5',
    marginBottom: 3,
  },
  metricQuickStatus: {
    fontSize: 9,
    fontWeight: '600',
    opacity: 0.9,
  },
  metricInsightCard: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#bae6fd',
    backgroundColor: '#f0f9ff',
    borderRadius: 16,
    padding: 8,
    gap: 2,
    ...PREMIUM_CARD_SHADOW,
  },
  metricInsightTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0b1220',
  },
  metricInsightText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#516174',
    lineHeight: 15,
  },
  smartInsightsSection: {
    marginBottom: 14,
  },
  smartInsightsTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: '#0b1220',
  },
  smartInsightsHint: {
    fontSize: 10,
    color: '#7b8a9d',
    marginTop: 2,
    marginBottom: 10,
    fontWeight: '600',
  },
  smartInsightsList: {
    gap: 8,
  },
  smartInsightCard: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    ...PREMIUM_CARD_SHADOW,
  },
  smartInsightIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  smartInsightIcon: {
    fontSize: 13,
  },
  smartInsightContent: {
    flex: 1,
    gap: 2,
  },
  smartInsightLabel: {
    fontSize: 11,
    fontWeight: '700',
  },
  smartInsightText: {
    fontSize: 12,
    color: '#334155',
    fontWeight: '500',
    lineHeight: 17,
  },
  statsSection: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 24,
    elevation: 2,
    ...PREMIUM_CARD_SHADOW,
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  statIcon: {
    fontSize: 20,
  },
  statCount: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0f172a',
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
  },
  statDivider: {
    width: 1,
    backgroundColor: '#e2e8f0',
    marginHorizontal: 8,
  },
  recentLogsSection: {
    marginBottom: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: '#0b1220',
  },
  sectionBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: '#ffffff',
    backgroundColor: '#1e5a4a',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
  },
  emptyStateContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: SOFT_BORDER_COLOR,
    borderStyle: 'dashed',
    ...PREMIUM_CARD_SHADOW,
  },
  emptyStateIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyStateTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0b1220',
    marginBottom: 4,
  },
  emptyStateSubtitle: {
    fontSize: 12,
    color: '#708198',
    textAlign: 'center',
    lineHeight: 18,
  },
  logsList: {
    gap: 12,
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 10,
  },
  timelineRail: {
    width: 18,
    alignItems: 'center',
    position: 'relative',
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#0f766e',
    marginTop: 16,
    borderWidth: 2,
    borderColor: '#d1fae5',
  },
  timelineLine: {
    position: 'absolute',
    top: 28,
    bottom: -16,
    width: 2,
    backgroundColor: '#dbe5ef',
  },
  logCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 11,
    ...PREMIUM_CARD_SHADOW,
  },
  logCardHover: {
    ...METRIC_ACTIVE_SHADOW_STYLE,
  },
  logCardPressed: {
    opacity: 0.98,
  },
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  logDateWrap: {
    flex: 1,
  },
  logDate: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0b1220',
  },
  logTime: {
    fontSize: 11,
    fontWeight: '600',
    color: '#7b8a9d',
    marginTop: 2,
  },
  logStatusChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  logStatusText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#166534',
  },
  logMetricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 8,
    rowGap: 8,
    borderTopWidth: 1,
    borderTopColor: '#edf2f7',
    paddingTop: 10,
  },
  logMetricCell: {
    width: '48%',
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 9,
    borderWidth: 1,
    borderColor: '#edf2f7',
  },
  logMetricLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#7b8a9d',
    marginBottom: 4,
  },
  logMetricValueRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
  },
  logMetricValue: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0b1220',
  },
  logMetricUnit: {
    fontSize: 10,
    fontWeight: '600',
    color: '#8fa0b5',
    marginBottom: 1,
  },
  footerSpacing: {
    height: 12,
  },
})