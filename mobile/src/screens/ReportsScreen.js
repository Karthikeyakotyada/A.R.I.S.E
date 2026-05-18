import { useCallback, useMemo, useState } from 'react'
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
import { typography } from '../lib/typography'
import { useTheme } from '../context/ThemeContext'
import { getReportStatusBadgeColors, isDarkTheme } from '../lib/themeUi'

function StatusBadge({ status, theme, badgeStyle, badgeTextStyle }) {
  const meta = REPORT_STATUS_META[status] || REPORT_STATUS_META.uploaded
  const colors = getReportStatusBadgeColors(theme, meta.tone)

  return (
    <View style={[badgeStyle, { backgroundColor: colors.bg, borderColor: colors.border }]}>
      <Text style={[badgeTextStyle, { color: colors.text }]}>{meta.label}</Text>
    </View>
  )
}

export default function ReportsScreen({ navigation }) {
  const { theme } = useTheme()
  const styles = useMemo(() => createStyles(theme), [theme])
  const { user } = useAuth()
  const { showConfirm, showMessage } = useDialog()
  const { showToast } = useToast()
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [banner, setBanner] = useState(null)
  const [online, setOnline] = useState(true)

  const reportCountLabel = loading
    ? 'Loading your reports...'
    : reports.length === 1
      ? '1 report available'
      : `${reports.length} reports available`

  const fetchReports = useCallback(async () => {
    if (!user) {
      setLoading(false)
      return
    }
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
        setReports([])
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
    } catch {
      setReports([])
      setBanner({ tone: 'error', message: 'Could not load reports. Pull to refresh.' })
    } finally {
      setLoading(false)
    }
  }, [user, showMessage])

  useFocusEffect(
    useCallback(() => {
      fetchReports()
    }, [fetchReports])
  )

  async function handleDelete(report) {
    if (!report?.id) return
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    const fileLabel = report.file_name || 'this report'
    const ok = await showConfirm({
      title: 'Delete Report',
      message: `Delete ${fileLabel}?\n\nThis removes report and analysis.`,
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
    if (!report?.id) return
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
      fileType: inferFileType(report.file_name || ''),
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
        subtitle={reportCountLabel}
        showTopBar={false}
      />

      <Pressable style={styles.historyBtn} onPress={() => navigation.navigate('AnalysisHistory')}>
        <Text style={styles.historyBtnText}>Open Analysis History</Text>
      </Pressable>

      {!online ? <InlineBanner tone="warning" message="You're offline or connection is unstable" /> : null}
      {banner ? <InlineBanner tone={banner.tone} message={banner.message} /> : null}

      {loading && reports.length === 0 ? (
        <Card style={styles.loadingCard}>
          <ActivityIndicator size="small" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Loading your reports...</Text>
          <Subtle>Fetching uploads and analysis status from your library.</Subtle>
        </Card>
      ) : null}

      <FlatList
        data={reports}
        keyExtractor={(item) => String(item.id)}
        scrollEnabled={false}
        renderItem={({ item, index }) => {
          const fileName = item.file_name || 'Untitled report'
          const uploadedAt = item.uploaded_at || item.created_at
          const status = item.resolvedStatus || REPORT_ANALYSIS_STATUS.PENDING

          return (
            <AnimatedListItem index={index}>
              <Card style={styles.itemCard}>
                <Pressable onPress={() => navigation.navigate('ReportViewer', { reportId: item.id })}>
                  <Text style={styles.fileName}>{fileName}</Text>
                  <Subtle>
                    {uploadedAt ? formatDate(uploadedAt) : 'Date unavailable'} | {getExt(fileName)}
                  </Subtle>
                  <View style={styles.statusRow}>
                    <StatusBadge
                      status={status}
                      theme={theme}
                      badgeStyle={styles.badge}
                      badgeTextStyle={styles.badgeText}
                    />
                    {status === REPORT_ANALYSIS_STATUS.PENDING ? (
                      <ActivityIndicator size="small" color={theme.colors.accentWarm || '#f59e0b'} />
                    ) : null}
                  </View>
                </Pressable>
                <View style={styles.row}>
                  <Pressable
                    style={styles.viewBtn}
                    onPress={() => navigation.navigate('ReportViewer', { reportId: item.id })}
                  >
                    <Text style={styles.viewBtnText}>Open</Text>
                  </Pressable>
                  {status === REPORT_ANALYSIS_STATUS.FAILED ? (
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
          )
        }}
        ListEmptyComponent={
          loading ? null : (
            <Card>
              <EmptyState
                title="No reports uploaded"
                subtitle="Upload your first CBC PDF from the Upload tab. ARISE will analyze it and track status automatically."
              />
            </Card>
          )
        }
      />
    </Screen>
  )
}

function createStyles(theme) {
  const dark = isDarkTheme(theme)
  return StyleSheet.create({
    fileName: {
      fontSize: 15,
      ...typography.style.extraBold,
      color: theme.colors.text,
    },
    itemCard: {
      borderRadius: theme.radius.card,
    },
    loadingCard: {
      alignItems: 'center',
      gap: 10,
      paddingVertical: 22,
    },
    loadingText: {
      fontSize: 14,
      ...typography.style.semiBold,
      color: theme.colors.text,
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
      ...typography.style.extraBold,
      fontSize: 11,
      textTransform: 'uppercase',
      letterSpacing: 0.3,
    },
    viewBtn: {
      flex: 1,
      borderRadius: 10,
      borderWidth: dark ? 0 : 1,
      borderColor: theme.colors.border,
      backgroundColor: dark ? theme.colors.elevated : 'transparent',
      minHeight: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    viewBtnText: {
      ...typography.style.bold,
      color: theme.colors.text,
    },
    retryBtn: {
      flex: 1,
      borderRadius: 10,
      backgroundColor: dark ? 'rgba(234, 88, 12, 0.9)' : '#ea580c',
      minHeight: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    retryBtnText: {
      ...typography.style.bold,
      color: '#fff',
    },
    deleteBtn: {
      flex: 1,
      borderRadius: 10,
      backgroundColor: dark ? 'rgba(239, 68, 68, 0.88)' : '#ef4444',
      minHeight: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    deleteBtnText: {
      ...typography.style.bold,
      color: '#fff',
    },
    historyBtn: {
      borderWidth: dark ? 0 : 1,
      borderColor: dark ? 'transparent' : '#99f6e4',
      backgroundColor: dark ? 'rgba(39, 225, 193, 0.1)' : '#ecfeff',
      borderRadius: 12,
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 4,
    },
    historyBtnText: {
      color: theme.colors.primary,
      ...typography.style.extraBold,
      fontSize: 13,
    },
  })
}
