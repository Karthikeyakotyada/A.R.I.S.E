import { useCallback, useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { useAuth } from '../context/AuthContext'
import { useDialog } from '../context/DialogContext'
import { supabase } from '../lib/supabaseClient'
import { formatDate } from '../lib/helpers'
import { getStatusForValue } from '../lib/cbcAnalyzer'
import { Card, EmptyState, Screen, Subtle } from '../components/ui'
import PageHeader from '../components/PageHeader'
import AnimatedListItem from '../components/AnimatedListItem'

function statusColor(value, field) {
  const status = getStatusForValue(value, field)
  if (status === 'normal') return '#16a34a'
  if (status === 'low') return '#d97706'
  if (status === 'high') return '#dc2626'
  return '#64748b'
}

function MetricPill({ label, value, field }) {
  function formatValue(v, metricField) {
    if (v === null || v === undefined || Number.isNaN(Number(v)) || Number(v) <= 0) return '0'
    const n = Number(v)
    if (metricField === 'hemoglobin' || metricField === 'rbc') {
      return n.toFixed(2).replace(/\.00$/, '')
    }
    return n.toLocaleString('en-IN')
  }

  return (
    <View style={styles.pill}>
      <Text style={styles.pillLabel}>{label}</Text>
      <Text style={[styles.pillValue, { color: statusColor(value, field) }]}>{formatValue(value, field)}</Text>
    </View>
  )
}

function getSummaryPreview(summary) {
  if (!summary) return ''

  if (typeof summary === 'object') {
    const title = String(summary?.mainInsight?.title || '').trim()
    const message = String(summary?.mainInsight?.message || '').trim()
    return [title, message].filter(Boolean).join(': ')
  }

  const raw = String(summary).trim()
  if (!raw) return ''

  try {
    const parsed = JSON.parse(raw)
    const title = String(parsed?.mainInsight?.title || '').trim()
    const message = String(parsed?.mainInsight?.message || '').trim()
    const combined = [title, message].filter(Boolean).join(': ')
    return combined || raw
  } catch (_error) {
    return raw
  }
}

export default function AnalysisHistoryScreen({ navigation }) {
  const { user } = useAuth()
  const { showMessage } = useDialog()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)

  const fetchHistory = useCallback(async () => {
    if (!user) return

    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('report_analysis')
        .select('id, report_id, hemoglobin, rbc, wbc, platelets, health_score, ai_summary, analyzed_at, reports!inner(file_name, user_id)')
        .eq('reports.user_id', user.id)
        .order('analyzed_at', { ascending: false })

      if (error) {
        await showMessage({ title: 'Load Failed', message: error.message, tone: 'error' })
        return
      }

      setRows(data || [])
    } finally {
      setLoading(false)
    }
  }, [showMessage, user])

  useFocusEffect(
    useCallback(() => {
      fetchHistory()
    }, [fetchHistory])
  )

  return (
    <Screen refreshing={loading} onRefresh={fetchHistory}>
      <PageHeader
        eyebrow="Reports"
        title="Analysis History"
        subtitle={loading ? 'Loading saved analyses...' : `${rows.length} saved analysis result(s)`}
      />

      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        scrollEnabled={false}
        renderItem={({ item, index }) => (
          <AnimatedListItem index={index}>
            <Card>
              <Pressable onPress={() => navigation.navigate('ReportViewer', { reportId: item.report_id })}>
                <Text style={styles.fileName}>{item.reports?.file_name || 'Report'}</Text>
                <Subtle>{formatDate(item.analyzed_at)}</Subtle>

                <View style={styles.pillsRow}>
                  <MetricPill label="Hb" value={item.hemoglobin} field="hemoglobin" />
                  <MetricPill label="RBC" value={item.rbc} field="rbc" />
                  <MetricPill label="WBC" value={item.wbc} field="wbc" />
                  <MetricPill label="PLT" value={item.platelets} field="platelets" />
                </View>

                {item.health_score !== null && item.health_score !== undefined ? (
                  <Text style={styles.score}>Health Score: {item.health_score}/100</Text>
                ) : null}

                {item.ai_summary ? (
                  <Subtle style={styles.summary} numberOfLines={3}>
                    {getSummaryPreview(item.ai_summary)}
                  </Subtle>
                ) : null}

                <Text style={styles.cta}>Tap to open full report details</Text>
              </Pressable>
            </Card>
          </AnimatedListItem>
        )}
        ListEmptyComponent={
          loading ? (
            <Card style={styles.centered}>
              <ActivityIndicator size="small" color="#0b6b63" />
              <Subtle>No saved analysis found yet.</Subtle>
            </Card>
          ) : (
            <Card>
              <EmptyState
                title="No analysis history yet"
                subtitle="Upload a report first. Analysis results will be saved and shown here for your account."
              />
            </Card>
          )
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
  pillsRow: {
    marginTop: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  pill: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pillLabel: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '700',
  },
  pillValue: {
    fontWeight: '800',
    fontSize: 12,
  },
  score: {
    marginTop: 8,
    color: '#0f172a',
    fontWeight: '800',
  },
  summary: {
    marginTop: 6,
    lineHeight: 20,
  },
  cta: {
    marginTop: 8,
    color: '#0b6b63',
    fontWeight: '700',
    fontSize: 12,
  },
  centered: {
    alignItems: 'center',
  },
})
