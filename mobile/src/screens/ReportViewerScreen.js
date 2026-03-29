import { useCallback, useState } from 'react'
import { ActivityIndicator, Linking, StyleSheet, Text, View } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import * as Haptics from 'expo-haptics'
import { useAuth } from '../context/AuthContext'
import { useDialog } from '../context/DialogContext'
import { useToast } from '../context/ToastContext'
import { supabase } from '../lib/supabaseClient'
import { getStatusForValue } from '../lib/cbcAnalyzer'
import { formatDate, getStoragePath } from '../lib/helpers'
import { analyzeExistingReport, inferFileType, REPORT_ANALYSIS_STATUS, REPORT_STATUS_META, resolveReportStatus } from '../lib/reportAnalysisService'
import { isDeviceOnline, toFriendlyError } from '../lib/network'
import { Card, EmptyState, PrimaryButton, Screen, SkeletonLine, Subtle } from '../components/ui'
import PageHeader from '../components/PageHeader'
import AnimatedListItem from '../components/AnimatedListItem'
import InlineBanner from '../components/InlineBanner'
import MedicalDisclaimer from '../components/MedicalDisclaimer'

function hasDetectedValues(analysis) {
  if (!analysis) return false
  const fields = ['hemoglobin', 'rbc', 'wbc', 'platelets']
  return fields.some((field) => {
    const value = Number(analysis[field])
    return Number.isFinite(value) && value > 0
  })
}

function Metric({ label, value, field }) {
  const status = value !== null && value !== undefined ? getStatusForValue(value, field) : 'unknown'
  const color = status === 'normal' ? '#16a34a' : status === 'low' ? '#f59e0b' : status === 'high' ? '#ef4444' : '#64748b'

  function formatValue(v, metricField) {
    const n = Number(v)
    if (!Number.isFinite(n) || n <= 0) return 'Not found'
    if (metricField === 'hemoglobin' || metricField === 'rbc') {
      return n.toFixed(2).replace(/\.00$/, '')
    }
    return Math.round(n).toLocaleString('en-IN')
  }

  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, { color }]}>{formatValue(value, field)}</Text>
      <Subtle>{status === 'unknown' ? 'not detected' : status}</Subtle>
    </View>
  )
}

