import { useCallback, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import * as DocumentPicker from 'expo-document-picker'
import * as Haptics from 'expo-haptics'
import { useFocusEffect } from '@react-navigation/native'
import { useAuth } from '../context/AuthContext'
import { useDialog } from '../context/DialogContext'
import { useToast } from '../context/ToastContext'
import { supabase } from '../lib/supabaseClient'
import { uploadReportFile } from '../lib/cbcAnalyzer'
import { analyzeExistingReport, REPORT_ANALYSIS_STATUS, updateReportStatus } from '../lib/reportAnalysisService'
import { isDeviceOnline, toFriendlyError } from '../lib/network'
import { Card, Heading, PrimaryButton, Screen, Subtle } from '../components/ui'
import PageHeader from '../components/PageHeader'
import InlineBanner from '../components/InlineBanner'

const ACCEPTED_TYPES = {
  'application/pdf': 'PDF',
  'image/jpeg': 'JPG',
  'image/jpg': 'JPG',
  'image/png': 'PNG',
}

const MAX_SIZE_MB = 10
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024

export default function UploadReportScreen({ navigation }) {
  const { user } = useAuth()
  const { showMessage } = useDialog()
  const { showToast } = useToast()
  const [selectedFile, setSelectedFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [banner, setBanner] = useState(null)
  const [online, setOnline] = useState(true)

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
    if (!ACCEPTED_TYPES[file.mimeType]) return 'Only PDF, JPG, and PNG files are allowed.'
    if (file.size > MAX_SIZE_BYTES) return `File size exceeds ${MAX_SIZE_MB} MB limit.`
    return null
  }

  async function pickFile() {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/*'],
      copyToCacheDirectory: true,
      multiple: false,
    })

    if (result.canceled) return
    const file = result.assets[0]

    const validationError = validateFile(file)
    if (validationError) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
      showToast(validationError, 'warning')
      setBanner({ tone: 'warning', message: validationError })
      await showMessage({ title: 'Invalid File', message: validationError, tone: 'warning' })
      setSelectedFile(null)
      return
    }

    await Haptics.selectionAsync()
    setSelectedFile(file)
  }

  async function handleUpload() {
    if (!selectedFile || !user) return

    const connected = await isDeviceOnline()
    setOnline(connected)
    if (!connected) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
      showToast("You're offline or connection is unstable", 'warning')
      setBanner({ tone: 'warning', message: "You're offline or connection is unstable" })
      return
    }

    setUploading(true)
    try {
      const { filePath, fileUrl } = await uploadReportFile({
        userId: user.id,
        fileUri: selectedFile.uri,
        fileName: selectedFile.name,
        mimeType: selectedFile.mimeType,
      })

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
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
        showToast('Upload failed. Please try again.', 'error')
        setBanner({ tone: 'error', message: 'Upload failed. Please try again.' })
        await showMessage({ title: 'Upload Failed', message: error.message, tone: 'error' })
        return
      }

      await updateReportStatus(data.id, REPORT_ANALYSIS_STATUS.UPLOADED)

      setAnalyzing(true)
      const analysisResult = await analyzeExistingReport({
        reportId: data.id,
        fileUri: selectedFile.uri,
        filePath,
        fileType: selectedFile.mimeType,
        timeoutMs: 35000,
      })
      setAnalyzing(false)

      if (!analysisResult.success) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
        showToast('Uploaded, but analysis needs retry.', 'warning')
        setBanner({ tone: 'warning', message: 'Uploaded, but analysis failed. Retry from report details.' })
        await showMessage({
          title: 'Uploaded with Warning',
          message: `Report uploaded, but analysis failed: ${analysisResult.error}`,
          tone: 'warning',
        })
      } else {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
        showToast('Report uploaded and analyzed.', 'success')
        setBanner({ tone: 'success', message: 'Report uploaded and analyzed.' })
        await showMessage({ title: 'Success', message: 'Report uploaded and analyzed.', tone: 'success' })
      }

      setSelectedFile(null)
      navigation.navigate('ReportsTab')
    } catch (err) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      const errorMessage = toFriendlyError(err, 'Unexpected upload error occurred.')
      showToast(errorMessage, 'error')
      setBanner({ tone: 'error', message: errorMessage })
      await showMessage({ title: 'Upload Failed', message: errorMessage, tone: 'error' })
    } finally {
      setUploading(false)
      setAnalyzing(false)
    }
  }

  return (
    <Screen>
      <PageHeader
        eyebrow="Reports"
        title="Upload CBC Report"
        subtitle="Select a report file and ARISE will upload and analyze it automatically."
      />

      {!online ? <InlineBanner tone="warning" message="You're offline or connection is unstable" /> : null}
      {banner ? <InlineBanner tone={banner.tone} message={banner.message} /> : null}

      <Card>
        {!selectedFile ? <Subtle>No file selected.</Subtle> : null}
        {selectedFile ? (
          <View style={styles.fileMeta}>
            <Text style={styles.fileName}>{selectedFile.name}</Text>
            <Subtle>{Math.round((selectedFile.size || 0) / 1024)} KB | {ACCEPTED_TYPES[selectedFile.mimeType]}</Subtle>
          </View>
        ) : null}

        <PrimaryButton title="Choose File" onPress={pickFile} disabled={uploading || analyzing} />
        <PrimaryButton
          title={analyzing ? 'Analyzing Report...' : uploading ? 'Uploading Report...' : 'Upload and Analyze'}
          onPress={handleUpload}
          disabled={!selectedFile || uploading || analyzing || !online}
          loading={uploading || analyzing}
        />
      </Card>

      <Card style={styles.noteCard}>
        <Heading>Secure and Private</Heading>
        <Subtle>
          Your report is stored in your Supabase storage bucket and only your account can access it through your existing RLS policies.
        </Subtle>
      </Card>
    </Screen>
  )
}

const styles = StyleSheet.create({
  fileMeta: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  fileName: {
    color: '#0f172a',
    fontWeight: '700',
  },
  noteCard: {
    backgroundColor: '#eff6ff',
    borderColor: '#bfdbfe',
  },
})
