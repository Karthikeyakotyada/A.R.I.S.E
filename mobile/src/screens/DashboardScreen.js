import { useCallback, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { Card, EmptyState, Heading, Screen, Subtle } from '../components/ui'
import { formatDate } from '../lib/helpers'
import PageHeader from '../components/PageHeader'
import StatCard from '../components/StatCard'
import AnimatedListItem from '../components/AnimatedListItem'

export default function DashboardScreen() {
  const { user } = useAuth()
  const [reportCount, setReportCount] = useState(0)
  const [recentLogs, setRecentLogs] = useState([])
  const [refreshing, setRefreshing] = useState(false)

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
          .limit(3),
      ])

      setReportCount(reports?.length || 0)
      setRecentLogs(logs || [])
    } finally {
      setRefreshing(false)
    }
  }, [user])

  useFocusEffect(
    useCallback(() => {
      loadDashboard()
    }, [loadDashboard])
  )

  return (
    <Screen refreshing={refreshing} onRefresh={loadDashboard}>
      <PageHeader
        eyebrow="ARISE"
        title="Health Dashboard"
        subtitle="Track reports, monitor trends, and keep your health records in one place."
      />

      <Card style={styles.banner}>
        <Text style={styles.welcomeOverline}>Welcome back</Text>
        <Heading>{displayName}</Heading>
        <Subtle style={{ color: '#dcfce7' }}>Your AI health dashboard is live and synced.</Subtle>
      </Card>

      <View style={styles.statsRow}>
        <StatCard value={reportCount} label="Reports Uploaded" tone="primary" />
        <StatCard value={recentLogs.length} label="Recent Logs" tone="sky" />
      </View>

      <Card>
        <Text style={styles.sectionTitle}>Recent Health Logs</Text>
        {recentLogs.length === 0 ? (
          <EmptyState title="No health logs yet" subtitle="Pull down to refresh, or add your first entry from Health Logs." />
        ) : null}
        {recentLogs.map((log, index) => (
          <AnimatedListItem key={log.id} index={index}>
            <View style={styles.logRow}>
              <Text style={styles.logTitle}>{formatDate(log.created_at)}</Text>
              <Subtle>
                HR: {log.heart_rate ?? '-'} | BP: {log.blood_pressure ?? '-'} | Sugar: {log.blood_sugar ?? '-'} | Temp: {log.temperature ?? '-'}
              </Subtle>
            </View>
          </AnimatedListItem>
        ))}
      </Card>
    </Screen>
  )
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#5cedf1',
    borderColor: '#0ff0e8',
    paddingVertical: 16,
    gap: 4,
  },
  welcomeOverline: {
    color: '#17f6f6',
    fontWeight: '700',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  sectionTitle: {
    fontWeight: '800',
    fontSize: 16,
    color: '#0f172a',
    marginBottom: 6,
  },
  logRow: {
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingTop: 10,
    marginTop: 8,
    gap: 2,
  },
  logTitle: {
    fontWeight: '700',
    color: '#1e293b',
  },
})
