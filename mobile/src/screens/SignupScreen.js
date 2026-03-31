import React, { useMemo, useState } from 'react'
import {
  StyleSheet,
  View,
  Text,
  Image,
  TextInput,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { useDialog } from '../context/DialogContext'
import { supabase } from '../lib/supabaseClient'

const APP_LOGO = require('../../assets/app-logo.png')
const FONT_FAMILY = Platform.select({
  ios: 'System',
  android: 'Roboto',
  default: 'sans-serif',
})

export default function SignupScreen({ navigation }) {
  const { showMessage } = useDialog()
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  })
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [focusedField, setFocusedField] = useState('')
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
    if (form.password.length < 6) return 'Password must be at least 6 characters.'
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
    <SafeAreaView style={styles.safeArea}>
      <LinearGradient
        colors={['#0A2E22', '#0F5132', '#4CAF6A']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.container}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.container}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.logoSection}>
              <Image source={APP_LOGO} style={styles.logo} resizeMode="contain" />
              <Text style={styles.appName}>ARISE</Text>
              <Text style={styles.tagline}>Modern care, trusted insights.</Text>
            </View>

            <View style={styles.formSection}>
              <Text style={styles.formTitle}>Create Account</Text>
              <Text style={styles.formSubtitle}>Set up your profile and start tracking smarter care</Text>

              <View style={styles.inputGroup}>
                <View
                  style={[
                    styles.inputWrapper,
                    focusedField === 'name' && styles.inputWrapperFocused,
                  ]}
                >
                  <MaterialCommunityIcons
                    name="account-outline"
                    size={20}
                    color={focusedField === 'name' ? '#16A34A' : '#5B6874'}
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="Full name"
                    placeholderTextColor="#7A8794"
                    autoCapitalize="words"
                    editable={!loading}
                    value={form.name}
                    onFocus={() => setFocusedField('name')}
                    onBlur={() => setFocusedField('')}
                    onChangeText={(value) => updateField('name', value)}
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <View
                  style={[
                    styles.inputWrapper,
                    focusedField === 'email' && styles.inputWrapperFocused,
                  ]}
                >
                  <MaterialCommunityIcons
                    name="email-outline"
                    size={20}
                    color={focusedField === 'email' ? '#16A34A' : '#5B6874'}
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="you@example.com"
                    placeholderTextColor="#7A8794"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!loading}
                    value={form.email}
                    onFocus={() => setFocusedField('email')}
                    onBlur={() => setFocusedField('')}
                    onChangeText={(value) => updateField('email', value)}
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <View
                  style={[
                    styles.inputWrapper,
                    focusedField === 'password' && styles.inputWrapperFocused,
                  ]}
                >
                  <MaterialCommunityIcons
                    name="lock-outline"
                    size={20}
                    color={focusedField === 'password' ? '#16A34A' : '#5B6874'}
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={[styles.input, styles.passwordInput]}
                    placeholder="Min. 6 characters"
                    placeholderTextColor="#7A8794"
                    secureTextEntry={!showPassword}
                    editable={!loading}
                    value={form.password}
                    onFocus={() => setFocusedField('password')}
                    onBlur={() => setFocusedField('')}
                    onChangeText={(value) => updateField('password', value)}
                  />
                  <TouchableOpacity
                    style={styles.eyeButton}
                    onPress={() => setShowPassword((prev) => !prev)}
                    disabled={loading}
                  >
                    <MaterialCommunityIcons
                      name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                      size={20}
                      color="#1B5E20"
                    />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.inputGroup}>
                <View
                  style={[
                    styles.inputWrapper,
                    focusedField === 'confirmPassword' && styles.inputWrapperFocused,
                  ]}
                >
                  <MaterialCommunityIcons
                    name="lock-outline"
                    size={20}
                    color={focusedField === 'confirmPassword' ? '#16A34A' : '#5B6874'}
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={[styles.input, styles.passwordInput]}
                    placeholder="Re-enter password"
                    placeholderTextColor="#7A8794"
                    secureTextEntry={!showConfirmPassword}
                    editable={!loading}
                    value={form.confirmPassword}
                    onFocus={() => setFocusedField('confirmPassword')}
                    onBlur={() => setFocusedField('')}
                    onChangeText={(value) => updateField('confirmPassword', value)}
                  />
                  <TouchableOpacity
                    style={styles.eyeButton}
                    onPress={() => setShowConfirmPassword((prev) => !prev)}
                    disabled={loading}
                  >
                    <MaterialCommunityIcons
                      name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'}
                      size={20}
                      color="#1B5E20"
                    />
                  </TouchableOpacity>
                </View>
              </View>

              <TouchableOpacity
                style={[
                  styles.primaryButton,
                  (!canSubmit || loading) && styles.primaryButtonDisabled,
                ]}
                onPress={handleSignup}
                disabled={!canSubmit || loading}
                activeOpacity={0.88}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.primaryButtonText}>Create Account</Text>
                )}
              </TouchableOpacity>

              <View style={styles.footerRow}>
                <Text style={styles.footerRowText}>Already have an account? </Text>
                <TouchableOpacity onPress={() => navigation.navigate('Login')} disabled={loading}>
                  <Text style={styles.footerRowLink}>Sign In</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.footerText}>Secure authentication powered by Supabase</Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </LinearGradient>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0D3B2E',
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 36,
    paddingBottom: 44,
  },
  logoSection: {
    alignItems: 'center',
    marginBottom: 34,
  },
  logo: {
    width: 128,
    height: 128,
    marginBottom: 14,
  },
  appName: {
    fontFamily: FONT_FAMILY,
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: '#FFFFFF',
    marginBottom: 6,
  },
  tagline: {
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    color: 'rgba(255,255,255,0.78)',
    fontWeight: '500',
  },
  formSection: {
    width: '100%',
    maxWidth: 460,
    alignSelf: 'center',
  },
  formTitle: {
    fontFamily: FONT_FAMILY,
    fontSize: 34,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  formSubtitle: {
    fontFamily: FONT_FAMILY,
    fontSize: 14,
    color: 'rgba(255,255,255,0.74)',
    fontWeight: '500',
    marginBottom: 24,
  },
  inputGroup: {
    marginBottom: 18,
  },
  inputWrapper: {
    minHeight: 58,
    borderRadius: 14,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#DDE5EC',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    shadowColor: '#0B1F15',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 3,
  },
  inputWrapperFocused: {
    borderColor: '#16A34A',
    shadowColor: '#16A34A',
    shadowOpacity: 0.2,
    shadowRadius: 14,
    elevation: 4,
  },
  inputIcon: {
    marginRight: 10,
    textAlignVertical: 'center',
  },
  input: {
    flex: 1,
    color: '#111827',
    fontFamily: FONT_FAMILY,
    fontSize: 16,
    fontWeight: '400',
    paddingVertical: 17,
  },
  passwordInput: {
    paddingRight: 8,
  },
  eyeButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButton: {
    width: '100%',
    backgroundColor: '#16A34A',
    borderRadius: 14,
    paddingVertical: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
    marginBottom: 38,
    shadowColor: '#0D6A31',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.34,
    shadowRadius: 17,
    elevation: 7,
  },
  primaryButtonDisabled: {
    backgroundColor: '#7FA984',
    shadowOpacity: 0.12,
    elevation: 2,
  },
  primaryButtonText: {
    fontFamily: FONT_FAMILY,
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 40,
  },
  footerRowText: {
    fontFamily: FONT_FAMILY,
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '500',
  },
  footerRowLink: {
    fontFamily: FONT_FAMILY,
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  footerText: {
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    color: 'rgba(255,255,255,0.52)',
    fontWeight: '400',
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 14,
    marginBottom: 4,
  },
})
