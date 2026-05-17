import { useCallback, useState } from 'react'
import { ActivityIndicator, Linking, StyleSheet, Text, View } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import * as Haptics from 'expo-haptics'
import { useAuth } from '../context/AuthContext'
import { useDialog } from '../context/DialogContext'
import { useToast } from '../context/ToastContext'
import { supabase } from '../lib/supabaseClient'
import { RANGES, getStatusForValue } from '../lib/cbcAnalyzer'
import { formatDate, getStoragePath } from '../lib/helpers'
import { analyzeExistingReport, inferFileType, REPORT_ANALYSIS_STATUS, REPORT_STATUS_META, resolveReportStatus } from '../lib/reportAnalysisService'
import { isDeviceOnline, toFriendlyError } from '../lib/network'
import { Card, EmptyState, PrimaryButton, Screen, SkeletonLine, Subtle } from '../components/ui'
import PageHeader from '../components/PageHeader'
import AnimatedListItem from '../components/AnimatedListItem'
import InlineBanner from '../components/InlineBanner'
import MedicalDisclaimer from '../components/MedicalDisclaimer'
import { typography } from '../lib/typography'

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

function severityColor(severity) {
  if (severity === 'high') return '#dc2626'
  if (severity === 'moderate') return '#d97706'
  if (severity === 'low') return '#0284c7'
  return '#16a34a'
}

function severityBackgroundColor(severity) {
  if (severity === 'high') return '#FEE2E2'
  if (severity === 'moderate') return '#FFF3CD'
  if (severity === 'low') return '#E0F2FE'
  return '#DCFCE7'
}

function formatFieldLabel(field) {
  return String(field || '')
    .replace(/_/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((part) => part.toUpperCase())
    .join(' ')
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

function Metric({ label, value, field }) {
  const status = value !== null && value !== undefined ? getStatusForValue(value, field) : 'unknown'
  const color = status === 'normal' ? '#16a34a' : status === 'low' ? '#f59e0b' : status === 'high' ? '#ef4444' : '#64748b'
  const unit = RANGES[field]?.unit || ''

  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, { color }]}>{formatFieldValue(field, value, unit)}</Text>
      <Subtle>{status === 'unknown' ? 'not detected' : status}</Subtle>
    </View>
  )
}

export default function ReportViewerScreen({ route, navigation }) {
  const reportId = route?.params?.reportId ?? null
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

  const structuredSummary = parseAiSummary(analysis?.ai_summary)
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
      console.log('[DEBUG] ReportViewer fetched report:', reportData)
      console.log('[DEBUG] ReportViewer fetched analysis (latest):', latest)
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

  if (!reportId) {
    return (
      <Screen>
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
        showTopBar={false}
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

        <PrimaryButton title="Open Original Report" onPress={handleOpenOriginalReport} />
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
            {visibleCbcValues.length > 0 ? (
              <View style={styles.metricsRow}>
                {visibleCbcValues.map(([field, value]) => (
                  <Metric
                    key={field}
                    label={formatFieldLabel(field)}
                    value={value}
                    field={field}
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

        {structuredSummary ? (
          <>
            <Text style={styles.subSection}>Summary</Text>
            <View style={styles.summaryCard}>
              <View style={styles.summaryHeaderRow}>
                <Text style={styles.summaryTitle}>{structuredSummary?.mainInsight?.title || 'Summary'}</Text>
                <View
                  style={[
                    styles.severityBadge,
                    {
                      backgroundColor: severityBackgroundColor(structuredSummary?.mainInsight?.severity || 'normal'),
                      borderColor: `${severityColor(structuredSummary?.mainInsight?.severity || 'normal')}66`,
                    },
                  ]}
                >
                  <Text style={[styles.severityText, { color: severityColor(structuredSummary?.mainInsight?.severity || 'normal') }]}>
                    {String(structuredSummary?.mainInsight?.severity || 'normal').toUpperCase()}
                  </Text>
                </View>
              </View>

              <Subtle>{structuredSummary?.mainInsight?.message || ''}</Subtle>

              {Array.isArray(structuredSummary?.bullets) && structuredSummary.bullets.length > 0 ? (
                <View style={styles.bulletsWrap}>
                  {structuredSummary.bullets.map((bullet, idx) => (
                    <Text key={`${bullet}-${idx}`} style={styles.bulletText}>{`• ${bullet}`}</Text>
                  ))}
                </View>
              ) : null}

              {Array.isArray(structuredSummary?.suggestions) && structuredSummary.suggestions.length > 0 ? (
                <View style={styles.suggestionsWrap}>
                  {structuredSummary.suggestions.map((item, idx) => (
                    <View key={`${item?.title || 'suggestion'}-${idx}`} style={styles.suggestionItem}>
                      <Text style={styles.suggestionTitle}>{item?.title}</Text>
                      <Subtle>{item?.description}</Subtle>
                    </View>
                  ))}
                </View>
              ) : null}

              {structuredSummary?.confidenceNote ? (
                <Subtle style={styles.confidenceNote}>{structuredSummary.confidenceNote}</Subtle>
              ) : null}
            </View>
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
    ...typography.style.extraBold,
    color: '#0f172a',
  },
  section: {
    fontSize: 16,
    ...typography.style.extraBold,
    color: '#0f172a',
    marginBottom: 6,
  },
  subSection: {
    fontSize: 13,
    color: '#475569',
    ...typography.style.extraBold,
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
    ...typography.style.extraBold,
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
    ...typography.style.bold,
    fontSize: 12,
  },
  metricValue: {
    ...typography.style.extraBold,
    fontSize: 16,
  },
  score: {
    ...typography.style.extraBold,
    color: '#0f172a',
    marginTop: 8,
  },
  pendingWrap: {
    gap: 8,
  },
  summaryCard: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 10,
    gap: 8,
    backgroundColor: '#f8fafc',
  },
  summaryHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  summaryTitle: {
    ...typography.style.extraBold,
    color: '#0f172a',
    fontSize: 14,
    flex: 1,
  },
  severityBadge: {
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  severityText: {
    ...typography.style.extraBold,
    fontSize: 10,
    letterSpacing: 0.3,
  },
  bulletsWrap: {
    gap: 4,
  },
  bulletText: {
    color: '#334155',
    fontSize: 13,
    lineHeight: 18,
  },
  suggestionsWrap: {
    gap: 6,
  },
  suggestionItem: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    padding: 8,
    gap: 2,
    backgroundColor: '#ffffff',
  },
  suggestionTitle: {
    ...typography.style.bold,
    color: '#0f172a',
    fontSize: 13,
  },
  confidenceNote: {
    marginTop: 2,
    fontStyle: 'italic',
  },
})
