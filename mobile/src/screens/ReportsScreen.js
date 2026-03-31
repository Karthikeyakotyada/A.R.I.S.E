import { useCallback, useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import * as Haptics from 'expo-haptics'
import { useAuth } from '../context/AuthContext'
import { useDialog } from '../context/DialogContext'
import { useToast } from '../context/ToastContext'
import { supabase } from '../lib/supabaseClient'
import { formatDate, getExt, getStoragePath } from '../lib/helpers'
import { analyzeExistingReport, inferFileType, REPORT_ANALYSIS_STATUS, REPORT_STATUS_META, resolveReportStatus } from '../lib/reportAnalysisService'
import { isDeviceOnline, toFriendlyError } from '../lib/network'
import { Card, EmptyState, Screen, Subtle } from '../components/ui'
import PageHeader from '../components/PageHeader'
import AnimatedListItem from '../components/AnimatedListItem'
import InlineBanner from '../components/InlineBanner'

function StatusBadge({ status }) {
  const meta = REPORT_STATUS_META[status] || REPORT_STATUS_META.uploaded
  const colors =
    meta.tone === 'success'
      ? { bg: '#dcfce7', border: '#86efac', text: '#166534' }
      : meta.tone === 'error'
        ? { bg: '#fee2e2', border: '#fca5a5', text: '#991b1b' }
        : meta.tone === 'warning'
          ? { bg: '#ffedd5', border: '#fdba74', text: '#9a3412' }
          : { bg: '#e0f2fe', border: '#93c5fd', text: '#1e40af' }

  return (
    <View style={[styles.badge, { backgroundColor: colors.bg, borderColor: colors.border }]}>
      <Text style={[styles.badgeText, { color: colors.text }]}>{meta.label}</Text>
    </View>
  )
}

export default function ReportsScreen({ navigation }) {
  const { user } = useAuth()
  const { showConfirm, showMessage } = useDialog()
  const { showToast } = useToast()
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(false)
  const [banner, setBanner] = useState(null)
  const [online, setOnline] = useState(true)

  const reportCountLabel = reports.length === 1 ? '1 report available' : `${reports.length} reports available`

  const fetchReports = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const connected = await isDeviceOnline()
      setOnline(connected)

      const { data: reportsData, error } = await supabase
        .from('reports')
        .select('*')
        .eq('user_id', user.id)
        .order('uploaded_at', { ascending: false })

      if (error) {
        await showMessage({ title: 'Load Failed', message: error.message, tone: 'error' })
        return
      }

      const ids = (reportsData || []).map((r) => r.id)
      let latestAnalysisByReportId = {}

      if (ids.length > 0) {
        const { data: analysisRows } = await supabase
          .from('report_analysis')
          .select('*')
          .in('report_id', ids)
          .order('analyzed_at', { ascending: false })

        latestAnalysisByReportId = (analysisRows || []).reduce((acc, row) => {
          if (!acc[row.report_id]) acc[row.report_id] = row
          return acc
        }, {})
      }

      const merged = (reportsData || []).map((report) => {
        const latestAnalysis = latestAnalysisByReportId[report.id] || null
        const status = resolveReportStatus(report, latestAnalysis)
        return {
          ...report,
          latestAnalysis,
          resolvedStatus: status,
        }
      })

      setReports(merged)
    } finally {
      setLoading(false)
    }
  }, [user])

  useFocusEffect(
    useCallback(() => {
      fetchReports()
    }, [fetchReports])
  )

  async function handleDelete(report) {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    const ok = await showConfirm({
      title: 'Delete Report',
      message: `Delete ${report.file_name}?\n\nThis removes report and analysis.`,
      tone: 'warning',
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
    })
    if (!ok) return

    const filePath = getStoragePath(report.file_url)

    await supabase.from('report_analysis').delete().eq('report_id', report.id)
    if (filePath) {
      await supabase.storage.from('cbc-reports').remove([filePath])
    }

    const { error } = await supabase
      .from('reports')
      .delete()
      .eq('id', report.id)
      .eq('user_id', user.id)

    if (error) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      showToast('Delete failed. Try again.', 'error')
      setBanner({ tone: 'error', message: 'Delete failed. Please try again.' })
      await showMessage({ title: 'Delete Failed', message: error.message, tone: 'error' })
      return
    }

    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    showToast('Report deleted.', 'success')
    setBanner({ tone: 'success', message: 'Report deleted successfully.' })
    fetchReports()
  }

  async function handleRetry(report) {
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
      setBanner({ tone: 'warning', message: 'Cannot locate report file for retry.' })
      return
    }

    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    setBanner({ tone: 'info', message: 'Retrying analysis...' })

    const result = await analyzeExistingReport({
      reportId: report.id,
      filePath,
      fileType: inferFileType(report.file_name),
      timeoutMs: 35000,
    })

    if (!result.success) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      const errorMessage = toFriendlyError(result.error, 'Analysis retry failed.')
      showToast(errorMessage, 'error')
      setBanner({ tone: 'error', message: errorMessage })
      return
    }

    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    showToast('Analysis completed.', 'success')
    setBanner({ tone: 'success', message: 'Analysis completed successfully.' })
    fetchReports()
  }

  return (
    <Screen refreshing={loading} onRefresh={fetchReports}>
      <PageHeader
        eyebrow="Reports"
        title="My Report Library"
        subtitle={loading ? 'Loading your reports...' : reportCountLabel}
        showTopBar={false}
      />

      <Pressable style={styles.historyBtn} onPress={() => navigation.navigate('AnalysisHistory')}>
        <Text style={styles.historyBtnText}>Open Analysis History</Text>
      </Pressable>

      {!online ? <InlineBanner tone="warning" message="You're offline or connection is unstable" /> : null}
      {banner ? <InlineBanner tone={banner.tone} message={banner.message} /> : null}

      <FlatList
        data={reports}
        keyExtractor={(item) => item.id}
        scrollEnabled={false}
        renderItem={({ item, index }) => (
          <AnimatedListItem index={index}>
            <Card style={styles.itemCard}>
              <Pressable onPress={() => navigation.navigate('ReportViewer', { reportId: item.id })}>
                <Text style={styles.fileName}>{item.file_name}</Text>
                <Subtle>{formatDate(item.uploaded_at)} | {getExt(item.file_name)}</Subtle>
                <View style={styles.statusRow}>
                  <StatusBadge status={item.resolvedStatus} />
                  {item.resolvedStatus === REPORT_ANALYSIS_STATUS.PENDING ? (
                    <ActivityIndicator size="small" color="#d97706" />
                  ) : null}
                </View>
              </Pressable>
              <View style={styles.row}>
                <Pressable style={styles.viewBtn} onPress={() => navigation.navigate('ReportViewer', { reportId: item.id })}>
                  <Text style={styles.viewBtnText}>Open</Text>
                </Pressable>
                {item.resolvedStatus === REPORT_ANALYSIS_STATUS.FAILED ? (
                  <Pressable style={styles.retryBtn} onPress={() => handleRetry(item)}>
                    <Text style={styles.retryBtnText}>Re-analyze</Text>
                  </Pressable>
                ) : null}
                <Pressable style={styles.deleteBtn} onPress={() => handleDelete(item)}>
                  <Text style={styles.deleteBtnText}>Remove</Text>
                </Pressable>
              </View>
            </Card>
          </AnimatedListItem>
        )}
        ListEmptyComponent={
          <Card>
            <EmptyState
              title="No reports uploaded"
              subtitle="Upload your first CBC PDF from the Upload tab. ARISE will analyze it and track status automatically."
            />
          </Card>
        }
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  fileName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
  },
  itemCard: {
    borderRadius: 16,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  badge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  badgeText: {
    fontWeight: '800',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  viewBtn: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewBtnText: {
    fontWeight: '700',
    color: '#334155',
  },
  retryBtn: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: '#ea580c',
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryBtnText: {
    fontWeight: '700',
    color: '#fff',
  },
  deleteBtn: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: '#ef4444',
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtnText: {
    fontWeight: '700',
    color: '#fff',
  },
  historyBtn: {
    borderWidth: 1,
    borderColor: '#99f6e4',
    backgroundColor: '#ecfeff',
    borderRadius: 12,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  historyBtnText: {
    color: '#0f766e',
    fontWeight: '800',
    fontSize: 13,
  },
})
