import { useCallback, useMemo, useState } from 'react'
import { ActivityIndicator, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator'
import { Card, Screen, Subtle } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useDialog } from '../context/DialogContext'
import { useToast } from '../context/ToastContext'
import { supabase } from '../lib/supabaseClient'
import { typography } from '../lib/typography'

const AVATAR_BUCKET = 'avatars'

export default function ProfileScreen({ navigation }) {
  const { user, signOut } = useAuth()
  const { showConfirm, showMessage } = useDialog()
  const { showToast } = useToast()
  const [stats, setStats] = useState({ reports: 0, logs: 0, healthScore: '-' })
  const [statsLoading, setStatsLoading] = useState(true)
  const [profileData, setProfileData] = useState(null)
  const [profileLoading, setProfileLoading] = useState(true)
  const [profileError, setProfileError] = useState('')
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [avatarSheetVisible, setAvatarSheetVisible] = useState(false)
  const [cropVisible, setCropVisible] = useState(false)
  const [pendingAvatarUri, setPendingAvatarUri] = useState(null)
  const [pendingAvatarWidth, setPendingAvatarWidth] = useState(0)
  const [pendingAvatarHeight, setPendingAvatarHeight] = useState(0)
  const [avatarRotation, setAvatarRotation] = useState(0)
  const [preparingAvatar, setPreparingAvatar] = useState(false)

  const currentAvatarUrl = profileData
    ? (profileData.avatar_url || null)
    : (user?.user_metadata?.avatar_url || null)
  const hasAvatar = Boolean(currentAvatarUrl)

  const displayName = user?.user_metadata?.name || user?.email?.split('@')[0] || 'User'
  const initials = displayName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  const accountCreated = useMemo(() => {
    const source = user?.created_at || user?.last_sign_in_at
    if (!source) return 'Recently joined'
    const date = new Date(source)
    if (Number.isNaN(date.getTime())) return 'Recently joined'
    return `Joined ${date.toLocaleDateString()}`
  }, [user?.created_at, user?.last_sign_in_at])

  const personalHealthInfo = useMemo(() => {
    const read = (value) => {
      if (value === undefined || value === null || String(value).trim() === '') {
        return 'Not set'
      }
      return String(value)
    }

    return [
      { label: 'Age', value: read(profileData?.age) },
      { label: 'Gender', value: read(profileData?.gender) },
      { label: 'Blood Group', value: read(profileData?.blood_group) },
      { label: 'Height', value: read(profileData?.height) },
      {
        label: 'Emergency Contact',
        value: read(profileData?.emergency_contact),
      },
    ]
  }, [profileData])

  const loadProfile = useCallback(async () => {
    if (!user?.id) return
    setProfileLoading(true)
    setProfileError('')
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('age, gender, blood_group, height, emergency_contact, avatar_url')
        .eq('id', user.id)
        .maybeSingle()

      if (error) throw error
      setProfileData(data || null)
    } catch (error) {
      setProfileError(error?.message || 'Could not load profile info.')
      setProfileData(null)
    } finally {
      setProfileLoading(false)
    }
  }, [user?.id])

  const loadStats = useCallback(async () => {
    if (!user) return
    setStatsLoading(true)
    try {
      const [{ data: reports }, { data: logs }, { data: analyses }] = await Promise.all([
        supabase.from('reports').select('id').eq('user_id', user.id),
        supabase.from('health_logs').select('id').eq('user_id', user.id),
        supabase
          .from('report_analysis')
          .select('health_score, reports!inner(user_id)')
          .eq('reports.user_id', user.id),
      ])

      const scores = (analyses || [])
        .map((entry) => Number(entry.health_score))
        .filter((score) => Number.isFinite(score))
      const averageScore = scores.length
        ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length)
        : '-'

      setStats({
        reports: reports?.length || 0,
        logs: logs?.length || 0,
        healthScore: averageScore,
      })
    } catch {
      setStats({ reports: 0, logs: 0, healthScore: '-' })
    } finally {
      setStatsLoading(false)
    }
  }, [user])

  useFocusEffect(
    useCallback(() => {
      loadStats()
      loadProfile()
    }, [loadStats, loadProfile])
  )

  const pickAndPrepareAvatar = async () => {
    if (!user) return

    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (permission.status !== 'granted') {
        await showMessage({
          title: 'Permission Needed',
          message: 'Please allow photo library access to upload profile picture.',
          tone: 'warning',
        })
        return
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 1,
      })

      if (result.canceled) return

      const selected = result.assets[0]
      if (!selected?.uri) return

      setPendingAvatarUri(selected.uri)
      setPendingAvatarWidth(Number(selected.width || 0))
      setPendingAvatarHeight(Number(selected.height || 0))
      setAvatarRotation(0)
      setCropVisible(true)
    } catch (err) {
      await showMessage({
        title: 'Image Error',
        message: err?.message || 'Could not prepare image.',
        tone: 'error',
      })
    } finally {
      setPreparingAvatar(false)
    }
  }

  const handleUploadPreparedAvatar = async (avatarUri, rotation = 0, width = 0, height = 0) => {
    if (!user || !avatarUri) return

    setUploadingAvatar(true)
    try {
      const manipulations = []
      if (rotation) {
        manipulations.push({ rotate: rotation })
      }

      const rotatedWidth = rotation % 180 === 0 ? width : height
      const rotatedHeight = rotation % 180 === 0 ? height : width
      if (rotatedWidth > 0 && rotatedHeight > 0 && rotatedWidth !== rotatedHeight) {
        const size = Math.min(rotatedWidth, rotatedHeight)
        const originX = Math.max(0, Math.floor((rotatedWidth - size) / 2))
        const originY = Math.max(0, Math.floor((rotatedHeight - size) / 2))
        manipulations.push({ crop: { originX, originY, width: size, height: size } })
      }

      const processed = await manipulateAsync(
        avatarUri,
        manipulations,
        {
          compress: 0.72,
          format: SaveFormat.JPEG,
        }
      )

      const response = await fetch(processed.uri)
      const blob = await response.blob()
      const fileName = `${user.id}.jpg`

      const { error: uploadError } = await supabase.storage
        .from(AVATAR_BUCKET)
        .upload(fileName, blob, {
          upsert: true,
          contentType: 'image/jpeg',
        })

      if (uploadError) {
        await showMessage({
          title: 'Upload Failed',
          message: uploadError.message,
          tone: 'error',
        })
        return
      }

      const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(fileName)
      const publicUrl = data?.publicUrl
      if (!publicUrl) {
        await showMessage({
          title: 'Upload Failed',
          message: 'Could not resolve public URL for uploaded image.',
          tone: 'error',
        })
        return
      }

      const versionedUrl = `${publicUrl}${publicUrl.includes('?') ? '&' : '?'}v=${Date.now()}`

      const { error: dbError } = await supabase
        .from('profiles')
        .upsert(
          { id: user.id, avatar_url: versionedUrl },
          { onConflict: 'id' }
        )

      if (dbError) {
        await showMessage({
          title: 'Save Failed',
          message: dbError.message,
          tone: 'error',
        })
        return
      }

      await supabase.auth.updateUser({
        data: {
          ...(user?.user_metadata || {}),
          avatar_url: versionedUrl,
        },
      })

      showToast('Profile picture updated!', 'success')
      setCropVisible(false)
      setPendingAvatarUri(null)
      setPendingAvatarWidth(0)
      setPendingAvatarHeight(0)
      setAvatarRotation(0)
      setProfileData((prev) => ({ ...(prev || {}), avatar_url: versionedUrl }))
      await loadProfile()
    } catch (err) {
      await showMessage({
        title: 'Upload Failed',
        message: err?.message || 'Could not upload image.',
        tone: 'error',
      })
    } finally {
      setUploadingAvatar(false)
    }
  }

  const handleAvatarPress = () => {
    if (uploadingAvatar) return
    setAvatarSheetVisible(true)
  }

  const handleRotateAvatar = () => {
    setAvatarRotation((current) => (current + 90) % 360)
  }

  const handleCloseCrop = () => {
    if (uploadingAvatar) return
    setCropVisible(false)
    setPendingAvatarUri(null)
    setPendingAvatarWidth(0)
    setPendingAvatarHeight(0)
    setAvatarRotation(0)
  }

  const handleNextCrop = async () => {
    if (!pendingAvatarUri || preparingAvatar || uploadingAvatar) return
    setPreparingAvatar(true)
    try {
      await handleUploadPreparedAvatar(
        pendingAvatarUri,
        avatarRotation,
        pendingAvatarWidth,
        pendingAvatarHeight
      )
    } finally {
      setPreparingAvatar(false)
    }
  }

  async function handleSignOut() {
    try {
      await signOut()
      showToast('Signed out successfully.', 'success')
    } catch (error) {
      await showMessage({
        title: 'Sign Out Failed',
        message: error?.message || 'Could not sign out right now. Please try again.',
        tone: 'error',
      })
    }
  }

  return (
    <Screen>
      <Card style={styles.headerCard}>
        <View style={styles.headerTopRow}>
          <Pressable style={styles.avatarWrap} onPress={handleAvatarPress}>
            {currentAvatarUrl ? (
              <Image
                source={{ uri: currentAvatarUrl }}
                style={styles.avatarImage}
              />
            ) : (
              <Text style={styles.avatarText}>{initials}</Text>
            )}
            <View style={styles.cameraBadge}>
              {uploadingAvatar ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <MaterialCommunityIcons name="camera" size={12} color="#ffffff" />
              )}
            </View>
          </Pressable>

          <View style={styles.profileMeta}>
            <Text style={styles.name}>{displayName}</Text>
            <Text style={styles.email}>{user?.email}</Text>
            <Subtle style={styles.joined}>{accountCreated}</Subtle>
          </View>
        </View>

      </Card>

      <Pressable
        style={({ pressed }) => [styles.editButton, pressed && styles.editButtonPressed]}
        onPress={() => navigation.navigate('EditProfile')}
      >
        <MaterialCommunityIcons name="account-edit-outline" size={18} color="#ffffff" />
        <Text style={styles.editButtonText}>Edit Profile</Text>
      </Pressable>

      <View style={styles.sectionWrap}>
        <Text style={styles.sectionTitle}>Quick Stats</Text>
        <View style={styles.statsGrid}>
          <Card style={styles.statCard}>
            <MaterialCommunityIcons name="file-chart-outline" size={20} color="#0284c7" />
            <Text style={styles.statValue}>{statsLoading ? '-' : stats.reports}</Text>
            <Text style={styles.statLabel}>Reports Uploaded</Text>
          </Card>

          <Card style={styles.statCard}>
            <MaterialCommunityIcons name="heart-pulse" size={20} color="#dc2626" />
            <Text style={styles.statValue}>{statsLoading ? '-' : stats.logs}</Text>
            <Text style={styles.statLabel}>Health Logs</Text>
          </Card>

          <Card style={styles.statCard}>
            <MaterialCommunityIcons name="chart-line" size={20} color="#16a34a" />
            <Text style={styles.statValue}>{statsLoading ? '-' : stats.healthScore}</Text>
            <Text style={styles.statLabel}>Health Score</Text>
          </Card>
        </View>
        {statsLoading ? (
          <View style={styles.statsLoadingRow}>
            <ActivityIndicator size="small" color="#0b6b63" />
            <Subtle>Refreshing your stats...</Subtle>
          </View>
        ) : null}
      </View>

      <Card style={styles.healthInfoCard}>
        <Text style={styles.sectionTitle}>Personal Health Information</Text>
        {profileLoading ? (
          <View style={styles.inlineStatusRow}>
            <ActivityIndicator size="small" color="#0b6b63" />
            <Subtle>Loading saved profile data...</Subtle>
          </View>
        ) : null}
        {profileError ? <Text style={styles.inlineErrorText}>{profileError}</Text> : null}
        {personalHealthInfo.map((item, index) => (
          <View
            key={item.label}
            style={[
              styles.healthInfoRow,
              index < personalHealthInfo.length - 1 && styles.healthInfoRowDivider,
            ]}
          >
            <Text style={styles.healthInfoLabel}>{item.label}</Text>
            <Text style={styles.healthInfoValue}>{item.value}</Text>
          </View>
        ))}
      </Card>

      <Card style={styles.infoCard}>
        <Text style={styles.sectionTitle}>Account Info</Text>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Status</Text>
          <Text style={styles.statusPill}>Active</Text>
        </View>
      </Card>

      <Pressable
        style={({ pressed }) => [styles.signOutButton, pressed && styles.signOutPressed]}
        onPress={async () => {
          const ok = await showConfirm({
            title: 'Sign Out',
            message: 'Do you want to sign out?',
            tone: 'warning',
            confirmLabel: 'Sign out',
            cancelLabel: 'Cancel',
          })
          if (ok) await handleSignOut()
        }}
      >
        <MaterialCommunityIcons name="logout" size={18} color="#dc2626" />
        <Text style={styles.signOutText}>Sign Out</Text>
      </Pressable>

      <Modal
        transparent
        visible={avatarSheetVisible}
        animationType="fade"
        onRequestClose={() => setAvatarSheetVisible(false)}
      >
        <View style={styles.sheetBackdropHost}>
          <Pressable style={styles.sheetBackdrop} onPress={() => setAvatarSheetVisible(false)} />
          <View style={styles.sheetCard}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Change profile picture</Text>

            <View style={styles.sheetAvatarWrap}>
              {currentAvatarUrl ? (
                <Image source={{ uri: currentAvatarUrl }} style={styles.sheetAvatarImage} />
              ) : (
                <Text style={styles.sheetAvatarFallback}>{initials}</Text>
              )}
              <View style={styles.sheetAvatarBadge}>
                <MaterialCommunityIcons name="camera-outline" size={18} color="#ffffff" />
              </View>
            </View>

            <Pressable
              style={({ pressed }) => [styles.sourceButton, pressed && styles.sheetActionPressed]}
              onPress={async () => {
                if (uploadingAvatar || preparingAvatar) return
                setAvatarSheetVisible(false)
                await pickAndPrepareAvatar()
              }}
            >
              <MaterialCommunityIcons name="image-outline" size={18} color="#e5e7eb" />
              <Text style={styles.sourceButtonText}>Upload from Device</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        transparent
        visible={cropVisible}
        animationType="fade"
        onRequestClose={handleCloseCrop}
      >
        <View style={styles.cropBackdropHost}>
          <Pressable style={styles.cropBackdrop} onPress={handleCloseCrop} />

          <View style={styles.cropCard}>
            <View style={styles.cropTopRow}>
              <Pressable style={styles.cropCloseButton} onPress={handleCloseCrop} accessibilityLabel="Close profile picture">
                <MaterialCommunityIcons name="close" size={32} color="#cbd5e1" />
              </Pressable>
              <Text style={styles.cropTitle}>Crop & rotate</Text>
              <MaterialCommunityIcons name="dots-vertical" size={26} color="#cbd5e1" />
            </View>

            <View style={styles.cropPreviewArea}>
              <View style={styles.cropStage}>
                <View style={styles.cropFrame}>
                  {pendingAvatarUri ? (
                    <Image
                      source={{ uri: pendingAvatarUri }}
                      style={[
                        styles.cropPreviewImage,
                        { transform: [{ rotate: `${avatarRotation}deg` }] },
                      ]}
                    />
                  ) : (
                    <Text style={styles.cropFallback}>{initials}</Text>
                  )}
                </View>
              </View>
            </View>

            <View style={styles.cropRotateWrap}>
              <Pressable
                style={({ pressed }) => [styles.rotateButton, pressed && styles.sheetActionPressed]}
                onPress={handleRotateAvatar}
                disabled={uploadingAvatar || preparingAvatar}
              >
                <MaterialCommunityIcons name="rotate-right" size={18} color="#cbd5e1" />
                <Text style={styles.rotateButtonText}>Rotate</Text>
              </Pressable>
            </View>

            <Pressable
              style={({ pressed }) => [styles.nextButton, pressed && styles.sheetActionPressed]}
              onPress={handleNextCrop}
              disabled={uploadingAvatar || preparingAvatar || !pendingAvatarUri}
            >
              {uploadingAvatar || preparingAvatar ? (
                <ActivityIndicator size="small" color="#1d4ed8" />
              ) : (
                <Text style={styles.nextButtonText}>Next</Text>
              )}
            </Pressable>
          </View>
        </View>
      </Modal>
    </Screen>
  )
}

