import { useCallback, useMemo, useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { Card, PrimaryButton, Screen, Subtle } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useDialog } from '../context/DialogContext'
import { useToast } from '../context/ToastContext'
import { supabase } from '../lib/supabaseClient'

export default function EditProfileScreen({ navigation }) {
  const { user } = useAuth()
  const { showMessage } = useDialog()
  const { showToast } = useToast()

  const [loadingProfile, setLoadingProfile] = useState(true)
  const [loadError, setLoadError] = useState('')

  const initialValues = useMemo(() => {
    return {
      name: String(user?.user_metadata?.name || '').trim(),
      age: '',
      gender: '',
      bloodGroup: '',
      height: '',
      emergencyContact: '',
    }
  }, [user?.user_metadata?.name])

  const [form, setForm] = useState(initialValues)
  const [saving, setSaving] = useState(false)

  const loadProfile = useCallback(async () => {
    if (!user?.id) return
    setLoadingProfile(true)
    setLoadError('')
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('age, gender, blood_group, height, emergency_contact')
        .eq('id', user.id)
        .maybeSingle()

      if (error) throw error

      if (data) {
        setForm({
          name: String(user?.user_metadata?.name || '').trim(),
          age: data.age === null || data.age === undefined ? '' : String(data.age),
          gender: String(data.gender || '').trim(),
          bloodGroup: String(data.blood_group || '').trim(),
          height: data.height === null || data.height === undefined ? '' : String(data.height),
          emergencyContact: String(data.emergency_contact || '').trim(),
        })
      }
    } catch (error) {
      setLoadError(error?.message || 'Could not load profile data.')
    } finally {
      setLoadingProfile(false)
    }
  }, [user?.id, user?.user_metadata?.name])

  useFocusEffect(
    useCallback(() => {
      loadProfile()
    }, [loadProfile])
  )

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSave() {
    if (!user?.id) return
    setSaving(true)
    try {
      const { error } = await supabase.from('profiles').upsert(
        {
          id: user.id,
          age: form.age.trim() ? Number(form.age.trim()) : null,
          gender: form.gender.trim() || null,
          blood_group: form.bloodGroup.trim() || null,
          height: form.height.trim() ? Number(form.height.trim()) : null,
          emergency_contact: form.emergencyContact.trim() || null,
        },
        { onConflict: 'id' }
      )

      if (error) throw error

      await supabase.auth.updateUser({
        data: {
          ...(user?.user_metadata || {}),
          name: form.name.trim(),
        },
      })

      showToast('Profile updated successfully.', 'success')
      navigation.goBack()
    } catch (error) {
      await showMessage({
        title: 'Update Failed',
        message: error?.message || 'Could not update profile.',
        tone: 'error',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Screen>
      <Card>
        <Text style={styles.title}>Edit Profile</Text>
        <Subtle>Update your personal information and health basics.</Subtle>

        {loadingProfile ? (
          <View style={styles.statusRow}>
            <ActivityIndicator size="small" color="#0b6b63" />
            <Subtle>Loading profile...</Subtle>
          </View>
        ) : null}
        {loadError ? <Text style={styles.errorText}>{loadError}</Text> : null}

        <View style={styles.fieldWrap}>
          <Text style={styles.label}>Name</Text>
          <TextInput
            value={form.name}
            onChangeText={(v) => updateField('name', v)}
            style={styles.input}
            placeholder="Full name"
          />
        </View>

        <View style={styles.fieldWrap}>
          <Text style={styles.label}>Age</Text>
          <TextInput
            value={form.age}
            onChangeText={(v) => updateField('age', v)}
            style={styles.input}
            placeholder="Age"
            keyboardType="numeric"
          />
        </View>

        <View style={styles.fieldWrap}>
          <Text style={styles.label}>Gender</Text>
          <TextInput
            value={form.gender}
            onChangeText={(v) => updateField('gender', v)}
            style={styles.input}
            placeholder="Gender"
          />
        </View>

        <View style={styles.fieldWrap}>
          <Text style={styles.label}>Blood Group</Text>
          <TextInput
            value={form.bloodGroup}
            onChangeText={(v) => updateField('bloodGroup', v)}
            style={styles.input}
            placeholder="Blood group"
          />
        </View>

        <View style={styles.fieldWrap}>
          <Text style={styles.label}>Height</Text>
          <TextInput
            value={form.height}
            onChangeText={(v) => updateField('height', v)}
            style={styles.input}
            placeholder="Height"
          />
        </View>

        <View style={styles.fieldWrap}>
          <Text style={styles.label}>Emergency Contact</Text>
          <TextInput
            value={form.emergencyContact}
            onChangeText={(v) => updateField('emergencyContact', v)}
            style={styles.input}
            placeholder="Emergency contact"
            keyboardType="phone-pad"
          />
        </View>

        <PrimaryButton title="Save Changes" onPress={handleSave} loading={saving} />
      </Card>
    </Screen>
  )
}

const styles = StyleSheet.create({
  title: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0f172a',
  },
  fieldWrap: {
    gap: 6,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  errorText: {
    color: '#dc2626',
    fontSize: 12,
    fontWeight: '600',
  },
  label: {
    color: '#223240',
    fontWeight: '700',
    fontSize: 13,
  },
  input: {
    borderWidth: 1,
    borderColor: '#bed0ce',
    borderRadius: 12,
    minHeight: 48,
    paddingHorizontal: 13,
    color: '#0f172a',
    backgroundColor: '#fbfefe',
  },
})
