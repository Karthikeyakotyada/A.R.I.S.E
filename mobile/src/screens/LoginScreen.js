import { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { Screen, Card, Heading, Subtle, PrimaryButton, GhostButton, InputField } from '../components/ui'
import { useDialog } from '../context/DialogContext'
import { supabase } from '../lib/supabaseClient'
import PageHeader from '../components/PageHeader'

export default function LoginScreen({ navigation }) {
  const { showMessage } = useDialog()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin() {
    setLoading(true)
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })

      if (error) {
        if (error.message.includes('Invalid login credentials')) {
          await showMessage({ title: 'Login Failed', message: 'Invalid email or password.', tone: 'error' })
        } else if (error.message.includes('Email not confirmed')) {
          await showMessage({
            title: 'Email Confirmation Required',
            message: 'Please confirm your email before logging in.',
            tone: 'warning',
          })
        } else {
          await showMessage({ title: 'Login Failed', message: error.message, tone: 'error' })
        }
      }
    } catch {
      await showMessage({ title: 'Login Failed', message: 'An unexpected error occurred.', tone: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Screen>
      <View style={styles.brandWrap}>
        <PageHeader
          eyebrow="Welcome"
          title="ARISE Mobile"
          subtitle="Sign in to continue your AI-powered health tracking journey."
        />
      </View>

      <Card style={styles.brandCard}>
        <Heading>Secure Sign In</Heading>
        <Subtle>AI Driven Report Insight and Smart Evaluation</Subtle>
      </Card>

      <Card>
        <InputField
          label="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          placeholder="you@example.com"
        />

        <InputField
          label="Password"
          value={password}
          onChangeText={setPassword}
          placeholder="Enter password"
          secureTextEntry
        />

        <PrimaryButton title="Sign In" onPress={handleLogin} loading={loading} disabled={!email || !password} />
        <GhostButton title="Create account" onPress={() => navigation.navigate('Signup')} />
      </Card>
    </Screen>
  )
}

const styles = StyleSheet.create({
  brandWrap: {
    marginTop: 8,
  },
  brandCard: {
    backgroundColor: '#f0fdfa',
    borderColor: '#6feed5',
  },
})