export default function ReportViewerScreen({ route, navigation }) {
  const { reportId } = route.params
  const { user } = useAuth()
  const { showConfirm, showMessage } = useDialog()
  const { showToast } = useToast()

  const [report, setReport] = useState(null)
  const [analysis, setAnalysis] = useState(null)
  const [loading, setLoading] = useState(false)
  const [reanalyzing, setReanalyzing] = useState(false)
  const [banner, setBanner] = useState(null)
  const [status, setStatus] = useState(REPORT_ANALYSIS_STATUS.UPLOADED)
  const [online, setOnline] = useState(true)

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
  }, [navigation, reportId, user])

  useFocusEffect(
    useCallback(() => {
      fetchData()
    }, [fetchData])
  )

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
      <Screen>
        <Card>
          <SkeletonLine width="78%" />
          <SkeletonLine width="48%" />
          <SkeletonLine width="100%" />
        </Card>
      </Screen>
    )
  }

  return (
    <Screen refreshing={loading} onRefresh={fetchData}>
      <PageHeader
        eyebrow="Reports"
        title="Report Details"
        subtitle={report.file_name}
      />

      {!online ? <InlineBanner tone="warning" message="You're offline or connection is unstable" /> : null}
      {banner ? <InlineBanner tone={banner.tone} message={banner.message} /> : null}

      <AnimatedListItem index={0}>
        <Card>
        <Text style={styles.fileName}>{report.file_name}</Text>
        <Subtle>{formatDate(report.uploaded_at)}</Subtle>
        <View style={styles.statusRow}>
          <View style={[
            styles.badge,
            status === REPORT_ANALYSIS_STATUS.COMPLETE
              ? styles.badgeSuccess
              : status === REPORT_ANALYSIS_STATUS.FAILED
                ? styles.badgeError
                : status === REPORT_ANALYSIS_STATUS.PENDING
                  ? styles.badgeWarning
                  : styles.badgeInfo,
          ]}>
            <Text style={styles.badgeText}>{(REPORT_STATUS_META[status] || REPORT_STATUS_META.uploaded).label}</Text>
          </View>
          {status === REPORT_ANALYSIS_STATUS.PENDING ? <ActivityIndicator size="small" color="#d97706" /> : null}
        </View>

        <PrimaryButton title="Open Original Report" onPress={() => Linking.openURL(report.file_url)} />
        <PrimaryButton title={reanalyzing ? 'Re-analyzing...' : 'Run AI Analysis Again'} onPress={handleReanalyze} loading={reanalyzing} disabled={!online} />
        <PrimaryButton title="Remove Report" onPress={handleDelete} style={{ backgroundColor: '#dc2626' }} />
        </Card>
      </AnimatedListItem>

      <AnimatedListItem index={1}>
        <Card>
        <Text style={styles.section}>AI Analysis</Text>
        {status === REPORT_ANALYSIS_STATUS.PENDING ? (
          <View style={styles.pendingWrap}>
            <ActivityIndicator size="small" color="#d97706" />
            <Subtle>Analysis in progress. Pull to refresh after a few seconds.</Subtle>
          </View>
        ) : null}

        {status === REPORT_ANALYSIS_STATUS.FAILED ? (
          <View style={styles.pendingWrap}>
            <Subtle>Analysis could not find reliable CBC values. Retry with a clear report that includes patient result values.</Subtle>
            <PrimaryButton
              title={reanalyzing ? 'Retrying...' : 'Retry AI Analysis'}
              onPress={handleReanalyze}
              disabled={reanalyzing || !online}
              loading={reanalyzing}
            />
          </View>
        ) : null}

        {!analysis && status !== REPORT_ANALYSIS_STATUS.PENDING && status !== REPORT_ANALYSIS_STATUS.FAILED ? (
          <EmptyState title="No analysis yet" subtitle="Tap Run AI Analysis Again to generate CBC insights for this report." />
        ) : null}

        {analysis ? (
          <>
            <Text style={styles.subSection}>Detected CBC Values</Text>
            <View style={styles.metricsRow}>
              <Metric label="Hemoglobin" value={analysis.hemoglobin} field="hemoglobin" />
              <Metric label="RBC" value={analysis.rbc} field="rbc" />
              <Metric label="WBC" value={analysis.wbc} field="wbc" />
              <Metric label="Platelets" value={analysis.platelets} field="platelets" />
            </View>
          </>
        ) : null}

        {analysis?.health_score !== null && analysis?.health_score !== undefined ? (
          <Text style={styles.score}>Health Score: {analysis.health_score}/100</Text>
        ) : null}

        {analysis?.ai_summary ? (
          <>
            <Text style={styles.subSection}>Summary</Text>
            <Subtle>{analysis.ai_summary}</Subtle>
          </>
        ) : null}

        <MedicalDisclaimer />
        </Card>
      </AnimatedListItem>
    </Screen>
  )
}

const styles = StyleSheet.create({
  fileName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
  },
  section: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 6,
  },
  subSection: {
    fontSize: 13,
    color: '#475569',
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginTop: 8,
    marginBottom: 2,
  },
  metricsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statusRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  badge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  badgeText: {
    fontWeight: '800',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  badgeSuccess: {
    backgroundColor: '#dcfce7',
    borderColor: '#86efac',
  },
  badgeError: {
    backgroundColor: '#fee2e2',
    borderColor: '#fca5a5',
  },
  badgeWarning: {
    backgroundColor: '#ffedd5',
    borderColor: '#fdba74',
  },
  badgeInfo: {
    backgroundColor: '#e0f2fe',
    borderColor: '#93c5fd',
  },
  metric: {
    width: '48%',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    padding: 8,
    gap: 2,
  },
  metricLabel: {
    color: '#475569',
    fontWeight: '700',
    fontSize: 12,
  },
  metricValue: {
    fontWeight: '800',
    fontSize: 16,
  },
  score: {
    fontWeight: '800',
    color: '#0f172a',
    marginTop: 8,
  },
  pendingWrap: {
    gap: 8,
  },
})
