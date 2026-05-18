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
import { typography } from '../lib/typography'
import { useTheme } from '../context/ThemeContext'
import { getCardShadowStyle, isDarkTheme } from '../lib/themeUi'

const WEB_INPUT_RESET_STYLE = Platform.OS === 'web'
  ? { outlineStyle: 'none' }
  : {}

function toNullableNumber(value) {
  if (value === '' || value === null || value === undefined) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function validateHeartRate(value) {
  const n = toNullableNumber(value)
  if (n === null) return null
  if (n < 20 || n > 200) return null // Unrealistic heart rate
  return n
}

function validateBloodPressure(value) {
  if (!value || typeof value !== 'string') return null
  const match = value.trim().match(/^(\d+)\s*\/\s*(\d+)$/)
  if (!match) return null
  const systolic = Number(match[1])
  const diastolic = Number(match[2])
  if (systolic < 50 || systolic > 250 || diastolic < 30 || diastolic > 150) return null
  return value.trim()
}

function validateBloodSugar(value) {
  const n = toNullableNumber(value)
  if (n === null) return null
  if (n < 30 || n > 500) return null // Unrealistic blood sugar
  return n
}

function validateTemperature(value) {
  const n = toNullableNumber(value)
  if (n === null) return null
  if (n < 95 || n > 105) return null // Unrealistic body temperature (F)
  return n
}

export default function HealthLogsScreen() {
  const { theme } = useTheme()
  const styles = useMemo(() => createStyles(theme), [theme])
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
  const [errors, setErrors] = useState({})

  const canSave = useMemo(() => {
    return heartRate || bloodPressure.trim() || bloodSugar || temperature || symptoms.trim()
  }, [heartRate, bloodPressure, bloodSugar, temperature, symptoms])

  const trendIndicators = useMemo(() => {
    if (!logs || logs.length < 2) {
      return { heartRate: { arrow: '→', color: '#6b7280' }, bloodPressure: { arrow: '→', color: '#6b7280' }, bloodSugar: { arrow: '→', color: '#6b7280' }, temperature: { arrow: '→', color: '#6b7280' } }
    }

    const latest = logs[0]
    const validHeartRates = logs.filter(log => log.heart_rate && log.heart_rate > 0)
    const validBPs = logs.filter(log => log.blood_pressure && typeof log.blood_pressure === 'string')
    const validSugars = logs.filter(log => log.blood_sugar && log.blood_sugar > 0)
    const validTemps = logs.filter(log => log.temperature && log.temperature > 0)

    // Heart Rate trend
    let hrTrend = { arrow: '→', color: '#6b7280' }
    if (validHeartRates.length >= 2 && latest.heart_rate) {
      const avgHR = validHeartRates.reduce((sum, log) => sum + log.heart_rate, 0) / validHeartRates.length
      if (latest.heart_rate > avgHR + 5) {
        hrTrend = { arrow: '↑', color: '#ef4444' } // trending up (high)
      } else if (latest.heart_rate < avgHR - 5) {
        hrTrend = { arrow: '↓', color: '#10b981' } // trending down (good)
      }
    }

    // Blood Pressure trend (compare systolic)
    let bpTrend = { arrow: '→', color: '#6b7280' }
    if (validBPs.length >= 2 && latest.blood_pressure) {
      const latestMatch = latest.blood_pressure.match(/^(\d+)\s*\/\s*(\d+)$/)
      if (latestMatch) {
        const latestSystolic = Number(latestMatch[1])
        const avgSystolic = validBPs.reduce((sum, log) => {
          const m = log.blood_pressure.match(/^(\d+)\s*\/\s*(\d+)$/)
          return sum + (m ? Number(m[1]) : 0)
        }, 0) / validBPs.length
        if (latestSystolic > avgSystolic + 5) {
          bpTrend = { arrow: '↑', color: '#ef4444' }
        } else if (latestSystolic < avgSystolic - 5) {
          bpTrend = { arrow: '↓', color: '#10b981' }
        }
      }
    }

    // Blood Sugar trend
    let sugarTrend = { arrow: '→', color: '#6b7280' }
    if (validSugars.length >= 2 && latest.blood_sugar) {
      const avgSugar = validSugars.reduce((sum, log) => sum + log.blood_sugar, 0) / validSugars.length
      if (latest.blood_sugar > avgSugar + 5) {
        sugarTrend = { arrow: '↑', color: '#ef4444' }
      } else if (latest.blood_sugar < avgSugar - 5) {
        sugarTrend = { arrow: '↓', color: '#10b981' }
      }
    }

    // Temperature trend
    let tempTrend = { arrow: '→', color: '#6b7280' }
    if (validTemps.length >= 2 && latest.temperature) {
      const avgTemp = validTemps.reduce((sum, log) => sum + log.temperature, 0) / validTemps.length
      if (latest.temperature > avgTemp + 0.5) {
        tempTrend = { arrow: '↑', color: '#ef4444' }
      } else if (latest.temperature < avgTemp - 0.5) {
        tempTrend = { arrow: '↓', color: '#10b981' }
      }
    }

    return { heartRate: hrTrend, bloodPressure: bpTrend, bloodSugar: sugarTrend, temperature: tempTrend }
  }, [logs])

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

    // Validate inputs
    const newErrors = {}
    
    if (heartRate && !validateHeartRate(heartRate)) {
      newErrors.heartRate = 'Heart rate must be between 20-200 bpm'
    }
    
    if (bloodPressure && !validateBloodPressure(bloodPressure)) {
      newErrors.bloodPressure = 'Format: 120/80 (systolic/diastolic)'
    }
    
    if (bloodSugar && !validateBloodSugar(bloodSugar)) {
      newErrors.bloodSugar = 'Blood sugar must be between 30-500 mg/dL'
    }
    
    if (temperature && !validateTemperature(temperature)) {
      newErrors.temperature = 'Temperature must be between 95-105°F'
    }

    // Show validation errors
    if (Object.keys(newErrors).length > 0) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
      setErrors(newErrors)
      const errorMsg = Object.values(newErrors).join('\n')
      showToast('Please fix the errors', 'warning')
      setBanner({ tone: 'warning', message: 'Please check your input values.' })
      await showMessage({ title: 'Validation Error', message: errorMsg, tone: 'warning' })
      return
    }

    setErrors({})
    setSaving(true)
    try {
      const { error } = await supabase.from('health_logs').insert({
        user_id: user.id,
        heart_rate: validateHeartRate(heartRate),
        blood_pressure: validateBloodPressure(bloodPressure),
        blood_sugar: validateBloodSugar(bloodSugar),
        temperature: validateTemperature(temperature),
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
        showTopBar={false}
      />

      <View style={styles.quickStatsSection}>
        <Text style={styles.sectionTitle}>Quick Stats Preview</Text>
        <Text style={styles.quickStatsHint}>
          Trend indicators: ↑ trending up, ↓ trending down, → stable.
        </Text>
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <MaterialCommunityIcons name="heart-pulse" size={22} color="#dc2626" />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={styles.statLabel}>Heart Rate</Text>
              <Text style={[styles.trendArrow, { color: trendIndicators.heartRate.color }]}>
                {trendIndicators.heartRate.arrow}
              </Text>
            </View>
          </View>
          <View style={styles.statCard}>
            <MaterialCommunityIcons name="heart-box-outline" size={22} color="#0284c7" />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={styles.statLabel}>Blood Pressure</Text>
              <Text style={[styles.trendArrow, { color: trendIndicators.bloodPressure.color }]}>
                {trendIndicators.bloodPressure.arrow}
              </Text>
            </View>
          </View>
          <View style={styles.statCard}>
            <MaterialCommunityIcons name="water" size={22} color="#16a34a" />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={styles.statLabel}>Blood Sugar</Text>
              <Text style={[styles.trendArrow, { color: trendIndicators.bloodSugar.color }]}>
                {trendIndicators.bloodSugar.arrow}
              </Text>
            </View>
          </View>
          <View style={styles.statCard}>
            <MaterialCommunityIcons name="thermometer" size={22} color="#f59e0b" />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={styles.statLabel}>Temperature</Text>
              <Text style={[styles.trendArrow, { color: trendIndicators.temperature.color }]}>
                {trendIndicators.temperature.arrow}
              </Text>
            </View>
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
            <TextInput value={heartRate} onChangeText={setHeartRate} style={[styles.input, errors.heartRate && styles.inputError]} placeholder="Heart Rate (bpm)" placeholderTextColor={theme.colors.muted} keyboardType="numeric" />
            {errors.heartRate ? <Text style={styles.errorText}>{errors.heartRate}</Text> : null}
          </View>
        </View>
        <View style={styles.fieldWrap}>
          <MaterialCommunityIcons name="heart-box-outline" size={20} color="#0284c7" style={styles.fieldIcon} />
          <View style={styles.fieldContent}>
            <Text style={styles.fieldLabel}>Blood Pressure</Text>
            <TextInput value={bloodPressure} onChangeText={setBloodPressure} style={[styles.input, errors.bloodPressure && styles.inputError]} placeholder="Blood Pressure (e.g. 120/80)" placeholderTextColor={theme.colors.muted} />
            {errors.bloodPressure ? <Text style={styles.errorText}>{errors.bloodPressure}</Text> : null}
          </View>
        </View>
        <View style={styles.fieldWrap}>
          <MaterialCommunityIcons name="water" size={20} color="#16a34a" style={styles.fieldIcon} />
          <View style={styles.fieldContent}>
            <Text style={styles.fieldLabel}>Blood Sugar</Text>
            <TextInput value={bloodSugar} onChangeText={setBloodSugar} style={[styles.input, errors.bloodSugar && styles.inputError]} placeholder="Blood Sugar (mg/dL)" placeholderTextColor={theme.colors.muted} keyboardType="numeric" />
            {errors.bloodSugar ? <Text style={styles.errorText}>{errors.bloodSugar}</Text> : null}
          </View>
        </View>
        <View style={styles.fieldWrap}>
          <MaterialCommunityIcons name="thermometer" size={20} color="#f59e0b" style={styles.fieldIcon} />
          <View style={styles.fieldContent}>
            <Text style={styles.fieldLabel}>Temperature</Text>
            <TextInput value={temperature} onChangeText={setTemperature} style={[styles.input, errors.temperature && styles.inputError]} placeholder="Temperature (F)" placeholderTextColor={theme.colors.muted} keyboardType="decimal-pad" />
            {errors.temperature ? <Text style={styles.errorText}>{errors.temperature}</Text> : null}
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
              placeholderTextColor={theme.colors.muted}
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
                  <Text style={styles.vitalText}>HR: {item.heart_rate ?? '-'}</Text>
                  <Text style={styles.vitalText}>BP: {item.blood_pressure ?? '-'}</Text>
                </View>
                <View style={styles.vitalsLine}>
                  <Text style={styles.vitalText}>Sugar: {item.blood_sugar ?? '-'}</Text>
                  <Text style={styles.vitalText}>Temp: {item.temperature ?? '-'}</Text>
                </View>
                {item.symptoms ? <Text style={styles.symptomsText}>Symptoms: {item.symptoms}</Text> : null}
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

function createStyles(theme) {
  const dark = isDarkTheme(theme)
  return StyleSheet.create({
  heroBlock: {
    backgroundColor: dark ? theme.colors.elevated : '#ecfdf5',
    borderWidth: dark ? 0 : 1,
    borderColor: dark ? 'transparent' : '#bbf7d0',
    borderRadius: theme.radius.card,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 14,
  },
  heroTitle: {
    fontSize: 24,
    ...typography.style.extraBold,
    color: dark ? theme.colors.text : '#14532d',
  },
  heroSubtitle: {
    marginTop: 2,
    fontSize: 13,
    ...typography.style.semiBold,
    color: dark ? theme.colors.textSecondary : '#2f6650',
  },
  quickStatsHint: {
    fontSize: 12,
    ...typography.style.medium,
    color: theme.colors.textSecondary,
    marginBottom: 10,
    lineHeight: 17,
  },
  quickStatsSection: {
    marginBottom: 16,
  },
  sectionTitle: {
    ...typography.style.extraBold,
    fontSize: 16,
    color: theme.colors.text,
    marginBottom: 10,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statCard: {
    width: '48%',
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.md,
    borderWidth: theme.ui.cardBorderWidth,
    borderColor: theme.colors.borderSubtle,
    paddingHorizontal: 12,
    paddingVertical: 11,
    ...getCardShadowStyle(theme),
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  statValue: {
    marginTop: 6,
    fontSize: 17,
    ...typography.style.extraBold,
    color: theme.colors.text,
  },
  statLabel: {
    fontSize: 11,
    ...typography.style.semiBold,
    color: dark ? theme.colors.textSecondary : theme.colors.muted,
    marginTop: 1,
    textAlign: 'center',
  },
  trendArrow: {
    fontSize: 14,
    ...typography.style.bold,
  },
  mainCard: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.card,
    borderWidth: theme.ui.cardBorderWidth,
    borderColor: theme.colors.borderSubtle,
    padding: 16,
    marginBottom: 16,
    ...getCardShadowStyle(theme),
  },
  mainHeader: {
    marginBottom: 12,
    gap: 3,
  },
  mainTitle: {
    ...typography.style.extraBold,
    fontSize: 20,
    color: theme.colors.text,
  },
  historyCard: {
    borderRadius: 18,
    marginTop: 2,
  },
  historyTitle: {
    ...typography.style.extraBold,
    fontSize: 19,
    color: theme.colors.text,
  },
  fieldWrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: dark ? 0 : 1,
    borderColor: theme.colors.borderSubtle,
    borderRadius: 14,
    backgroundColor: theme.colors.elevated,
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
    ...typography.style.extraBold,
    color: dark ? theme.colors.text : theme.colors.textSecondary,
    marginBottom: 4,
  },
  input: {
    flex: 1,
    backgroundColor: theme.colors.inputBg,
    borderWidth: dark ? 0 : 1,
    borderColor: theme.colors.inputBorder,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: theme.colors.inputText,
    fontSize: 15,
    ...WEB_INPUT_RESET_STYLE,
  },
  inputError: {
    borderColor: '#dc2626',
    backgroundColor: '#fef2f2',
  },
  errorText: {
    color: '#dc2626',
    fontSize: 12,
    ...typography.style.semiBold,
    marginTop: 4,
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
    ...typography.style.extraBold,
    color: '#ffffff',
    fontSize: 16,
  },
  row: {
    borderWidth: theme.ui.cardBorderWidth,
    borderColor: theme.colors.borderSubtle,
    borderRadius: theme.radius.md,
    padding: 14,
    marginTop: 10,
    backgroundColor: dark ? theme.colors.elevated : theme.colors.card,
    gap: 6,
    ...getCardShadowStyle(theme),
  },
  rowTitle: {
    ...typography.style.extraBold,
    fontSize: 14,
    color: theme.colors.text,
    marginBottom: 2,
  },
  vitalsLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  vitalText: {
    flex: 1,
    fontSize: 13,
    ...typography.style.medium,
    color: dark ? '#C5D4DC' : theme.colors.textSecondary,
    lineHeight: 18,
  },
  symptomsText: {
    fontSize: 13,
    ...typography.style.regular,
    color: theme.colors.textSecondary,
    lineHeight: 18,
    marginTop: 2,
  },
  })
}
