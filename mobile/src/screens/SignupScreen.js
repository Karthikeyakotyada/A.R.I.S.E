import { useMemo, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { Screen, Card, Heading, Subtle, PrimaryButton, GhostButton, InputField } from '../components/ui'
import { useDialog } from '../context/DialogContext'
import { supabase } from '../lib/supabaseClient'
import PageHeader from '../components/PageHeader'

export default function SignupScreen({ navigation }) {
  const { showMessage } = useDialog()
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  })
  const [loading, setLoading] = useState(false)

  const canSubmit = useMemo(() => {
    return form.name.trim() && form.email.trim() && form.password && form.confirmPassword
  }, [form])

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function validate() {
    if (!form.name.trim()) return 'Full name is required.'
    if (!form.email.trim()) return 'Email address is required.'
    if (form.password.length < 8) return 'Password must be at least 8 characters.'
    if (form.password !== form.confirmPassword) return 'Passwords do not match.'
    return null
  }

  async function handleSignup() {
    const validationError = validate()
    if (validationError) {
      await showMessage({ title: 'Invalid Form', message: validationError, tone: 'warning' })
      return
    }

    setLoading(true)
    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: form.email.trim(),
        password: form.password,
        options: {
          data: { name: form.name.trim() },
        },
      })

      if (authError) {
        if (authError.message.includes('already registered')) {
          await showMessage({ title: 'Account Exists', message: 'This email is already registered. Please log in.', tone: 'warning' })
        } else {
          await showMessage({ title: 'Signup Failed', message: authError.message, tone: 'error' })
        }
        return
      }

      if (authData.user) {
        await supabase.from('profiles').insert({
          id: authData.user.id,
          name: form.name.trim(),
          email: form.email.trim().toLowerCase(),
        })
      }

      if (authData.session) {
        await showMessage({ title: 'Success', message: 'Account created successfully.', tone: 'success' })
      } else {
        await showMessage({ title: 'Check your email', message: 'Confirm your email before signing in.', tone: 'info' })
      }

      navigation.navigate('Login')
    } catch {
      await showMessage({ title: 'Signup Failed', message: 'An unexpected error occurred.', tone: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Screen>
      <View style={styles.brandWrap}>
        <PageHeader
          eyebrow="Join"
          title="Create Account"
          subtitle="Set up your ARISE profile and unlock smart report insights."
        />
      </View>

      <Card style={styles.brandCard}>
        <Heading>Quick Registration</Heading>
        <Subtle>Join ARISE to unlock AI-powered health insights</Subtle>
      </Card>

      <Card>
        <InputField label="Full Name" value={form.name} onChangeText={(v) => updateField('name', v)} placeholder="Jane Smith" />

        <InputField
          label="Email"
          value={form.email}
          onChangeText={(v) => updateField('email', v)}
          keyboardType="email-address"
          autoCapitalize="none"
          placeholder="you@example.com"
        />

        <InputField
          label="Password"
          value={form.password}
          onChangeText={(v) => updateField('password', v)}
          placeholder="Min. 8 characters"
          secureTextEntry
        />

        <InputField
          label="Confirm Password"
          value={form.confirmPassword}
          onChangeText={(v) => updateField('confirmPassword', v)}
          placeholder="Re-enter password"
          secureTextEntry
        />

        <PrimaryButton title="Create Account" onPress={handleSignup} loading={loading} disabled={!canSubmit} />
        <GhostButton title="Sign in instead" onPress={() => navigation.navigate('Login')} />
      </Card>
    </Screen>
  )
}

const styles = StyleSheet.create({
  brandWrap: {
    marginTop: 8,
  },
  brandCard: {
    backgroundColor: '#fff7ed',
    borderColor: '#fed7aa',
  },
})
