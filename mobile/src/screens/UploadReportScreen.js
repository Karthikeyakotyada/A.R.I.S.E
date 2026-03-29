import { useCallback, useState } from 'react'
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  SafeAreaView,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
  Animated,
  Platform,
} from 'react-native'
import * as DocumentPicker from 'expo-document-picker'
import * as Haptics from 'expo-haptics'
import { useFocusEffect } from '@react-navigation/native'
import { useAuth } from '../context/AuthContext'
import { useDialog } from '../context/DialogContext'
import { useToast } from '../context/ToastContext'
import { ensureValidSession, supabase } from '../lib/supabaseClient'
import { uploadReportFile } from '../lib/cbcAnalyzer'
import {
  analyzeExistingReport,
  REPORT_ANALYSIS_STATUS,
  updateReportStatus,
} from '../lib/reportAnalysisService'
import { isDeviceOnline, toFriendlyError } from '../lib/network'
import { Card, Heading, PrimaryButton, Screen, Subtle } from '../components/ui'
import PageHeader from '../components/PageHeader'
import InlineBanner from '../components/InlineBanner'

const { width } = Dimensions.get('window')

const ACCEPTED_TYPES = {
  'application/pdf': 'PDF',
}

const MAX_SIZE_MB = 10
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024
const USE_NATIVE_DRIVER = Platform.OS !== 'web'
const UPLOAD_CARD_SHADOW_STYLE =
  Platform.OS === 'web'
    ? { boxShadow: '0px 1px 4px rgba(0,0,0,0.05)' }
    : {}

const UPLOAD_BUTTON_SHADOW_STYLE =
  Platform.OS === 'web'
    ? { boxShadow: '0px 2px 6px rgba(30,90,74,0.25)' }
    : {}

const UPLOAD_BUTTON_DISABLED_SHADOW_STYLE =
  Platform.OS === 'web' ? { boxShadow: 'none' } : {}

const INFO_CARD_SHADOW_STYLE =
  Platform.OS === 'web'
    ? { boxShadow: '0px 1px 2px rgba(0,0,0,0.05)' }
    : {}

function hasDetectedValues(analysis) {
  if (!analysis) return false
  const fields = ['hemoglobin', 'rbc', 'wbc', 'platelets']
  return fields.some((field) => {
    const value = Number(analysis[field])
    return Number.isFinite(value) && value > 0
  })
}

