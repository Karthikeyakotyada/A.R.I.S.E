import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Animated,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { useAuth } from '../context/AuthContext'
import { useDialog } from '../context/DialogContext'
import { useToast } from '../context/ToastContext'
import { supabase } from '../lib/supabaseClient'
import { RANGES, getStatusForValue } from '../lib/cbcAnalyzer'
import { formatDate, getStoragePath } from '../lib/helpers'
import {
  analyzeExistingReport,
  inferFileType,
  REPORT_ANALYSIS_STATUS,
  REPORT_STATUS_META,
  resolveReportStatus,
} from '../lib/reportAnalysisService'
import { isDeviceOnline, toFriendlyError } from '../lib/network'
import { Card, EmptyState, PrimaryButton, Screen, SkeletonLine, Subtle } from '../components/ui'
import PageHeader from '../components/PageHeader'
import AnimatedListItem from '../components/AnimatedListItem'
import InlineBanner from '../components/InlineBanner'
import MedicalDisclaimer from '../components/MedicalDisclaimer'
import { typography } from '../lib/typography'
import { useTheme } from '../context/ThemeContext'
import {
  getCardShadowStyle,
  getReportStatusBadgeColors,
  getSeverityPalette,
  isDarkTheme,
} from '../lib/themeUi'

const USE_NATIVE_DRIVER = Platform.OS !== 'web'

function hasDetectedValues(analysis) {
  if (!analysis) return false
  const fields = ['hemoglobin', 'rbc', 'wbc', 'platelets', 'mcv', 'mch', 'mchc', 'neutrophils', 'lymphocytes', 'esr']
  const sources = [analysis, analysis?.cbc_values].filter(Boolean)
  return sources.some((source) =>
    fields.some((field) => {
      const value = Number(source[field])
      return Number.isFinite(value) && value > 0
    })
  )
}

function parseAiSummary(summary) {
  if (!summary) return null
  const fallback = (message) => ({
    mainInsight: {
      title: 'Summary',
      message,
      severity: 'normal',
    },
    bullets: [],
    suggestions: [],
  })

  if (typeof summary === 'object') {
    if (summary.mainInsight && typeof summary.mainInsight === 'object') return summary
    return fallback('Analysis completed.')
  }

  const raw = String(summary).trim()
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw)
    if (parsed?.mainInsight && typeof parsed.mainInsight === 'object') {
      return parsed
    }
  } catch (_error) {
  }

  return fallback(raw)
}

function getInsightSeverityStyle(theme, severity) {
  const dark = isDarkTheme(theme)
  const key = String(severity || 'normal').toLowerCase()
  if (key === 'high') {
    return {
      bg: dark ? 'rgba(220, 38, 38, 0.14)' : '#FEE2E2',
      border: dark ? 'rgba(248, 113, 113, 0.28)' : '#fca5a5',
      text: dark ? '#FCA5A5' : '#b91c1c',
    }
  }
  if (key === 'moderate') {
    return {
      bg: dark ? 'rgba(245, 158, 11, 0.12)' : '#FFF3CD',
      border: dark ? 'rgba(251, 191, 36, 0.28)' : '#fdba74',
      text: dark ? '#FCD34D' : '#9a3412',
    }
  }
  if (key === 'low') {
    return {
      bg: dark ? 'rgba(24, 182, 255, 0.12)' : '#E0F2FE',
      border: dark ? 'rgba(56, 189, 248, 0.28)' : '#93c5fd',
      text: dark ? '#7DD3FC' : '#1e40af',
    }
  }
  return {
    bg: dark ? 'rgba(39, 225, 193, 0.1)' : '#DCFCE7',
    border: dark ? 'rgba(39, 225, 193, 0.28)' : '#86efac',
    text: dark ? '#7CEBDC' : '#166534',
  }
}

function getMetricPalette(theme, status) {
  if (status === 'normal') return getSeverityPalette(theme, 'normal')
  if (status === 'high') return getSeverityPalette(theme, 'critical')
  if (status === 'low') return getSeverityPalette(theme, 'warning')
  return {
    bg: theme.colors.elevated,
    border: theme.colors.borderSubtle,
    text: theme.colors.muted,
    value: theme.colors.textSecondary,
    softBorder: theme.colors.borderSubtle,
    tint: theme.colors.elevated,
  }
}

