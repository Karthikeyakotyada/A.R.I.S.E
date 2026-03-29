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

export default function DashboardScreen() {
  const { user } = useAuth()
  const [reportCount, setReportCount] = useState(0)
  const [recentLogs, setRecentLogs] = useState([])
  const [refreshing, setRefreshing] = useState(false)
  const [selectedMetric, setSelectedMetric] = useState(null)
  const insightAnim = useRef(new Animated.Value(0)).current

  const displayName = user?.user_metadata?.name || user?.email?.split('@')[0] || 'User'

  const loadDashboard = useCallback(async () => {
    if (!user) return
    setRefreshing(true)
    try {
      const [{ data: reports }, { data: logs }] = await Promise.all([
        supabase.from('reports').select('id').eq('user_id', user.id),
        supabase
          .from('health_logs')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(5),
      ])

      setReportCount(reports?.length || 0)
      setRecentLogs(logs || [])
    } catch (error) {
      console.error('Error loading dashboard:', error)
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

  const toFiniteNumberOrNull = (value) => {
    const n = Number(value)
    return Number.isFinite(n) ? n : null
  }

  const getMetricStatus = (key, rawValue) => {
    if (rawValue === '-' || rawValue === null || rawValue === undefined || rawValue === '') {
      return null
    }

    if (key === 'hr') {
      const value = toFiniteNumberOrNull(rawValue)
      if (value === null) return null
      if (value < 50) return { status: 'Critical', severity: 'critical', color: HEALTH_SEVERITY_COLORS.critical }
      if (value < 60) return { status: 'Low', severity: 'warning', color: HEALTH_SEVERITY_COLORS.warning }
      if (value <= 100) return { status: 'Normal', severity: 'normal', color: HEALTH_SEVERITY_COLORS.normal }
      if (value <= 120) return { status: 'Elevated', severity: 'warning', color: HEALTH_SEVERITY_COLORS.warning }
      return { status: 'High', severity: 'critical', color: HEALTH_SEVERITY_COLORS.critical }
    }

    if (key === 'bp') {
      const systolic = toFiniteNumberOrNull(String(rawValue).split('/')[0])
      if (systolic === null) return null
      if (systolic < 80) return { status: 'Critical', severity: 'critical', color: HEALTH_SEVERITY_COLORS.critical }
      if (systolic < 90) return { status: 'Low', severity: 'warning', color: HEALTH_SEVERITY_COLORS.warning }
      if (systolic <= 130) return { status: 'Normal', severity: 'normal', color: HEALTH_SEVERITY_COLORS.normal }
      if (systolic <= 160) return { status: 'Elevated', severity: 'warning', color: HEALTH_SEVERITY_COLORS.warning }
      if (systolic <= 180) return { status: 'High', severity: 'critical', color: HEALTH_SEVERITY_COLORS.critical }
      return { status: 'Critical', severity: 'critical', color: HEALTH_SEVERITY_COLORS.critical }
    }

    if (key === 'sugar') {
      const value = toFiniteNumberOrNull(rawValue)
      if (value === null) return null
      if (value < 54) return { status: 'Critical', severity: 'critical', color: HEALTH_SEVERITY_COLORS.critical }
      if (value < 70) return { status: 'Low', severity: 'warning', color: HEALTH_SEVERITY_COLORS.warning }
      if (value <= 140) return { status: 'Normal', severity: 'normal', color: HEALTH_SEVERITY_COLORS.normal }
      if (value <= 180) return { status: 'Elevated', severity: 'warning', color: HEALTH_SEVERITY_COLORS.warning }
      if (value <= 250) return { status: 'High', severity: 'critical', color: HEALTH_SEVERITY_COLORS.critical }
      return { status: 'Critical', severity: 'critical', color: HEALTH_SEVERITY_COLORS.critical }
    }

    if (key === 'temp') {
      const value = toFiniteNumberOrNull(rawValue)
      if (value === null) return null
      if (value < 35.0) return { status: 'Critical', severity: 'critical', color: HEALTH_SEVERITY_COLORS.critical }
      if (value < 36.1) return { status: 'Low', severity: 'warning', color: HEALTH_SEVERITY_COLORS.warning }
      if (value <= 37.2) return { status: 'Normal', severity: 'normal', color: HEALTH_SEVERITY_COLORS.normal }
      if (value <= 38.0) return { status: 'Elevated', severity: 'warning', color: HEALTH_SEVERITY_COLORS.warning }
      if (value <= 39.0) return { status: 'High', severity: 'critical', color: HEALTH_SEVERITY_COLORS.critical }
      return { status: 'Critical', severity: 'critical', color: HEALTH_SEVERITY_COLORS.critical }
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

    if (metricStatuses.some((m) => m.status === 'Critical')) {
      return { status: 'Critical', severity: 'critical', color: HEALTH_SEVERITY_COLORS.critical }
    }
    if (metricStatuses.some((m) => m.status === 'High')) {
      return { status: 'High', severity: 'critical', color: HEALTH_SEVERITY_COLORS.critical }
    }
    if (
      metricStatuses.some((m) => m.status === 'Elevated' || m.status === 'Low' || m.severity === 'warning')
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
    { key: 'temp', emoji: '🌡️', label: 'Temperature', value: averages.temp, unit: '°C' },
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

    const value = Number(rawValue)
    if (key === 'hr') {
      if (value < 50) return { tone: 'low', status: 'Low', severity: 'critical', hint: 'Track hydration, rest, and symptoms like dizziness.' }
      if (value < 60) return { tone: 'low', status: 'Low', severity: 'warning', hint: 'Track hydration, rest, and symptoms like dizziness.' }
      if (value <= 100) return { tone: 'good', status: 'Normal', severity: 'normal', hint: 'Current trend looks healthy. Keep regular tracking.' }
      if (value <= 120) return { tone: 'high', status: 'Elevated', severity: 'warning', hint: 'Retest after resting and consult a clinician if persistent.' }
      return { tone: 'high', status: 'High', severity: 'critical', hint: 'Retest after resting and consult a clinician if persistent.' }
    }

    if (key === 'sugar') {
      if (value < 70) return { tone: 'low', status: 'Low', severity: 'critical', hint: 'Consider immediate corrective intake and monitor closely.' }
      if (value <= 140) return { tone: 'good', status: 'Normal', severity: 'normal', hint: 'Maintain your meal and activity routine.' }
      if (value <= 180) return { tone: 'high', status: 'Elevated', severity: 'warning', hint: 'Review diet timing and follow-up with your doctor if frequent.' }
      return { tone: 'high', status: 'High', severity: 'critical', hint: 'Review diet timing and follow-up with your doctor if frequent.' }
    }

    if (key === 'temp') {
      if (value < 35.8) return { tone: 'low', status: 'Low', severity: 'critical', hint: 'Recheck in a warm environment and monitor symptoms.' }
      if (value < 36.1) return { tone: 'low', status: 'Low', severity: 'warning', hint: 'Recheck in a warm environment and monitor symptoms.' }
      if (value <= 37.2) return { tone: 'good', status: 'Normal', severity: 'normal', hint: 'No concern from this reading.' }
      if (value <= 38.0) return { tone: 'high', status: 'Elevated', severity: 'warning', hint: 'Monitor for fever symptoms and hydrate well.' }
      return { tone: 'high', status: 'High', severity: 'critical', hint: 'Monitor for fever symptoms and hydrate well.' }
    }

    if (key === 'bp') {
      const systolic = Number(String(rawValue).split('/')[0])
      if (!Number.isFinite(systolic)) {
        return { tone: 'unknown', status: 'Not available', severity: 'warning', hint: 'Use a value like 120/80 for blood pressure logs.' }
      }
      if (systolic < 90) return { tone: 'low', status: 'Low', severity: 'warning', hint: 'Track dizziness/fatigue and consult if recurring.' }
      if (systolic <= 130) return { tone: 'good', status: 'Normal', severity: 'normal', hint: 'Keep up healthy routine and regular checks.' }
      if (systolic <= 160) return { tone: 'high', status: 'Elevated', severity: 'warning', hint: 'Track daily and seek medical guidance for sustained highs.' }
      return { tone: 'high', status: 'High', severity: 'critical', hint: 'Track daily and seek medical guidance for sustained highs.' }
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
  const avatarInitial = (displayName || 'U').charAt(0).toUpperCase()
  const summaryCards = [
    { key: 'reports', icon: '📄', label: 'Reports', value: String(reportCount) },
    { key: 'logs', icon: '📈', label: 'Recent Logs', value: String(recentLogs.length) },
    { key: 'status', icon: '🟢', label: 'Status', value: healthStatus.status },
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
            <Text style={styles.logoText}>A</Text>
          </View>
          <View>
            <Text style={styles.brandName}>ARISE</Text>
            <Text style={styles.brandSubtitle}>Health Companion</Text>
          </View>
        </View>

        <View style={styles.avatarWrap}>
          <Text style={styles.avatarText}>{avatarInitial}</Text>
        </View>
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
          {summaryCards.map((card) => (
            <View key={card.key} style={styles.summaryCard}>
              <View style={styles.summaryIconWrap}>
                <Text style={styles.summaryIcon}>{card.icon}</Text>
              </View>
              <Text style={styles.summaryLabel}>{card.label}</Text>
              <Text style={styles.summaryValue}>{card.value}</Text>
            </View>
          ))}
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
                  { borderColor: severity.softBorder },
                  selectedMetric === metric.key && styles.metricCardActive,
                  selectedMetric === metric.key && {
                    backgroundColor: severity.bg,
                    borderColor: severity.border,
                  },
                  hovered && styles.metricCardHover,
                  (pressed || hovered) && styles.metricCardPressed,
                  {
                    transform: [{ translateY: hovered ? -2 : 0 }, { scale: pressed ? 0.985 : 1 }],
                  },
                ]}
                onPress={() => setSelectedMetric(selectedMetric === metric.key ? null : metric.key)}
              >
                <View style={styles.metricTopRow}>
                  <View style={styles.metricHeader}>
                    <View style={[styles.metricIconBubble, { backgroundColor: severity.bg, borderColor: severity.border }]}>
                      <Text style={styles.metricIcon}>{metric.emoji}</Text>
                    </View>
                    <Text style={styles.metricLabel}>{metric.label}</Text>
                  </View>
                  <View style={[styles.metricStatusPill, { backgroundColor: severity.bg, borderColor: severity.border }]}>
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
                          transform: [{ translateY: hovered ? -1 : 0 }, { scale: pressed ? 0.995 : 1 }],
                        },
                      ]}
                    >
                      <View style={styles.logHeader}>
                        <Text style={styles.logDate}>
                          {formatDate(log.created_at)}
                        </Text>
                        <View style={styles.logStatusChip}>
                          <Text style={styles.logStatusText}>Logged</Text>
                        </View>
                      </View>

                      <View style={styles.logMetrics}>
                        <View style={styles.logMetric}>
                          <Text style={styles.logMetricLabel}>HR</Text>
                          <Text style={styles.logMetricValue}>
                            {log.heart_rate ?? '-'}
                          </Text>
                        </View>

                        <View style={styles.logMetric}>
                          <Text style={styles.logMetricLabel}>BP</Text>
                          <Text style={styles.logMetricValue}>
                            {log.blood_pressure ?? '-'}
                          </Text>
                        </View>

                        <View style={styles.logMetric}>
                          <Text style={styles.logMetricLabel}>Sugar</Text>
                          <Text style={styles.logMetricValue}>
                            {log.blood_sugar ?? '-'}
                          </Text>
                        </View>

                        <View style={styles.logMetric}>
                          <Text style={styles.logMetricLabel}>Temp</Text>
                          <Text style={styles.logMetricValue}>
                            {log.temperature ?? '-'}
                          </Text>
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
    backgroundColor: '#0f766e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoText: {
    color: '#ffffff',
    fontWeight: '900',
    fontSize: 16,
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
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#86efac',
    justifyContent: 'center',
    alignItems: 'center',
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
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryIcon: {
    fontSize: 13,
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
    marginBottom: 8,
    fontWeight: '600',
  },
  metricsGrid: {
    display: 'none',
  },
  metricsRow: {
    gap: 8,
    paddingRight: 12,
  },
  metricCard: {
    width: Math.min(width * 0.42, 172),
    minWidth: 148,
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 10,
    borderWidth: 1.5,
    borderColor: SOFT_BORDER_COLOR,
    elevation: 2,
    ...INTERACTIVE_CARD_SHADOW,
  },
  metricCardHover: {
    borderColor: '#bfd4ef',
  },
  metricCardPressed: {
    opacity: 0.96,
  },
  metricCardActive: {
    borderColor: '#1e5a4a',
    backgroundColor: '#f0fdf9',
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
    gap: 6,
    flex: 1,
  },
  metricIconBubble: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricIcon: {
    fontSize: 14,
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#708198',
  },
  metricStatusPill: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  metricStatusText: {
    fontSize: 8,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  metricValue: {
    fontSize: 24,
    fontWeight: '900',
    color: '#1e5a4a',
    marginBottom: 2,
  },
  metricUnit: {
    fontSize: 9,
    fontWeight: '500',
    color: '#8fa0b5',
    marginBottom: 2,
  },
  metricQuickStatus: {
    fontSize: 9,
    fontWeight: '600',
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
    gap: 8,
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
  },
  timelineRail: {
    width: 16,
    alignItems: 'center',
    position: 'relative',
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#0f766e',
    marginTop: 14,
    borderWidth: 2,
    borderColor: '#ccfbf1',
  },
  timelineLine: {
    position: 'absolute',
    top: 26,
    bottom: -14,
    width: 2,
    backgroundColor: '#cbd5e1',
  },
  logCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: SOFT_BORDER_COLOR,
    padding: 8,
    ...PREMIUM_CARD_SHADOW,
  },
  logCardHover: {
    borderColor: '#c7d9ee',
  },
  logCardPressed: {
    opacity: 0.98,
  },
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  logDate: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0b1220',
  },
  logStatusChip: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#86efac',
  },
  logStatusText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#166534',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  logMetrics: {
    flexDirection: 'row',
    gap: 6,
  },
  logMetric: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    padding: 8,
    alignItems: 'center',
  },
  logMetricLabel: {
    fontSize: 9,
    fontWeight: '500',
    color: '#7b8a9d',
    marginBottom: 1,
  },
  logMetricValue: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0b1220',
  },
  footerSpacing: {
    height: 12,
  },
})