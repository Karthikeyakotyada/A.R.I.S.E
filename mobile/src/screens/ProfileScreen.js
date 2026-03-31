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
  const [avatarSheetOpenedAt, setAvatarSheetOpenedAt] = useState(0)
  const [previewVisible, setPreviewVisible] = useState(false)
  const [pendingAvatarUri, setPendingAvatarUri] = useState(null)
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
        allowsEditing: true,
        aspect: [1, 1],
        quality: 1,
      })

      if (result.canceled) return

      const selected = result.assets[0]
      if (!selected?.uri) return

      setPreparingAvatar(true)

      const width = Number(selected.width || 0)
      const height = Number(selected.height || 0)
      const actions = []

      if (width > 0 && height > 0 && width !== height) {
        const size = Math.min(width, height)
        const originX = Math.max(0, Math.floor((width - size) / 2))
        const originY = Math.max(0, Math.floor((height - size) / 2))
        actions.push({ crop: { originX, originY, width: size, height: size } })
      }

      const processed = await manipulateAsync(
        selected.uri,
        actions,
        {
          compress: 0.72,
          format: SaveFormat.JPEG,
        }
      )

      setPendingAvatarUri(processed.uri)
      setPreviewVisible(true)
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

  const handleUploadPreparedAvatar = async () => {
    if (!user || !pendingAvatarUri) return

    setUploadingAvatar(true)
    try {
      const response = await fetch(pendingAvatarUri)
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
      setPreviewVisible(false)
      setPendingAvatarUri(null)
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
    const openedAt = Date.now()
    setAvatarSheetOpenedAt(openedAt)
    setTimeout(() => {
      setAvatarSheetVisible(true)
    }, 70)
  }

  const isAvatarSheetActionReady = () => Date.now() - avatarSheetOpenedAt > 240

  const handleRemoveAvatar = async () => {
    if (!user?.id) return

    const confirm = await showConfirm({
      title: 'Remove Photo',
      message: 'Remove your current profile photo?',
      tone: 'warning',
      confirmLabel: 'Remove',
      cancelLabel: 'Cancel',
    })

    if (!confirm) return

    setUploadingAvatar(true)
    try {
      const fileName = `${user.id}.jpg`
      await supabase.storage.from(AVATAR_BUCKET).remove([fileName])

      const { error: dbError } = await supabase
        .from('profiles')
        .upsert(
          { id: user.id, avatar_url: null },
          { onConflict: 'id' }
        )

      if (dbError) {
        await showMessage({
          title: 'Remove Failed',
          message: dbError.message,
          tone: 'error',
        })
        return
      }

      await supabase.auth.updateUser({
        data: {
          ...(user?.user_metadata || {}),
          avatar_url: null,
        },
      })

      showToast('Profile photo removed.', 'success')
      setPreviewVisible(false)
      setPendingAvatarUri(null)
      setProfileData((prev) => ({ ...(prev || {}), avatar_url: null }))
      await loadProfile()
    } catch (err) {
      await showMessage({
        title: 'Remove Failed',
        message: err?.message || 'Could not remove photo.',
        tone: 'error',
      })
    } finally {
      setUploadingAvatar(false)
    }
  }

  async function handleSignOut() {
    await signOut()
    showToast('Signed out successfully.', 'success')
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
            <Text style={styles.sheetTitle}>Profile Photo</Text>

            <Pressable
              style={({ pressed }) => [styles.sheetActionButton, pressed && styles.sheetActionPressed]}
              onPress={async () => {
                if (!isAvatarSheetActionReady()) return
                setAvatarSheetVisible(false)
                await pickAndPrepareAvatar()
              }}
            >
              <MaterialCommunityIcons name="image-plus" size={18} color="#0f766e" />
              <Text style={styles.sheetActionText}>Upload new photo</Text>
            </Pressable>

            {hasAvatar ? (
              <Pressable
                style={({ pressed }) => [
                  styles.sheetActionButton,
                  styles.sheetDangerButton,
                  pressed && styles.sheetActionPressed,
                ]}
                onPress={async () => {
                  if (!isAvatarSheetActionReady()) return
                  setAvatarSheetVisible(false)
                  await handleRemoveAvatar()
                }}
              >
                <MaterialCommunityIcons name="trash-can-outline" size={18} color="#dc2626" />
                <Text style={styles.sheetDangerText}>Remove current photo</Text>
              </Pressable>
            ) : null}

            <Pressable
              style={({ pressed }) => [styles.sheetCancelButton, pressed && styles.sheetActionPressed]}
              onPress={() => setAvatarSheetVisible(false)}
            >
              <Text style={styles.sheetCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        transparent
        visible={previewVisible}
        animationType="fade"
        onRequestClose={() => {
          if (uploadingAvatar) return
          setPreviewVisible(false)
          setPendingAvatarUri(null)
        }}
      >
        <View style={styles.previewBackdropHost}>
          <Pressable
            style={styles.previewBackdrop}
            onPress={() => {
              if (uploadingAvatar) return
              setPreviewVisible(false)
              setPendingAvatarUri(null)
            }}
          />

          <View style={styles.previewCard}>
            <Text style={styles.previewTitle}>Preview Photo</Text>
            <Subtle style={styles.previewSubtitle}>Adjust looks good? Save to update your profile.</Subtle>

            <View style={styles.previewAvatarWrap}>
              {pendingAvatarUri ? (
                <Image source={{ uri: pendingAvatarUri }} style={styles.previewAvatarImage} />
              ) : (
                <Text style={styles.previewAvatarFallback}>{initials}</Text>
              )}
            </View>

            <View style={styles.previewActionsRow}>
              <Pressable
                style={({ pressed }) => [styles.previewGhostBtn, pressed && styles.sheetActionPressed]}
                onPress={async () => {
                  if (uploadingAvatar || preparingAvatar) return
                  await pickAndPrepareAvatar()
                }}
              >
                <Text style={styles.previewGhostText}>Reselect</Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [styles.previewGhostBtn, pressed && styles.sheetActionPressed]}
                onPress={() => {
                  if (uploadingAvatar) return
                  setPreviewVisible(false)
                  setPendingAvatarUri(null)
                }}
              >
                <Text style={styles.previewGhostText}>Cancel</Text>
              </Pressable>
            </View>

            <Pressable
              style={({ pressed }) => [styles.previewSaveBtn, pressed && styles.sheetActionPressed]}
              onPress={handleUploadPreparedAvatar}
              disabled={uploadingAvatar || !pendingAvatarUri}
            >
              {uploadingAvatar ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={styles.previewSaveText}>Use this photo</Text>
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
    fontWeight: '800',
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
    fontWeight: '900',
    color: '#0f172a',
  },
  email: {
    fontSize: 14,
    color: '#475569',
    fontWeight: '500',
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
    fontWeight: '800',
    fontSize: 15,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
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
    fontWeight: '600',
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
    fontWeight: '700',
    color: '#475569',
  },
  healthInfoValue: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '800',
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
  infoLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '800',
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
    fontWeight: '800',
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
    fontWeight: '800',
    fontSize: 15,
  },
  sheetBackdropHost: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(2,6,23,0.45)',
  },
  sheetCard: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: '#dbe7e5',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 22,
    gap: 10,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#cbd5e1',
    marginBottom: 4,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 2,
  },
  sheetActionButton: {
    minHeight: 50,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d9ece8',
    backgroundColor: '#f6fbfa',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sheetDangerButton: {
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
  },
  sheetActionPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.995 }],
  },
  sheetActionText: {
    color: '#0b3b36',
    fontSize: 15,
    fontWeight: '700',
  },
  sheetDangerText: {
    color: '#991b1b',
    fontSize: 15,
    fontWeight: '700',
  },
  sheetCancelButton: {
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  sheetCancelText: {
    color: '#334155',
    fontSize: 15,
    fontWeight: '700',
  },
  previewBackdropHost: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 18,
  },
  previewBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(2,6,23,0.45)',
  },
  previewCard: {
    width: '100%',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#d9e8e5',
    backgroundColor: '#ffffff',
    padding: 16,
    gap: 10,
  },
  previewTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0f172a',
  },
  previewSubtitle: {
    marginTop: -2,
    marginBottom: 2,
  },
  previewAvatarWrap: {
    width: 180,
    height: 180,
    borderRadius: 999,
    alignSelf: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#d7e6e2',
    backgroundColor: '#f3faf8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewAvatarImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  previewAvatarFallback: {
    color: '#0f766e',
    fontSize: 42,
    fontWeight: '800',
  },
  previewActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  previewGhostBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewGhostText: {
    color: '#334155',
    fontSize: 14,
    fontWeight: '700',
  },
  previewSaveBtn: {
    minHeight: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0f766e',
    marginTop: 2,
  },
  previewSaveText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
})