function formatFieldLabel(field) {
  return String(field || '')
    .replace(/_/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ')
}

function safeDisplayText(value) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return ''
  }
}

function formatFieldValue(field, value, unit) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return 'Not found'

  const raw = String(n).replace(/\.0+$/, '')

  if (field === 'hemoglobin' || field === 'rbc') {
    return `${raw}${unit ? ` ${unit}` : ''}`
  }

  if (field === 'mcv' || field === 'mch' || field === 'mchc' || field === 'esr') {
    return `${raw}${unit ? ` ${unit}` : ''}`
  }

  if (field === 'neutrophils' || field === 'lymphocytes') {
    return `${raw}${unit ? ` ${unit}` : '%'}`
  }

  return `${raw}${unit ? ` ${unit}` : ''}`
}

function Metric({ label, value, field, theme, styles }) {
  const status = value !== null && value !== undefined ? getStatusForValue(value, field) : 'unknown'
  const palette = getMetricPalette(theme, status)
  const unit = RANGES[field]?.unit || ''
  const statusLabel = status === 'unknown' ? 'Not detected' : status

  return (
    <Pressable
      style={({ pressed, hovered }) => [
        styles.metric,
        {
          backgroundColor: isDarkTheme(theme) ? palette.tint || palette.bg : palette.bg,
          borderColor: palette.softBorder,
        },
        Platform.OS === 'web' && hovered && styles.metricHovered,
        pressed && styles.metricPressed,
      ]}
    >
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, { color: palette.value }]}>{formatFieldValue(field, value, unit)}</Text>
      <View style={[styles.metricStatusPill, { borderColor: palette.softBorder }]}>
        <Text style={[styles.metricStatusText, { color: palette.text }]}>{statusLabel}</Text>
      </View>
    </Pressable>
  )
}

function ReportStatusBadge({ status, theme, styles }) {
  const meta = REPORT_STATUS_META[status] || REPORT_STATUS_META.uploaded
  const colors = getReportStatusBadgeColors(theme, meta.tone)

  return (
    <View style={[styles.badge, { backgroundColor: colors.bg, borderColor: colors.border }]}>
      <Text style={[styles.badgeText, { color: colors.text }]}>{meta.label}</Text>
    </View>
  )
}

function LoadingSkeleton({ styles }) {
  return (
    <View style={styles.loadingWrap}>
      <Card style={styles.loadingCard}>
        <SkeletonLine width="72%" />
        <SkeletonLine width="40%" />
        <SkeletonLine width="88%" />
      </Card>
      <Card style={styles.loadingCard}>
        <SkeletonLine width="55%" />
        <View style={styles.metricsRow}>
          <View style={styles.metricSkeleton} />
          <View style={styles.metricSkeleton} />
        </View>
        <View style={styles.metricsRow}>
          <View style={styles.metricSkeleton} />
          <View style={styles.metricSkeleton} />
        </View>
      </Card>
    </View>
  )
}

