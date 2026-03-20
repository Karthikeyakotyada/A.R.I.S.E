import { useCallback, useMemo, useState } from 'react'
import { FlatList, StyleSheet, Text, TextInput, View } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import * as Haptics from 'expo-haptics'
import { useAuth } from '../context/AuthContext'
import { useDialog } from '../context/DialogContext'
import { useToast } from '../context/ToastContext'
import { supabase } from '../lib/supabaseClient'
import { Card, EmptyState, PrimaryButton, Screen, SkeletonLine, Subtle } from '../components/ui'
import { formatDate } from '../lib/helpers'
import AnimatedListItem from '../components/AnimatedListItem'
import InlineBanner from '../components/InlineBanner'

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

      <Card>
        <Text style={styles.title}>Add Health Log</Text>
        <Subtle>Record one or more fields.</Subtle>

        <TextInput value={heartRate} onChangeText={setHeartRate} style={styles.input} placeholder="Heart Rate (bpm)" keyboardType="numeric" />
        <TextInput value={bloodPressure} onChangeText={setBloodPressure} style={styles.input} placeholder="Blood Pressure (e.g. 120/80)" />
        <TextInput value={bloodSugar} onChangeText={setBloodSugar} style={styles.input} placeholder="Blood Sugar (mg/dL)" keyboardType="numeric" />
        <TextInput value={temperature} onChangeText={setTemperature} style={styles.input} placeholder="Temperature (F)" keyboardType="decimal-pad" />
        <TextInput
          value={symptoms}
          onChangeText={setSymptoms}
          style={[styles.input, styles.textarea]}
          placeholder="Symptoms"
          multiline
        />

        <PrimaryButton title="Save Log" onPress={handleSave} loading={saving} disabled={!canSave} />
      </Card>

      <Card>
        <Text style={styles.title}>History</Text>
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
                <Subtle>
                  HR: {item.heart_rate ?? '-'} | BP: {item.blood_pressure ?? '-'} | Sugar: {item.blood_sugar ?? '-'} | Temp: {item.temperature ?? '-'}
                </Subtle>
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
  title: {
    fontWeight: '800',
    fontSize: 16,
    color: '#0f172a',
  },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  textarea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  row: {
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingTop: 10,
    marginTop: 8,
    gap: 2,
  },
  rowTitle: {
    fontWeight: '700',
    color: '#1e293b',
  },
})