export default function UploadReportScreen({ navigation }) {
  const { user } = useAuth()
  const { showMessage } = useDialog()
  const { showToast } = useToast()
  const [selectedFile, setSelectedFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [banner, setBanner] = useState(null)
  const [online, setOnline] = useState(true)
  const [uploadProgress, setUploadProgress] = useState(0)
  const scaleAnim = new Animated.Value(1)

  const refreshNetworkState = useCallback(async () => {
    const nextOnline = await isDeviceOnline()
    setOnline(nextOnline)
  }, [])

  useFocusEffect(
    useCallback(() => {
      refreshNetworkState()
    }, [refreshNetworkState])
  )

  function validateFile(file) {
    if (!ACCEPTED_TYPES[file.mimeType])
      return 'Only PDF files are allowed.'
    if (file.size > MAX_SIZE_BYTES)
      return `File size exceeds ${MAX_SIZE_MB} MB limit.`
    return null
  }

  async function pickFile() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf'],
        copyToCacheDirectory: true,
        multiple: false,
      })

      if (result.canceled) return
      const file = result.assets[0]

      const validationError = validateFile(file)
      if (validationError) {
        await Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Warning
        )
        showToast(validationError, 'warning')
        setBanner({ tone: 'warning', message: validationError })
        await showMessage({
          title: 'Invalid File',
          message: validationError,
          tone: 'warning',
        })
        setSelectedFile(null)
        return
      }

      await Haptics.selectionAsync()
      setSelectedFile(file)

      // Animate selection
      Animated.sequence([
        Animated.timing(scaleAnim, {
          toValue: 1.05,
          duration: 150,
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: 150,
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
      ]).start()
    } catch (error) {
      console.error('File picker error:', error)
      showToast('Error selecting file', 'error')
    }
  }

  async function handleUpload() {
    if (!selectedFile || !user) return

    const connected = await isDeviceOnline()
    setOnline(connected)
    if (!connected) {
      await Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Warning
      )
      showToast("You're offline or connection is unstable", 'warning')
      setBanner({
        tone: 'warning',
        message: "You're offline or connection is unstable",
      })
      return
    }

    const activeSession = await ensureValidSession()
    if (!activeSession?.user?.id) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
      showToast('Session expired. Please sign in again.', 'warning')
      setBanner({ tone: 'warning', message: 'Session expired. Please sign in again.' })
      await showMessage({
        title: 'Session Expired',
        message: 'Your login session has expired. Please sign in again to continue.',
        tone: 'warning',
      })
      return
    }

    setUploading(true)
    setUploadProgress(0)
    try {
      setUploadProgress(10)

      // Upload file directly without base64 conversion
      const { filePath, fileUrl } = await uploadReportFile({
        userId: user.id,
        fileUri: selectedFile.uri,
        fileName: selectedFile.name,
        mimeType: selectedFile.mimeType,
      })

      setUploadProgress(50)

      // Create database record
      const { data, error } = await supabase
        .from('reports')
        .insert({
          user_id: user.id,
          file_name: selectedFile.name,
          file_url: fileUrl,
        })
        .select()
        .single()

      if (error) {
        console.error('Database error:', error)
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
        showToast('Upload failed. Please try again.', 'error')
        setBanner({
          tone: 'error',
          message: 'Upload failed. Please try again.',
        })
        await showMessage({
          title: 'Upload Failed',
          message: error.message,
          tone: 'error',
        })
        return
      }

      setUploadProgress(70)
      await updateReportStatus(data.id, REPORT_ANALYSIS_STATUS.UPLOADED)

      // Analyze report
      setAnalyzing(true)
      const analysisResult = await analyzeExistingReport({
        reportId: data.id,
        fileUri: selectedFile.uri,
        filePath,
        fileType: selectedFile.mimeType,
        timeoutMs: 35000,
      })
      setAnalyzing(false)
      setUploadProgress(100)

      if (!analysisResult.success || !hasDetectedValues(analysisResult.data)) {
        await Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Warning
        )
        showToast('Upload complete. Analysis needs a clearer report.', 'warning')
        setBanner({
          tone: 'warning',
          message: 'Upload complete, but CBC values were not detected. Open this report and tap Re-analyze with a clearer patient-result PDF.',
        })
        await showMessage({
          title: 'Uploaded with Warning',
          message: hasDetectedValues(analysisResult.data)
            ? `Report uploaded, but analysis failed: ${analysisResult.error}`
            : 'Report uploaded, but no CBC values were detected from this PDF. Please retry with a clearer report.',
          tone: 'warning',
        })
      } else {
        await Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success
        )
        showToast('Report uploaded and analyzed successfully!', 'success')
        setBanner({
          tone: 'success',
          message: '✅ Report uploaded and analyzed successfully!',
        })
        await showMessage({
          title: 'Success',
          message: 'Report uploaded and analyzed successfully!',
          tone: 'success',
        })
      }

      setSelectedFile(null)
      setTimeout(() => navigation.navigate('ReportsTab'), 1500)
    } catch (err) {
      console.error('Upload error:', err)
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      const errorMessage = toFriendlyError(
        err,
        'Unexpected upload error occurred.'
      )
      showToast(errorMessage, 'error')
      setBanner({ tone: 'error', message: errorMessage })
      await showMessage({
        title: 'Upload Failed',
        message: errorMessage,
        tone: 'error',
      })
    } finally {
      setUploading(false)
      setAnalyzing(false)
      setUploadProgress(0)
    }
  }

  const isReady = selectedFile && online && !uploading && !analyzing
  const fileSize = selectedFile ? Math.round((selectedFile.size || 0) / 1024) : 0

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.container}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerEyebrow}>Reports</Text>
          <Text style={styles.headerTitle}>Upload Report</Text>
          <Text style={styles.headerSubtitle}>
            Upload a CBC PDF and get AI-powered extraction in seconds
          </Text>
        </View>

        {/* Network Status */}
        {!online && (
          <View style={styles.offlineBanner}>
            <Text style={styles.offlineIcon}>📡</Text>
            <View style={styles.offlineContent}>
              <Text style={styles.offlineTitle}>Connection Lost</Text>
              <Text style={styles.offlineSubtitle}>
                Check your internet connection
              </Text>
            </View>
          </View>
        )}

        {banner && (
          <View
            style={[
              styles.messageBanner,
              banner.tone === 'error' && styles.messageBannerError,
              banner.tone === 'warning' && styles.messageBannerWarning,
              banner.tone === 'success' && styles.messageBannerSuccess,
            ]}
          >
            <Text style={styles.messageBannerIcon}>
              {banner.tone === 'error'
                ? '❌'
                : banner.tone === 'warning'
                  ? '⚠️'
                  : '✅'}
            </Text>
            <Text style={styles.messageBannerText}>{banner.message}</Text>
          </View>
        )}

        {/* Upload Area */}
        <View style={styles.uploadSection}>
          <Animated.View
            style={[
              styles.uploadCard,
              { transform: [{ scale: scaleAnim }] },
            ]}
          >
            {!selectedFile ? (
              <View style={styles.uploadPlaceholder}>
                <Text style={styles.uploadIcon}>📄</Text>
                <Text style={styles.uploadTitle}>No PDF Selected</Text>
                <Text style={styles.uploadSubtitle}>
                  Choose a clear patient CBC report PDF to get started
                </Text>
              </View>
            ) : (
              <View style={styles.filePreview}>
                <View style={styles.fileIconContainer}>
                  <Text style={styles.fileIcon}>📕</Text>
                </View>
                <View style={styles.fileInfo}>
                  <Text style={styles.fileName} numberOfLines={1}>
                    {selectedFile.name}
                  </Text>
                  <Text style={styles.fileDetails}>
                    {fileSize} KB • {ACCEPTED_TYPES[selectedFile.mimeType]}
                  </Text>
                </View>
                <View style={styles.fileCheck}>
                  <Text style={styles.checkIcon}>✓</Text>
                </View>
              </View>
            )}

            <TouchableOpacity
              style={[
                styles.selectButton,
                (uploading || analyzing) && styles.selectButtonDisabled,
              ]}
              onPress={pickFile}
              disabled={uploading || analyzing}
            >
              <Text style={styles.selectButtonIcon}>📁</Text>
              <Text style={styles.selectButtonText}>
                {selectedFile ? 'Choose Another PDF' : 'Choose PDF'}
              </Text>
            </TouchableOpacity>
          </Animated.View>
        </View>

        {/* Upload Progress */}
        {(uploading || analyzing) && (
          <View style={styles.progressSection}>
            <View style={styles.progressHeader}>
              <Text style={styles.progressTitle}>
                {analyzing
                  ? 'Analyzing Report'
                  : uploading
                    ? 'Uploading Report'
                    : 'Processing'}
              </Text>
              <Text style={styles.progressPercent}>
                {Math.round(uploadProgress)}%
              </Text>
            </View>
            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${uploadProgress}%` },
                ]}
              />
            </View>
            <View style={styles.progressSteps}>
              <View
                style={[
                  styles.progressStep,
                  uploadProgress >= 50 && styles.progressStepDone,
                ]}
              >
                <Text
                  style={[
                    styles.progressStepText,
                    uploadProgress >= 50 && styles.progressStepTextDone,
                  ]}
                >
                  ✓
                </Text>
                <Text style={styles.progressStepLabel}>Upload</Text>
              </View>

              <View style={styles.progressConnector} />

              <View
                style={[
                  styles.progressStep,
                  uploadProgress >= 100 && styles.progressStepDone,
                ]}
              >
                <Text
                  style={[
                    styles.progressStepText,
                    uploadProgress >= 100 && styles.progressStepTextDone,
                  ]}
                >
                  ✓
                </Text>
                <Text style={styles.progressStepLabel}>Analyze</Text>
              </View>
            </View>
          </View>
        )}

        {/* Action Buttons */}
        <View style={styles.buttonGroup}>
          <TouchableOpacity
            style={[
              styles.uploadButton,
              !isReady && styles.uploadButtonDisabled,
            ]}
            onPress={handleUpload}
            disabled={!isReady}
          >
            {uploading || analyzing ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Text style={styles.uploadButtonIcon}>⬆️</Text>
                <Text style={styles.uploadButtonText}>
                  Upload & Analyze
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Info Cards */}
        <View style={styles.infoSection}>
          <View style={styles.infoCard}>
            <View style={styles.infoCardHeader}>
              <Text style={styles.infoCardIcon}>✨</Text>
              <Text style={styles.infoCardTitle}>What We Accept</Text>
            </View>
            <Text style={styles.infoCardText}>
              PDF files up to {MAX_SIZE_MB}MB. Best results come from reports with clear patient result columns.
            </Text>
          </View>

          <View style={styles.infoCard}>
            <View style={styles.infoCardHeader}>
              <Text style={styles.infoCardIcon}>🔒</Text>
              <Text style={styles.infoCardTitle}>100% Private</Text>
            </View>
            <Text style={styles.infoCardText}>
              Your data is encrypted and only accessible by you
            </Text>
          </View>

          <View style={styles.infoCard}>
            <View style={styles.infoCardHeader}>
              <Text style={styles.infoCardIcon}>⚡</Text>
              <Text style={styles.infoCardTitle}>AI Analysis</Text>
            </View>
            <Text style={styles.infoCardText}>
              ARISE extracts Hemoglobin, RBC, WBC, and Platelets, then generates a short summary.
            </Text>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Need help? Check our documentation or contact support
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  header: {
    marginBottom: 28,
  },
  headerEyebrow: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
    letterSpacing: 0.3,
    marginBottom: 4,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '900',
    color: '#0f172a',
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '500',
    lineHeight: 20,
  },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef2f2',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#dc2626',
    gap: 12,
  },
  offlineIcon: {
    fontSize: 20,
  },
  offlineContent: {
    flex: 1,
  },
  offlineTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#7f1d1d',
    marginBottom: 2,
  },
  offlineSubtitle: {
    fontSize: 12,
    color: '#991b1b',
  },
  messageBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderLeftWidth: 4,
    gap: 12,
  },
  messageBannerError: {
    backgroundColor: '#fef2f2',
    borderLeftColor: '#dc2626',
  },
  messageBannerWarning: {
    backgroundColor: '#fffbeb',
    borderLeftColor: '#f59e0b',
  },
  messageBannerSuccess: {
    backgroundColor: '#f0fdf4',
    borderLeftColor: '#10b981',
  },
  messageBannerIcon: {
    fontSize: 18,
  },
  messageBannerText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#1e293b',
  },
  uploadSection: {
    marginBottom: 28,
  },
  uploadCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#e2e8f0',
    borderStyle: 'dashed',
    padding: 24,
    gap: 16,
    elevation: 2,
    ...UPLOAD_CARD_SHADOW_STYLE,
  },
  uploadPlaceholder: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  uploadIcon: {
    fontSize: 56,
    marginBottom: 12,
  },
  uploadTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 4,
  },
  uploadSubtitle: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 18,
  },
  filePreview: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0fdf9',
    borderRadius: 12,
    padding: 14,
    gap: 12,
  },
  fileIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: '#dbeae8',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fileIcon: {
    fontSize: 24,
  },
  fileInfo: {
    flex: 1,
  },
  fileName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 2,
  },
  fileDetails: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
  },
  fileCheck: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#10b981',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkIcon: {
    fontSize: 18,
    color: '#fff',
    fontWeight: '800',
  },
  selectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    borderWidth: 1.5,
    borderColor: '#cbd5e0',
    gap: 8,
  },
  selectButtonDisabled: {
    backgroundColor: '#e2e8f0',
    borderColor: '#cbd5e0',
  },
  selectButtonIcon: {
    fontSize: 18,
  },
  selectButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1e5a4a',
  },
  progressSection: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 18,
    marginBottom: 20,
    elevation: 2,
    ...UPLOAD_CARD_SHADOW_STYLE,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  progressTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
  },
  progressPercent: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1e5a4a',
  },
  progressBar: {
    height: 8,
    backgroundColor: '#e2e8f0',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 16,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#1e5a4a',
    borderRadius: 4,
  },
  progressSteps: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  progressStep: {
    alignItems: 'center',
    flex: 1,
  },
  progressStepDone: {
    opacity: 1,
  },
  progressStepText: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#e2e8f0',
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 32,
    marginBottom: 6,
  },
  progressStepTextDone: {
    backgroundColor: '#10b981',
    color: '#fff',
  },
  progressStepLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
    textAlign: 'center',
  },
  progressConnector: {
    flex: 1,
    height: 1.5,
    backgroundColor: '#e2e8f0',
    marginHorizontal: 8,
  },
  buttonGroup: {
    gap: 12,
    marginBottom: 28,
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 56,
    borderRadius: 12,
    backgroundColor: '#1e5a4a',
    elevation: 4,
    ...UPLOAD_BUTTON_SHADOW_STYLE,
    gap: 8,
  },
  uploadButtonDisabled: {
    backgroundColor: '#cbd5e0',
    elevation: 0,
    ...UPLOAD_BUTTON_DISABLED_SHADOW_STYLE,
  },
  uploadButtonIcon: {
    fontSize: 18,
  },
  uploadButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.3,
  },
  infoSection: {
    gap: 12,
    marginBottom: 28,
  },
  infoCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 14,
    borderLeftWidth: 4,
    borderLeftColor: '#1e5a4a',
    elevation: 1,
    ...INFO_CARD_SHADOW_STYLE,
  },
  infoCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 6,
  },
  infoCardIcon: {
    fontSize: 18,
  },
  infoCardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
  },
  infoCardText: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
    lineHeight: 16,
  },
  footer: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  footerText: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '500',
  },
})