const styles = StyleSheet.create({
  headerCard: {
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: '#dce9e6',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 5,
  },
  headerTopRow: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
  },
  avatarWrap: {
    width: 70,
    height: 70,
    borderRadius: 35,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1d4ed8',
    overflow: 'hidden',
    position: 'relative',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  avatarText: {
    color: '#fff',
    fontSize: 24,
    ...typography.style.extraBold,
  },
  cameraBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#0b6b63',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#ffffff',
  },
  profileMeta: {
    flex: 1,
    gap: 3,
  },
  name: {
    fontSize: 20,
    ...typography.style.extraBold,
    color: '#0f172a',
  },
  email: {
    fontSize: 14,
    color: '#475569',
    ...typography.style.medium,
  },
  joined: {
    marginTop: 2,
    fontSize: 12,
  },
  sectionWrap: {
    gap: 10,
    marginTop: 6,
  },
  editButton: {
    minHeight: 50,
    borderRadius: 14,
    backgroundColor: '#0b6b63',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    shadowColor: '#0b6b63',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 14,
    elevation: 4,
    marginBottom: 2,
  },
  editButtonPressed: {
    opacity: 0.9,
  },
  editButtonText: {
    color: '#ffffff',
    ...typography.style.extraBold,
    fontSize: 15,
  },
  sectionTitle: {
    fontSize: 17,
    ...typography.style.extraBold,
    color: '#0f172a',
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  statCard: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: 'flex-start',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  statsLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  inlineErrorText: {
    color: '#dc2626',
    fontSize: 12,
    ...typography.style.semiBold,
  },
  healthInfoCard: {
    borderRadius: 18,
    marginTop: 2,
    borderWidth: 1,
    borderColor: '#dfe8ee',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  healthInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 10,
  },
  healthInfoRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  healthInfoLabel: {
    fontSize: 14,
    ...typography.style.bold,
    color: '#475569',
  },
  healthInfoValue: {
    flexShrink: 1,
    fontSize: 14,
    ...typography.style.extraBold,
    color: '#0f172a',
    textAlign: 'right',
  },
  infoCard: {
    borderRadius: 18,
    marginTop: 2,
    borderWidth: 1,
    borderColor: '#dfe8ee',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  infoRow: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  inlineStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoLabel: {
    fontSize: 14,
    ...typography.style.bold,
    color: '#334155',
  },
  infoValue: {
    fontSize: 14,
    ...typography.style.extraBold,
    color: '#0f172a',
  },
  statusPill: {
    backgroundColor: '#e8f7ec',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    color: '#166534',
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 10,
    ...typography.style.extraBold,
    fontSize: 12,
  },
  signOutButton: {
    minHeight: 54,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#ef4444',
    backgroundColor: '#fef2f2',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 2,
  },
  signOutPressed: {
    opacity: 0.86,
  },
  signOutText: {
    color: '#dc2626',
    ...typography.style.extraBold,
    fontSize: 15,
  },
  sheetBackdropHost: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(2,6,23,0.45)',
  },
  sheetCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 22,
    backgroundColor: '#161616',
    borderWidth: 1,
    borderColor: '#232323',
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 20,
    gap: 14,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#374151',
    marginBottom: 4,
  },
  sheetTitle: {
    color: '#e5e7eb',
    fontSize: 20,
    ...typography.style.regular,
    textAlign: 'center',
  },
  sheetAvatarWrap: {
    width: 280,
    height: 280,
    borderRadius: 140,
    alignSelf: 'center',
    backgroundColor: '#090909',
    borderWidth: 8,
    borderColor: '#111111',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
    marginTop: 6,
  },
  sheetAvatarImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  sheetAvatarFallback: {
    color: '#ffffff',
    fontSize: 54,
    ...typography.style.extraBold,
  },
  sheetAvatarBadge: {
    position: 'absolute',
    right: 18,
    bottom: 18,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#191919',
    borderWidth: 3,
    borderColor: '#272727',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sourceButton: {
    minHeight: 72,
    borderRadius: 10,
    backgroundColor: '#121212',
    borderWidth: 1,
    borderColor: '#1f1f1f',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sourceButtonText: {
    color: '#e5e7eb',
    fontSize: 16,
    ...typography.style.semiBold,
  },
  sheetActionPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.995 }],
  },
  cropBackdropHost: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  cropBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  cropCard: {
    width: '100%',
    maxWidth: 560,
    borderRadius: 28,
    backgroundColor: '#121212',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 18,
    gap: 14,
  },
  cropTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cropCloseButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 4,
    borderColor: '#7dd3fc',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#121212',
  },
  cropTitle: {
    flex: 1,
    textAlign: 'center',
    color: '#f3f4f6',
    fontSize: 20,
    ...typography.style.regular,
    marginHorizontal: 8,
  },
  cropPreviewArea: {
    minHeight: 360,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cropStage: {
    width: 330,
    height: 330,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0d0d0d',
    borderRadius: 8,
    overflow: 'hidden',
  },
  cropFrame: {
    width: 260,
    height: 260,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: '#000000',
  },
  cropPreviewImage: {
    width: '110%',
    height: '110%',
    resizeMode: 'cover',
  },
  cropFallback: {
    color: '#ffffff',
    fontSize: 54,
    ...typography.style.extraBold,
  },
  cropRotateWrap: {
    alignItems: 'center',
  },
  rotateButton: {
    width: 92,
    minHeight: 96,
    borderRadius: 8,
    backgroundColor: '#1f1f1f',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#2b2b2b',
  },
  rotateButtonText: {
    color: '#e5e7eb',
    fontSize: 14,
    ...typography.style.medium,
  },
  nextButton: {
    minHeight: 54,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#a7c7ff',
  },
  nextButtonText: {
    color: '#1e3a8a',
    fontSize: 17,
    ...typography.style.medium,
  },
})
