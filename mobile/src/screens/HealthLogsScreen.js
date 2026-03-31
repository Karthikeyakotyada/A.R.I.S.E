import { useCallback, useMemo, useState } from 'react'
import { ActivityIndicator, FlatList, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import * as Haptics from 'expo-haptics'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { useAuth } from '../context/AuthContext'
import { useDialog } from '../context/DialogContext'
import { useToast } from '../context/ToastContext'
import { supabase } from '../lib/supabaseClient'
import { Card, EmptyState, Screen, SkeletonLine, Subtle } from '../components/ui'
import { formatDate } from '../lib/helpers'
import AnimatedListItem from '../components/AnimatedListItem'
import InlineBanner from '../components/InlineBanner'
import PageHeader from '../components/PageHeader'

const WEB_INPUT_RESET_STYLE = Platform.OS === 'web'
  ? { outlineStyle: 'none' }
  : {}
const INPUT_PLACEHOLDER_COLOR = '#9aa8b5'

function toNullableNumber(value) {
  if (value === '' || value === null || value === undefined) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

export default function HealthLogsScreen() {
  const { user } = useAuth()
  const { showMessage } = useDialog()
  const { showToast } = useToast()
  const [saving, setSaving] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const [logs, setLogs] = useState([])
  const [banner, setBanner] = useState(null)

  const [heartRate, setHeartRate] = useState('')
  const [bloodPressure, setBloodPressure] = useState('')
  const [bloodSugar, setBloodSugar] = useState('')
  const [temperature, setTemperature] = useState('')
  const [symptoms, setSymptoms] = useState('')

  const canSave = useMemo(() => {
    return heartRate || bloodPressure.trim() || bloodSugar || temperature || symptoms.trim()
  }, [heartRate, bloodPressure, bloodSugar, temperature, symptoms])

  const fetchLogs = useCallback(async () => {
    if (!user) return
    setRefreshing(true)
    const { data, error } = await supabase
      .from('health_logs')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) {
      setRefreshing(false)
      setInitialLoading(false)
      setBanner({ tone: 'error', message: 'Could not load logs.' })
      await showMessage({ title: 'Load Error', message: error.message, tone: 'error' })
      return
    }

    setLogs(data || [])
    setRefreshing(false)
    setInitialLoading(false)
  }, [user])

  useFocusEffect(
    useCallback(() => {
      fetchLogs()
    }, [fetchLogs])
  )

  async function handleSave() {
    if (!user || !canSave) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
      showToast('Fill at least one field.', 'warning')
      setBanner({ tone: 'warning', message: 'Fill at least one field to save.' })
      await showMessage({ title: 'Validation', message: 'Please fill at least one field to save a log.', tone: 'warning' })
      return
    }

    setSaving(true)
    try {
      const { error } = await supabase.from('health_logs').insert({
        user_id: user.id,
        heart_rate: toNullableNumber(heartRate),
        blood_pressure: bloodPressure.trim() || null,
        blood_sugar: toNullableNumber(bloodSugar),
        temperature: toNullableNumber(temperature),
        symptoms: symptoms.trim() || null,
      })

      if (error) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
        showToast('Could not save health log.', 'error')
        setBanner({ tone: 'error', message: 'Could not save health log.' })
        await showMessage({ title: 'Save Failed', message: error.message, tone: 'error' })
        return
      }

      setHeartRate('')
      setBloodPressure('')
      setBloodSugar('')
      setTemperature('')
      setSymptoms('')
      await fetchLogs()
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      showToast('Health log saved.', 'success')
      setBanner({ tone: 'success', message: 'Health log saved successfully.' })
      await showMessage({ title: 'Saved', message: 'Health log saved successfully.', tone: 'success' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Screen refreshing={refreshing} onRefresh={fetchLogs}>
      {banner ? <InlineBanner tone={banner.tone} message={banner.message} /> : null}

      <PageHeader
        eyebrow="Health"
        title="Health Logs"
        subtitle="Capture vitals daily to build trends over time."
      />

      <View style={styles.quickStatsSection}>
        <Text style={styles.sectionTitle}>Quick Stats Preview</Text>
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <MaterialCommunityIcons name="heart-pulse" size={22} color="#dc2626" />
            <Text style={styles.statValue}>78 bpm</Text>
            <Text style={styles.statLabel}>Heart Rate</Text>
          </View>
          <View style={styles.statCard}>
            <MaterialCommunityIcons name="heart-box-outline" size={22} color="#0284c7" />
            <Text style={styles.statValue}>120/80</Text>
            <Text style={styles.statLabel}>Blood Pressure</Text>
          </View>
          <View style={styles.statCard}>
            <MaterialCommunityIcons name="water" size={22} color="#16a34a" />
            <Text style={styles.statValue}>110</Text>
            <Text style={styles.statLabel}>Blood Sugar</Text>
          </View>
          <View style={styles.statCard}>
            <MaterialCommunityIcons name="thermometer" size={22} color="#f59e0b" />
            <Text style={styles.statValue}>98.6 F</Text>
            <Text style={styles.statLabel}>Temperature</Text>
          </View>
        </View>
      </View>

      <View style={styles.mainCard}>
        <View style={styles.mainHeader}>
          <Text style={styles.mainTitle}>Add New Entry</Text>
          <Subtle>Fill one or more fields and save your log.</Subtle>
        </View>

        <View style={styles.fieldWrap}>
          <MaterialCommunityIcons name="heart-pulse" size={20} color="#dc2626" style={styles.fieldIcon} />
          <View style={styles.fieldContent}>
            <Text style={styles.fieldLabel}>Heart Rate</Text>
            <TextInput value={heartRate} onChangeText={setHeartRate} style={styles.input} placeholder="Heart Rate (bpm)" placeholderTextColor={INPUT_PLACEHOLDER_COLOR} keyboardType="numeric" />
          </View>
        </View>
        <View style={styles.fieldWrap}>
          <MaterialCommunityIcons name="heart-box-outline" size={20} color="#0284c7" style={styles.fieldIcon} />
          <View style={styles.fieldContent}>
            <Text style={styles.fieldLabel}>Blood Pressure</Text>
            <TextInput value={bloodPressure} onChangeText={setBloodPressure} style={styles.input} placeholder="Blood Pressure (e.g. 120/80)" placeholderTextColor={INPUT_PLACEHOLDER_COLOR} />
          </View>
        </View>
        <View style={styles.fieldWrap}>
          <MaterialCommunityIcons name="water" size={20} color="#16a34a" style={styles.fieldIcon} />
          <View style={styles.fieldContent}>
            <Text style={styles.fieldLabel}>Blood Sugar</Text>
            <TextInput value={bloodSugar} onChangeText={setBloodSugar} style={styles.input} placeholder="Blood Sugar (mg/dL)" placeholderTextColor={INPUT_PLACEHOLDER_COLOR} keyboardType="numeric" />
          </View>
        </View>
        <View style={styles.fieldWrap}>
          <MaterialCommunityIcons name="thermometer" size={20} color="#f59e0b" style={styles.fieldIcon} />
          <View style={styles.fieldContent}>
            <Text style={styles.fieldLabel}>Temperature</Text>
            <TextInput value={temperature} onChangeText={setTemperature} style={styles.input} placeholder="Temperature (F)" placeholderTextColor={INPUT_PLACEHOLDER_COLOR} keyboardType="decimal-pad" />
          </View>
        </View>
        <View style={[styles.fieldWrap, styles.textareaWrap]}>
          <MaterialCommunityIcons name="stethoscope" size={20} color="#64748b" style={styles.fieldIcon} />
          <View style={styles.fieldContent}>
            <Text style={styles.fieldLabel}>Symptoms</Text>
            <TextInput
              value={symptoms}
              onChangeText={setSymptoms}
              style={[styles.input, styles.textarea]}
              placeholder="Symptoms"
              placeholderTextColor={INPUT_PLACEHOLDER_COLOR}
              multiline
            />
          </View>
        </View>

        <TouchableOpacity
          style={[styles.saveButton, (!canSave || saving) && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={!canSave || saving}
          activeOpacity={0.9}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Text style={styles.saveButtonText}>Save Log</Text>
          )}
        </TouchableOpacity>
      </View>

      <Card style={styles.historyCard}>
        <Text style={styles.historyTitle}>Health Log History</Text>
        {initialLoading ? (
          <>
            <SkeletonLine width="52%" />
            <SkeletonLine width="90%" />
            <SkeletonLine width="85%" />
          </>
        ) : null}
        <FlatList
          data={logs}
          keyExtractor={(item) => item.id}
          scrollEnabled={false}
          renderItem={({ item, index }) => (
            <AnimatedListItem index={index}>
              <View style={styles.row}>
                <Text style={styles.rowTitle}>{formatDate(item.created_at)}</Text>
                <View style={styles.vitalsLine}>
                  <Subtle>HR: {item.heart_rate ?? '-'}</Subtle>
                  <Subtle>BP: {item.blood_pressure ?? '-'}</Subtle>
                </View>
                <View style={styles.vitalsLine}>
                  <Subtle>Sugar: {item.blood_sugar ?? '-'}</Subtle>
                  <Subtle>Temp: {item.temperature ?? '-'}</Subtle>
                </View>
                {item.symptoms ? <Subtle>Symptoms: {item.symptoms}</Subtle> : null}
              </View>
            </AnimatedListItem>
          )}
          ListEmptyComponent={
            initialLoading
              ? null
              : <EmptyState title="No logs yet" subtitle="Start with one daily entry to build trends over time." />
          }
        />
      </Card>
    </Screen>
  )
}

const styles = StyleSheet.create({
  heroBlock: {
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 14,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#14532d',
  },
  heroSubtitle: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: '600',
    color: '#2f6650',
  },
  quickStatsSection: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontWeight: '800',
    fontSize: 16,
    color: '#0f172a',
    marginBottom: 10,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statCard: {
    width: '48%',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#dbe7e4',
    paddingHorizontal: 12,
    paddingVertical: 11,
    shadowColor: '#0b1f15',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  statValue: {
    marginTop: 6,
    fontSize: 17,
    fontWeight: '900',
    color: '#0f172a',
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
    marginTop: 1,
  },
  mainCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#d6e4e1',
    padding: 16,
    marginBottom: 16,
    shadowColor: '#0b1f15',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.09,
    shadowRadius: 16,
    elevation: 4,
  },
  mainHeader: {
    marginBottom: 12,
    gap: 3,
  },
  mainTitle: {
    fontWeight: '900',
    fontSize: 20,
    color: '#0f172a',
  },
  historyCard: {
    borderRadius: 18,
    marginTop: 2,
  },
  historyTitle: {
    fontWeight: '900',
    fontSize: 19,
    color: '#0f172a',
  },
  fieldWrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1,
    borderColor: '#e4eeeb',
    borderRadius: 14,
    backgroundColor: '#fdfefe',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    minHeight: 66,
  },
  fieldIcon: {
    marginRight: 10,
    marginTop: 6,
  },
  fieldContent: {
    flex: 1,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#334155',
    marginBottom: 1,
  },
  input: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e8efed',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: '#0f172a',
    fontSize: 15,
    ...WEB_INPUT_RESET_STYLE,
  },
  textareaWrap: {
    alignItems: 'flex-start',
    minHeight: 96,
  },
  textarea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  saveButton: {
    marginTop: 8,
    backgroundColor: '#16A34A',
    borderRadius: 14,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0d6a31',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.33,
    shadowRadius: 16,
    elevation: 7,
  },
  saveButtonDisabled: {
    backgroundColor: '#7fa984',
    shadowOpacity: 0.12,
    elevation: 2,
  },
  saveButtonText: {
    fontWeight: '800',
    color: '#ffffff',
    fontSize: 16,
  },
  row: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 14,
    padding: 13,
    marginTop: 10,
    backgroundColor: '#fcfffe',
    gap: 5,
  },
  rowTitle: {
    fontWeight: '700',
    color: '#1e293b',
  },
  vitalsLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
})