export default function ReportViewerScreen({ route, navigation }) {
  const reportId = route?.params?.reportId ?? null
  const { theme } = useTheme()
  const styles = useMemo(() => createStyles(theme), [theme])
  const { user } = useAuth()
  const { showConfirm, showMessage } = useDialog()
  const { showToast } = useToast()
  const contentOpacity = useRef(new Animated.Value(0)).current
  const insightPulse = useRef(new Animated.Value(0.6)).current

  const [report, setReport] = useState(null)
  const [analysis, setAnalysis] = useState(null)
  const [loading, setLoading] = useState(false)
  const [reanalyzing, setReanalyzing] = useState(false)
  const [banner, setBanner] = useState(null)
  const [status, setStatus] = useState(REPORT_ANALYSIS_STATUS.UPLOADED)
  const [online, setOnline] = useState(true)

  const structuredSummary = parseAiSummary(analysis?.ai_summary)
  const healthScore = Number(analysis?.health_score)
  const hasHealthScore = Number.isFinite(healthScore)

  const pickValue = (...sources) => {
    for (const source of sources) {
      if (source !== null && source !== undefined) return source
    }
    return null
  }

  const cbcValues = {
    hemoglobin: pickValue(analysis?.hemoglobin, report?.hemoglobin, analysis?.cbc_values?.hemoglobin, report?.cbc_values?.hemoglobin),
    rbc: pickValue(analysis?.rbc, report?.rbc, analysis?.cbc_values?.rbc, report?.cbc_values?.rbc),
    wbc: pickValue(analysis?.wbc, report?.wbc, analysis?.cbc_values?.wbc, report?.cbc_values?.wbc),
    platelets: pickValue(analysis?.platelets, report?.platelets, analysis?.cbc_values?.platelets, report?.cbc_values?.platelets),
    mcv: pickValue(analysis?.mcv, report?.mcv, analysis?.cbc_values?.mcv, report?.cbc_values?.mcv),
    mch: pickValue(analysis?.mch, report?.mch, analysis?.cbc_values?.mch, report?.cbc_values?.mch),
    mchc: pickValue(analysis?.mchc, report?.mchc, analysis?.cbc_values?.mchc, report?.cbc_values?.mchc),
    neutrophils: pickValue(analysis?.neutrophils, report?.neutrophils, analysis?.cbc_values?.neutrophils, report?.cbc_values?.neutrophils),
    lymphocytes: pickValue(analysis?.lymphocytes, report?.lymphocytes, analysis?.cbc_values?.lymphocytes, report?.cbc_values?.lymphocytes),
    esr: pickValue(analysis?.esr, report?.esr, analysis?.cbc_values?.esr, report?.cbc_values?.esr),
  }

  const visibleCbcValues = Object.entries(cbcValues).filter(([, value]) => value !== null && value !== undefined)

  useEffect(() => {
    if (!report || loading) return
    contentOpacity.setValue(0)
    Animated.timing(contentOpacity, {
      toValue: 1,
      duration: 320,
      useNativeDriver: USE_NATIVE_DRIVER,
    }).start()
  }, [report?.id, loading, contentOpacity])

  useEffect(() => {
    if (!structuredSummary) return
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(insightPulse, { toValue: 1, duration: 1800, useNativeDriver: USE_NATIVE_DRIVER }),
        Animated.timing(insightPulse, { toValue: 0.6, duration: 1800, useNativeDriver: USE_NATIVE_DRIVER }),
      ])
    )
    loop.start()
    return () => loop.stop()
  }, [structuredSummary, insightPulse])

  const handleOpenOriginalReport = useCallback(async () => {
    const url = report?.file_url
    if (!url) {
      showToast('Report link is missing.', 'warning')
      setBanner({ tone: 'warning', message: 'Report file URL is missing.' })
      return
    }

    try {
      const canOpen = await Linking.canOpenURL(url)
      if (!canOpen) {
        showToast('Cannot open this report link.', 'error')
        setBanner({ tone: 'error', message: 'Cannot open the report URL on this device.' })
        return
      }

      await Linking.openURL(url)
    } catch (error) {
      console.error('[ARISE] Failed to open report URL:', error)
      showToast('Failed to open the original report.', 'error')
      setBanner({ tone: 'error', message: 'Failed to open the original report.' })
    }
  }, [report?.file_url, showToast])

  const fetchData = useCallback(async () => {
    if (!user || !reportId) return
    setLoading(true)
    try {
      const connected = await isDeviceOnline()
      setOnline(connected)

      const [{ data: reportData, error: reportError }, { data: analysisData }] = await Promise.all([
        supabase
          .from('reports')
          .select('*')
          .eq('id', reportId)
          .eq('user_id', user.id)
          .single(),
        supabase
          .from('report_analysis')
          .select('*')
          .eq('report_id', reportId)
          .order('analyzed_at', { ascending: false })
          .limit(1),
      ])

      if (reportError) {
        await showMessage({ title: 'Load Failed', message: reportError.message, tone: 'error' })
        navigation.goBack()
        return
      }

      const latest = analysisData?.[0] ?? null
      setReport(reportData)
      setAnalysis(latest)
      setStatus(resolveReportStatus(reportData, latest))
    } finally {
      setLoading(false)
    }
  }, [navigation, reportId, user, showMessage])

  useFocusEffect(
    useCallback(() => {
      fetchData()
    }, [fetchData])
  )

  if (!reportId) {
    return (
      <Screen tabBarInset={false}>
        <Card>
          <EmptyState
            title="Missing Report"
            subtitle="No report ID was provided for this screen."
          />
          <PrimaryButton title="Go Back" onPress={() => navigation.goBack()} />
        </Card>
      </Screen>
    )
  }

  async function handleReanalyze() {
    if (!report) return

    const connected = await isDeviceOnline()
    setOnline(connected)
    if (!connected) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
      showToast("You're offline or connection is unstable", 'warning')
      setBanner({ tone: 'warning', message: "You're offline or connection is unstable" })
      return
    }

    const filePath = getStoragePath(report.file_url)
    if (!filePath) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
      showToast('Cannot locate file for analysis.', 'warning')
      setBanner({ tone: 'warning', message: 'Cannot locate file path for re-analysis.' })
      await showMessage({ title: 'Error', message: 'Cannot determine file path for re-analysis.', tone: 'warning' })
      return
    }

    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    setReanalyzing(true)
    setStatus(REPORT_ANALYSIS_STATUS.PENDING)
    await supabase.from('report_analysis').delete().eq('report_id', report.id)

    const result = await analyzeExistingReport({
      reportId: report.id,
      filePath,
      fileType: inferFileType(report.file_name),
      timeoutMs: 35000,
    })

    setReanalyzing(false)

    if (!result.success || !hasDetectedValues(result.data)) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      setStatus(REPORT_ANALYSIS_STATUS.FAILED)
      const fallbackReason = !hasDetectedValues(result.data)
        ? 'No CBC values were detected from this report. Please upload a clearer PDF and retry.'
        : result.error
      const errorMessage = toFriendlyError(fallbackReason, 'Re-analysis failed. Please try again.')
      showToast(errorMessage, 'error')
      setBanner({ tone: 'error', message: errorMessage })
      await showMessage({ title: 'Analysis Failed', message: errorMessage, tone: 'error' })
      return
    }

    setStatus(REPORT_ANALYSIS_STATUS.COMPLETE)
    setAnalysis(result.data)
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    showToast('Report re-analyzed.', 'success')
    setBanner({ tone: 'success', message: 'Report re-analyzed successfully.' })
    await showMessage({ title: 'Done', message: 'Report re-analyzed successfully.', tone: 'success' })
  }

  async function handleDelete() {
    if (!report || !user) return

    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)
    const ok = await showConfirm({
      title: 'Delete Report',
      message: `Delete ${report.file_name}?\n\nThis will remove report and analysis.`,
      tone: 'warning',
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
    })
    if (!ok) return

    const filePath = getStoragePath(report.file_url)
    await supabase.from('report_analysis').delete().eq('report_id', report.id)
    if (filePath) await supabase.storage.from('cbc-reports').remove([filePath])

    const { error } = await supabase
      .from('reports')
      .delete()
      .eq('id', report.id)
      .eq('user_id', user.id)

    if (error) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      showToast('Delete failed.', 'error')
      setBanner({ tone: 'error', message: 'Delete failed. Please try again.' })
      await showMessage({ title: 'Delete Failed', message: error.message, tone: 'error' })
      return
    }

    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    showToast('Report removed.', 'success')
    await showMessage({ title: 'Deleted', message: 'Report removed.', tone: 'success' })
    navigation.goBack()
  }

  if (!report || loading) {
    return (
      <Screen tabBarInset={false}>
        <LoadingSkeleton styles={styles} />
      </Screen>
    )
  }

  const insightSeverity = getInsightSeverityStyle(theme, structuredSummary?.mainInsight?.severity || 'normal')

  return (
    <Screen refreshing={loading} onRefresh={fetchData} tabBarInset={false}>
      <Animated.View style={{ opacity: contentOpacity }}>
        <PageHeader
          eyebrow="Reports"
          title="Report Details"
          subtitle={report.file_name}
          showTopBar={false}
        />

        {!online ? <InlineBanner tone="warning" message="You're offline or connection is unstable" /> : null}
        {banner ? <InlineBanner tone={banner.tone} message={banner.message} /> : null}

        <AnimatedListItem index={0}>
          <Card style={styles.metaCard}>
            <Text style={styles.fileName}>{report.file_name}</Text>
            <Subtle>{formatDate(report.uploaded_at)}</Subtle>
            <View style={styles.statusRow}>
              <ReportStatusBadge status={status} theme={theme} styles={styles} />
              {status === REPORT_ANALYSIS_STATUS.PENDING ? (
                <ActivityIndicator size="small" color={theme.colors.accentWarm || '#f59e0b'} />
              ) : null}
            </View>

            <View style={styles.actionGroup}>
              <PrimaryButton title="Open Original Report" onPress={handleOpenOriginalReport} />
              <PrimaryButton
                title={reanalyzing ? 'Re-analyzing...' : 'Run AI Analysis Again'}
                onPress={handleReanalyze}
                loading={reanalyzing}
                disabled={!online}
              />
              <PrimaryButton
                title="Remove Report"
                onPress={handleDelete}
                style={styles.dangerButton}
              />
            </View>
          </Card>
        </AnimatedListItem>

        <AnimatedListItem index={1}>
          <Card style={styles.analysisCard}>
            <View style={styles.sectionHeader}>
              <MaterialCommunityIcons name="brain" size={20} color={theme.colors.primary} />
              <Text style={styles.section}>AI Analysis</Text>
            </View>

            {status === REPORT_ANALYSIS_STATUS.PENDING ? (
              <View style={styles.pendingWrap}>
                <ActivityIndicator size="small" color={theme.colors.accentWarm || '#f59e0b'} />
                <Subtle>Analysis in progress. Pull to refresh after a few seconds.</Subtle>
              </View>
            ) : null}

            {status === REPORT_ANALYSIS_STATUS.FAILED ? (
              <View style={styles.pendingWrap}>
                <Subtle>
                  Analysis could not find reliable CBC values. Retry with a clear report that includes patient result values.
                </Subtle>
                <PrimaryButton
                  title={reanalyzing ? 'Retrying...' : 'Retry AI Analysis'}
                  onPress={handleReanalyze}
                  disabled={reanalyzing || !online}
                  loading={reanalyzing}
                />
              </View>
            ) : null}

            {!analysis && status !== REPORT_ANALYSIS_STATUS.PENDING && status !== REPORT_ANALYSIS_STATUS.FAILED ? (
              <EmptyState
                title="No analysis yet"
                subtitle="Tap Run AI Analysis Again to generate CBC insights for this report."
              />
            ) : null}

            {analysis ? (
              <>
                <Text style={styles.subSection}>Detected CBC Values</Text>
                {visibleCbcValues.length > 0 ? (
                  <View style={styles.metricsRow}>
                    {visibleCbcValues.map(([field, value]) => (
                      <Metric
                        key={field}
                        label={formatFieldLabel(field)}
                        value={value}
                        field={field}
                        theme={theme}
                        styles={styles}
                      />
                    ))}
                  </View>
                ) : (
                  <EmptyState
                    title="No CBC values detected"
                    subtitle="The report data is available, but no analyzable CBC values were found for display."
                  />
                )}
              </>
            ) : null}
          </Card>
        </AnimatedListItem>

        {structuredSummary ? (
          <AnimatedListItem index={2}>
            <Animated.View
              style={[
                styles.insightPanel,
                {
                  opacity: insightPulse.interpolate({
                    inputRange: [0.6, 1],
                    outputRange: [0.97, 1],
                  }),
                },
              ]}
            >
              <View style={styles.insightGlow} pointerEvents="none" />
              <View style={styles.insightHeader}>
                <View style={styles.insightTitleRow}>
                  <MaterialCommunityIcons name="creation" size={18} color={theme.colors.accentSecondary} />
                  <Text style={styles.insightTitle}>AI Health Insights</Text>
                </View>
                <View style={styles.insightBadges}>
                  {hasHealthScore ? (
                    <View style={styles.scoreBadge}>
                      <Text style={styles.scoreBadgeLabel}>Score</Text>
                      <Text style={styles.scoreBadgeValue}>{healthScore}</Text>
                    </View>
                  ) : null}
                  <View
                    style={[
                      styles.severityBadge,
                      {
                        backgroundColor: insightSeverity.bg,
                        borderColor: insightSeverity.border,
                      },
                    ]}
                  >
                    <Text style={[styles.severityText, { color: insightSeverity.text }]}>
                      {String(structuredSummary?.mainInsight?.severity || 'normal').toUpperCase()}
                    </Text>
                  </View>
                </View>
              </View>

              <Text style={styles.summaryHeadline}>
                {structuredSummary?.mainInsight?.title || 'Summary'}
              </Text>
              <Text style={styles.summaryMessage}>
                {safeDisplayText(structuredSummary?.mainInsight?.message)}
              </Text>

              {Array.isArray(structuredSummary?.bullets) && structuredSummary.bullets.length > 0 ? (
                <View style={styles.bulletsWrap}>
                  {structuredSummary.bullets.map((bullet, idx) => (
                    <View key={`${bullet}-${idx}`} style={styles.bulletRow}>
                      <View style={styles.bulletDot} />
                      <Text style={styles.bulletText}>{safeDisplayText(bullet)}</Text>
                    </View>
                  ))}
                </View>
              ) : null}

              {Array.isArray(structuredSummary?.suggestions) && structuredSummary.suggestions.length > 0 ? (
                <>
                  <Text style={styles.recommendationsTitle}>Recommendations</Text>
                  <View style={styles.suggestionsWrap}>
                    {structuredSummary.suggestions.map((item, idx) => (
                      <View key={`${item?.title || 'suggestion'}-${idx}`} style={styles.suggestionItem}>
                        <MaterialCommunityIcons
                          name="lightbulb-on-outline"
                          size={16}
                          color={theme.colors.accentSecondary}
                          style={styles.suggestionIcon}
                        />
                        <View style={styles.suggestionContent}>
                          <Text style={styles.suggestionTitle}>{safeDisplayText(item?.title)}</Text>
                          <Text style={styles.suggestionDescription}>{safeDisplayText(item?.description)}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                </>
              ) : null}

              {structuredSummary?.confidenceNote ? (
                <Text style={styles.confidenceNote}>{safeDisplayText(structuredSummary.confidenceNote)}</Text>
              ) : null}
            </Animated.View>
          </AnimatedListItem>
        ) : null}

        <AnimatedListItem index={structuredSummary ? 3 : 2}>
          <MedicalDisclaimer />
        </AnimatedListItem>
      </Animated.View>
    </Screen>
  )
}

function createStyles(theme) {
  const dark = isDarkTheme(theme)
  return StyleSheet.create({
    loadingWrap: {
      gap: 14,
    },
    loadingCard: {
      gap: 10,
    },
    metricSkeleton: {
      width: '48%',
      height: 88,
      borderRadius: theme.radius.md,
      backgroundColor: theme.colors.skeleton,
    },
    metaCard: {
      gap: 10,
      marginBottom: 4,
    },
    analysisCard: {
      gap: 12,
      marginBottom: 4,
    },
    actionGroup: {
      gap: 10,
      marginTop: 6,
    },
    dangerButton: {
      backgroundColor: dark ? 'rgba(239, 68, 68, 0.88)' : '#dc2626',
    },
    fileName: {
      fontSize: 18,
      ...typography.style.extraBold,
      color: theme.colors.text,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 2,
    },
    section: {
      fontSize: 17,
      ...typography.style.extraBold,
      color: theme.colors.text,
    },
    subSection: {
      fontSize: 11,
      color: theme.colors.textSecondary,
      ...typography.style.extraBold,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginTop: 4,
      marginBottom: 10,
    },
    metricsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    statusRow: {
      flexDirection: 'row',
      gap: 8,
      alignItems: 'center',
      marginTop: 4,
    },
    badge: {
      borderWidth: 1,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 3,
    },
    badgeText: {
      ...typography.style.extraBold,
      fontSize: 11,
      textTransform: 'uppercase',
      letterSpacing: 0.3,
    },
    metric: {
      width: '48%',
      flexGrow: 1,
      minWidth: 148,
      borderWidth: dark ? 1 : 1,
      borderRadius: theme.radius.md,
      paddingVertical: 12,
      paddingHorizontal: 12,
      gap: 4,
      ...getCardShadowStyle(theme),
    },
    metricHovered: {
      ...(Platform.OS === 'web' && dark
        ? { boxShadow: '0px 14px 36px rgba(0,0,0,0.45), 0px 0px 20px rgba(39, 225, 193, 0.1)' }
        : {}),
      transform: [{ translateY: -2 }],
    },
    metricPressed: {
      opacity: 0.92,
    },
    metricLabel: {
      color: theme.colors.textSecondary,
      ...typography.style.semiBold,
      fontSize: 11,
      letterSpacing: 0.2,
    },
    metricValue: {
      ...typography.style.extraBold,
      fontSize: 22,
      lineHeight: 26,
      marginTop: 2,
    },
    metricStatusPill: {
      alignSelf: 'flex-start',
      marginTop: 6,
      borderWidth: 1,
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 2,
      backgroundColor: dark ? 'rgba(17, 28, 36, 0.5)' : 'rgba(255,255,255,0.6)',
    },
    metricStatusText: {
      fontSize: 10,
      ...typography.style.bold,
      textTransform: 'capitalize',
    },
    pendingWrap: {
      gap: 10,
      paddingVertical: 4,
    },
    insightPanel: {
      marginBottom: 14,
      borderRadius: theme.radius.card,
      padding: 16,
      gap: 12,
      backgroundColor: dark ? 'rgba(22, 35, 45, 0.85)' : theme.colors.card,
      borderWidth: dark ? 1 : theme.ui.cardBorderWidth,
      borderColor: dark ? 'rgba(39, 225, 193, 0.18)' : theme.colors.borderSubtle,
      overflow: 'hidden',
      position: 'relative',
      ...getCardShadowStyle(theme),
      ...(Platform.OS === 'web' && dark
        ? { boxShadow: '0px 16px 40px rgba(0,0,0,0.42), 0px 0px 28px rgba(39, 225, 193, 0.06)' }
        : {}),
    },
    insightGlow: {
      position: 'absolute',
      top: -40,
      right: -30,
      width: 120,
      height: 120,
      borderRadius: 60,
      backgroundColor: dark ? 'rgba(39, 225, 193, 0.08)' : 'rgba(16, 185, 129, 0.06)',
      pointerEvents: 'none',
    },
    insightHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: 10,
    },
    insightTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flex: 1,
    },
    insightTitle: {
      ...typography.style.extraBold,
      fontSize: 16,
      color: theme.colors.text,
    },
    insightBadges: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flexShrink: 0,
    },
    scoreBadge: {
      alignItems: 'center',
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 6,
      backgroundColor: dark ? 'rgba(24, 182, 255, 0.12)' : '#e0f2fe',
      borderWidth: 1,
      borderColor: dark ? 'rgba(56, 189, 248, 0.28)' : '#93c5fd',
    },
    scoreBadgeLabel: {
      fontSize: 9,
      ...typography.style.bold,
      color: dark ? '#7DD3FC' : '#1e40af',
      textTransform: 'uppercase',
      letterSpacing: 0.3,
    },
    scoreBadgeValue: {
      fontSize: 18,
      ...typography.style.extraBold,
      color: dark ? '#BAE6FD' : '#0369a1',
      lineHeight: 22,
    },
    severityBadge: {
      borderWidth: 1,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 999,
    },
    severityText: {
      ...typography.style.extraBold,
      fontSize: 10,
      letterSpacing: 0.3,
    },
    summaryHeadline: {
      ...typography.style.extraBold,
      fontSize: 15,
      color: theme.colors.text,
      marginTop: 2,
    },
    summaryMessage: {
      fontSize: 14,
      lineHeight: 21,
      color: theme.colors.textSecondary,
      ...typography.style.regular,
    },
    bulletsWrap: {
      gap: 8,
      marginTop: 2,
    },
    bulletRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
    },
    bulletDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: theme.colors.accentSecondary,
      marginTop: 7,
    },
    bulletText: {
      flex: 1,
      color: theme.colors.text,
      fontSize: 13,
      lineHeight: 19,
      ...typography.style.medium,
    },
    recommendationsTitle: {
      fontSize: 11,
      ...typography.style.extraBold,
      color: theme.colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginTop: 4,
    },
    suggestionsWrap: {
      gap: 8,
    },
    suggestionItem: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      borderWidth: dark ? 0 : 1,
      borderColor: theme.colors.borderSubtle,
      borderRadius: theme.radius.md,
      padding: 12,
      backgroundColor: dark ? 'rgba(15, 26, 34, 0.65)' : theme.colors.elevated,
      ...getCardShadowStyle(theme),
    },
    suggestionIcon: {
      marginTop: 2,
    },
    suggestionContent: {
      flex: 1,
      gap: 3,
    },
    suggestionTitle: {
      ...typography.style.bold,
      color: theme.colors.text,
      fontSize: 13,
    },
    suggestionDescription: {
      fontSize: 12,
      lineHeight: 17,
      color: theme.colors.textSecondary,
      ...typography.style.regular,
    },
    confidenceNote: {
      marginTop: 4,
      fontSize: 11,
      fontStyle: 'italic',
      color: theme.colors.muted,
      lineHeight: 16,
    },
  })
}
