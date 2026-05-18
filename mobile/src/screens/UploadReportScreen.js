import { useCallback, useMemo, useState } from 'react'
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Pressable,
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
import { Screen } from '../components/ui'
import { typography } from '../lib/typography'
import { useTheme } from '../context/ThemeContext'
import { getCardShadowStyle, isDarkTheme } from '../lib/themeUi'

const { width } = Dimensions.get('window')

const ACCEPTED_TYPES = {
  'application/pdf': 'PDF',
  'image/jpeg': 'Image',
  'image/jpg': 'Image',
  'image/png': 'Image',
}

const MAX_SIZE_MB = 10
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024
const USE_NATIVE_DRIVER = Platform.OS !== 'web'

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

export default function UploadReportScreen({ navigation }) {
  const { theme } = useTheme()
  const styles = useMemo(() => createStyles(theme), [theme])
  const { user } = useAuth()
  const { showMessage } = useDialog()
  const { showToast } = useToast()
  const [selectedFile, setSelectedFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [reading, setReading] = useState(false)
  const [banner, setBanner] = useState(null)
  const [online, setOnline] = useState(true)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [scaleAnim] = useState(() => new Animated.Value(1))

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
    if (!file?.uri) return 'Invalid file selected. Please try again.'
    if (!ACCEPTED_TYPES[file?.mimeType || 'application/pdf'])
      return 'Only PDF or image files are allowed.'
    if (Number(file?.size) > MAX_SIZE_BYTES)
      return `File size exceeds ${MAX_SIZE_MB} MB limit.`
    return null
  }

  async function pickFile() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
        multiple: false,
      })

      if (result.canceled || !Array.isArray(result.assets) || result.assets.length === 0) {
        console.log('[ARISE] Document picker canceled or returned no assets')
        return
      }
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
      // Mark image picks so we can run Vision OCR before analysis.
      const normalized = {
        uri: file.uri,
        name: file.name || file.uri.split('/').pop(),
        size: file.size || 0,
        mimeType: file.mimeType || file.type || 'application/pdf',
        base64: file.base64 || null,
        isImage: String((file.mimeType || file.type || '').split('/')[0]).toLowerCase() === 'image',
      }

      setSelectedFile(normalized)

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
    const authUserId = activeSession.user.id

    setUploading(true)
    setUploadProgress(0)
    try {
      // If this is an image, perform a quick OCR read before upload
      let preExtractedText = null
      if (selectedFile?.isImage) {
        try {
          setReading(true)
          setUploadProgress(5)
          // Lazy import to avoid bundling issues on web
          const { callGoogleVisionOcr } = require('../lib/cbcAnalyzer')
          
          let base64 = selectedFile.base64
          if (!base64) {
            // Extract base64 from file URI using fetch + FileReader
            const blob = await (await fetch(selectedFile.uri)).blob()
            base64 = await new Promise((res, rej) => {
              const reader = new FileReader()
              reader.onload = () => {
                const result = reader.result
                // Extract raw base64 after comma if data URL
                const cleanBase64 = result.startsWith('data:') 
                  ? result.split(',')[1] 
                  : result
                res(cleanBase64)
              }
              reader.onerror = rej
              reader.readAsDataURL(blob)
            })
          } else if (base64.startsWith('data:')) {
            // Ensure selectedFile.base64 is raw base64, not data URL
            const commaIndex = base64.indexOf(',')
            if (commaIndex !== -1) {
              base64 = base64.substring(commaIndex + 1)
            }
          }
          
          console.log('[ARISE] Base64 size before Vision OCR:', base64?.length || 0)
          preExtractedText = await callGoogleVisionOcr(base64, selectedFile.mimeType)
          console.log('[ARISE][OCR] Vision OCR text length:', preExtractedText?.length || 0)
          setUploadProgress(15)
        } catch (ocrErr) {
          console.warn('[ARISE] Vision OCR failed, continuing without pre-read:', ocrErr)
        } finally {
          setReading(false)
        }
      }
      setUploadProgress(10)

      // Upload file directly without base64 conversion
      const { filePath, fileUrl } = await uploadReportFile({
        userId: authUserId,
        fileUri: selectedFile.uri,
        fileName: selectedFile.name,
        mimeType: selectedFile.mimeType || 'application/pdf',
      })

      setUploadProgress(50)

      // Create database record
      const { data, error } = await supabase
        .from('reports')
        .insert({
          user_id: authUserId,
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
        preExtractedText,
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
      setTimeout(() => {
        try {
          const parent = navigation.getParent()
          const parentRoutes = parent?.getState?.()?.routeNames || []
          const currentRoutes = navigation.getState?.()?.routeNames || []

          if (currentRoutes.includes('ReportsTab')) {
            navigation.navigate('ReportsTab')
            return
          }
          if (currentRoutes.includes('Home')) {
            navigation.navigate('Home', { screen: 'ReportsTab' })
            return
          }
          if (parent && parentRoutes.includes('ReportsTab')) {
            parent.navigate('ReportsTab')
            return
          }
          if (parent && parentRoutes.includes('Home')) {
            parent.navigate('Home', { screen: 'ReportsTab' })
            return
          }

          console.error('[ARISE] Unable to navigate to ReportsTab after upload')
        } catch (error) {
          console.error('[ARISE] Post-upload navigation failed:', error)
        }
      }, 1500)
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
    <Screen scroll>
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
          <Pressable
            onPress={pickFile}
            disabled={uploading || analyzing}
            style={({ pressed, hovered }) => [
              styles.uploadCard,
              hovered && styles.uploadCardHovered,
              pressed && styles.uploadCardPressed,
              selectedFile && styles.uploadCardActive,
              (uploading || analyzing) && styles.uploadCardDisabled,
              {
                transform: [{ scale: pressed ? 0.978 : hovered ? 1.015 : 1 }],
              },
            ]}
          >
            <View style={styles.uploadCardGlowLayer} />
            <View style={styles.uploadCardInnerHighlight} />
            <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
              {!selectedFile ? (
                <View style={styles.uploadPlaceholder}>
                  <View style={styles.uploadIconWrap}>
                    <Text style={styles.uploadIcon}>📤</Text>
                  </View>
                  <Text style={styles.uploadTitle}>Tap to upload your CBC report</Text>
                  <Text style={styles.uploadSubtitle}>Tap anywhere to select PDF</Text>
                  <Text style={styles.uploadSupportText}>
                    PDF only, up to {MAX_SIZE_MB}MB
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
                      {fileSize} KB • {ACCEPTED_TYPES[selectedFile.mimeType || 'application/pdf']}
                    </Text>
                    <Text style={styles.fileReplaceHint}>Tap anywhere to select PDF</Text>
                  </View>
                  <View style={styles.fileCheck}>
                    <Text style={styles.checkIcon}>✓</Text>
                  </View>
                </View>
              )}
            </Animated.View>
          </Pressable>
        </View>

        {/* Upload Progress */}
        {(uploading || analyzing) && (
          <View style={styles.progressSection}>
            <View style={styles.progressHeader}>
              <Text style={styles.progressTitle}>
                {reading
                  ? 'Reading Report...'
                  : analyzing
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
              selectedFile && styles.uploadButtonEnabled,
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
    </Screen>
  )
}

function createStyles(theme) {
  const dark = isDarkTheme(theme)
  const uploadCardShadow =
    Platform.OS === 'web'
      ? dark
        ? {
            boxShadow:
              '0px 20px 48px rgba(0, 0, 0, 0.45), 0px 0px 28px rgba(39, 225, 193, 0.08), inset 0px 1px 0px rgba(255,255,255,0.04)',
          }
        : { boxShadow: '0px 20px 38px rgba(15,118,110,0.24), 0px 2px 0px rgba(16,185,129,0.24)' }
      : getCardShadowStyle(theme)

  const uploadHoverGlow =
    Platform.OS === 'web'
      ? dark
        ? {
            boxShadow:
              '0px 24px 52px rgba(0, 0, 0, 0.5), 0px 0px 32px rgba(39, 225, 193, 0.14), 0px 0px 0px 1.5px rgba(39, 225, 193, 0.35)',
          }
        : { boxShadow: '0px 22px 40px rgba(16,185,129,0.24), 0px 0px 0px 1.5px rgba(110,231,183,0.72)' }
      : { shadowOpacity: 0.38, shadowRadius: 26 }

  const uploadIconShadow =
    Platform.OS === 'web'
      ? dark
        ? {
            boxShadow:
              '0px 12px 28px rgba(0, 0, 0, 0.4), 0px 0px 20px rgba(39, 225, 193, 0.2), 0px 0px 0px 1px rgba(39, 225, 193, 0.25)',
          }
        : { boxShadow: '0px 14px 26px rgba(15,118,110,0.30), 0px 0px 0px 1px rgba(110,231,183,0.9)' }
      : {
          shadowColor: dark ? theme.colors.accentSecondary : '#16a34a',
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: dark ? 0.28 : 0.34,
          shadowRadius: 18,
        }

  const webTransition =
    Platform.OS === 'web'
      ? {
          transitionProperty: 'transform, box-shadow, background-color, border-color',
          transitionDuration: '180ms',
          transitionTimingFunction: 'ease-out',
        }
      : {}

  return StyleSheet.create({
  header: {
    marginBottom: 24,
  },
  headerEyebrow: {
    fontSize: 12,
    ...typography.style.bold,
    color: theme.colors.textSecondary,
    letterSpacing: 0.4,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  headerTitle: {
    fontSize: 30,
    ...typography.style.extraBold,
    color: theme.colors.text,
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    ...typography.style.medium,
    lineHeight: 20,
  },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: dark ? 'rgba(220, 38, 38, 0.12)' : '#fef2f2',
    borderRadius: theme.radius.md,
    padding: 14,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#dc2626',
    gap: 12,
    borderWidth: dark ? 0 : 0,
  },
  offlineIcon: {
    fontSize: 20,
  },
  offlineContent: {
    flex: 1,
  },
  offlineTitle: {
    fontSize: 13,
    ...typography.style.bold,
    color: dark ? '#FCA5A5' : '#7f1d1d',
    marginBottom: 2,
  },
  offlineSubtitle: {
    fontSize: 12,
    color: dark ? '#F87171' : '#991b1b',
  },
  messageBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: theme.radius.md,
    padding: 14,
    marginBottom: 16,
    borderLeftWidth: 4,
    gap: 12,
  },
  messageBannerError: {
    backgroundColor: dark ? 'rgba(220, 38, 38, 0.12)' : '#fef2f2',
    borderLeftColor: '#dc2626',
  },
  messageBannerWarning: {
    backgroundColor: dark ? 'rgba(245, 158, 11, 0.12)' : '#fffbeb',
    borderLeftColor: '#f59e0b',
  },
  messageBannerSuccess: {
    backgroundColor: dark ? 'rgba(39, 225, 193, 0.1)' : '#f0fdf4',
    borderLeftColor: dark ? theme.colors.accentSecondary : '#10b981',
  },
  messageBannerIcon: {
    fontSize: 18,
  },
  messageBannerText: {
    flex: 1,
    fontSize: 13,
    ...typography.style.semiBold,
    color: theme.colors.text,
  },
  uploadSection: {
    marginBottom: 24,
  },
  uploadCard: {
    backgroundColor: dark ? 'rgba(22, 35, 45, 0.72)' : '#e8f6ee',
    borderRadius: theme.radius.card,
    borderWidth: 2,
    borderColor: dark ? 'rgba(39, 225, 193, 0.35)' : '#69c997',
    borderStyle: 'dashed',
    paddingVertical: 22,
    paddingHorizontal: 20,
    marginBottom: 10,
    elevation: dark ? 8 : 7,
    position: 'relative',
    overflow: 'hidden',
    ...uploadCardShadow,
    ...webTransition,
  },
  uploadCardGlowLayer: {
    position: 'absolute',
    top: -32,
    right: -20,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: dark ? 'rgba(39, 225, 193, 0.12)' : 'rgba(134,239,172,0.28)',
    pointerEvents: 'none',
  },
  uploadCardInnerHighlight: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 64,
    backgroundColor: dark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.56)',
    pointerEvents: 'none',
  },
  uploadCardHovered: {
    backgroundColor: dark ? 'rgba(22, 35, 45, 0.88)' : '#dff3e7',
    borderColor: dark ? 'rgba(39, 225, 193, 0.55)' : '#4fbe83',
    ...uploadHoverGlow,
  },
  uploadCardPressed: {
    backgroundColor: dark ? 'rgba(17, 28, 36, 0.95)' : '#d7efdf',
    borderColor: dark ? theme.colors.accentSecondary : '#46ad73',
  },
  uploadCardActive: {
    backgroundColor: dark ? 'rgba(39, 225, 193, 0.08)' : '#daf2e3',
    borderColor: dark ? theme.colors.accentSecondary : '#3ea967',
  },
  uploadCardDisabled: {
    opacity: 0.65,
  },
  uploadPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  uploadIconWrap: {
    width: 104,
    height: 104,
    borderRadius: 28,
    backgroundColor: dark ? 'rgba(39, 225, 193, 0.1)' : '#c9eedb',
    borderWidth: 1,
    borderColor: dark ? 'rgba(39, 225, 193, 0.28)' : '#69c995',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
    ...uploadIconShadow,
  },
  uploadIcon: {
    fontSize: 40,
  },
  uploadTitle: {
    fontSize: 18,
    ...typography.style.extraBold,
    color: theme.colors.text,
    marginBottom: 5,
    textAlign: 'center',
  },
  uploadSubtitle: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 6,
  },
  uploadSupportText: {
    fontSize: 11,
    color: theme.colors.muted,
    ...typography.style.semiBold,
  },
  filePreview: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: dark ? 'rgba(15, 26, 34, 0.65)' : '#f0fdf9',
    borderRadius: theme.radius.md,
    padding: 14,
    gap: 12,
    borderWidth: dark ? 1 : 0,
    borderColor: dark ? 'rgba(39, 225, 193, 0.15)' : 'transparent',
  },
  fileIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: dark ? 'rgba(39, 225, 193, 0.12)' : '#dbeae8',
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
    ...typography.style.bold,
    color: theme.colors.text,
    marginBottom: 2,
  },
  fileDetails: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    ...typography.style.medium,
  },
  fileReplaceHint: {
    marginTop: 4,
    fontSize: 11,
    color: dark ? theme.colors.accentSecondary : '#1e5a4a',
    ...typography.style.semiBold,
  },
  fileCheck: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: dark ? theme.colors.accentSecondary : '#10b981',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkIcon: {
    fontSize: 18,
    color: dark ? '#07111A' : '#fff',
    ...typography.style.extraBold,
  },
  progressSection: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.card,
    padding: 18,
    marginBottom: 20,
    borderWidth: theme.ui.cardBorderWidth,
    borderColor: theme.colors.borderSubtle,
    ...getCardShadowStyle(theme),
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  progressTitle: {
    fontSize: 14,
    ...typography.style.bold,
    color: theme.colors.text,
  },
  progressPercent: {
    fontSize: 14,
    ...typography.style.extraBold,
    color: dark ? theme.colors.accentSecondary : theme.colors.primary,
  },
  progressBar: {
    height: 8,
    backgroundColor: dark ? 'rgba(255,255,255,0.08)' : '#e2e8f0',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 16,
  },
  progressFill: {
    height: '100%',
    backgroundColor: dark ? theme.colors.accentSecondary : theme.colors.primary,
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
    backgroundColor: dark ? 'rgba(255,255,255,0.08)' : '#e2e8f0',
    color: theme.colors.muted,
    fontSize: 14,
    ...typography.style.bold,
    textAlign: 'center',
    lineHeight: 32,
    marginBottom: 6,
  },
  progressStepTextDone: {
    backgroundColor: dark ? theme.colors.accentSecondary : '#10b981',
    color: dark ? '#07111A' : '#fff',
  },
  progressStepLabel: {
    fontSize: 11,
    ...typography.style.semiBold,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  progressConnector: {
    flex: 1,
    height: 1.5,
    backgroundColor: dark ? 'rgba(255,255,255,0.08)' : '#e2e8f0',
    marginHorizontal: 8,
  },
  buttonGroup: {
    gap: 12,
    marginBottom: 24,
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 58,
    borderRadius: theme.radius.md,
    backgroundColor: dark ? theme.colors.primary : '#1e5a4a',
    elevation: dark ? 6 : 4,
    gap: 8,
    ...(Platform.OS === 'web'
      ? {
          boxShadow: dark
            ? '0px 8px 24px rgba(39, 225, 193, 0.22)'
            : '0px 2px 6px rgba(30,90,74,0.25)',
        }
      : {}),
  },
  uploadButtonEnabled: {
    backgroundColor: dark ? theme.colors.primary : '#1e5a4a',
    ...(Platform.OS === 'web' && dark
      ? { boxShadow: '0px 12px 32px rgba(39, 225, 193, 0.28)' }
      : {}),
  },
  uploadButtonDisabled: {
    backgroundColor: dark ? 'rgba(107, 127, 140, 0.45)' : '#b8c1cc',
    elevation: 0,
    ...(Platform.OS === 'web' ? { boxShadow: 'none' } : {}),
  },
  uploadButtonIcon: {
    fontSize: 18,
  },
  uploadButtonText: {
    fontSize: 16,
    ...typography.style.extraBold,
    color: dark ? '#07111A' : '#fff',
    letterSpacing: 0.3,
  },
  infoSection: {
    gap: 10,
    marginTop: 6,
    marginBottom: 20,
  },
  infoCard: {
    backgroundColor: theme.colors.elevated,
    borderRadius: theme.radius.md,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderLeftWidth: 3,
    borderLeftColor: dark ? theme.colors.accentSecondary : '#5a8d7f',
    borderWidth: theme.ui.cardBorderWidth,
    borderColor: theme.colors.borderSubtle,
    ...getCardShadowStyle(theme),
  },
  infoCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 6,
  },
  infoCardIcon: {
    fontSize: 16,
  },
  infoCardTitle: {
    fontSize: 13,
    ...typography.style.semiBold,
    color: theme.colors.text,
  },
  infoCardText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    ...typography.style.regular,
    lineHeight: 17,
  },
  footer: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  footerText: {
    fontSize: 12,
    color: theme.colors.muted,
    ...typography.style.medium,
    textAlign: 'center',
  },
  })
}