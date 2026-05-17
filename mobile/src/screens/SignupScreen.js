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
import * as Linking from 'expo-linking'
import * as WebBrowser from 'expo-web-browser'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { useDialog } from '../context/DialogContext'
import { finalizeOAuthRedirect, supabase } from '../lib/supabaseClient'
import { typography } from '../lib/typography'

WebBrowser.maybeCompleteAuthSession()

const APP_LOGO = require('../../assets/app-logo.png')
const FONT_FAMILY = typography.system

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
  const [googleLoading, setGoogleLoading] = useState(false)

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

  async function handleGoogleSignup() {
    setGoogleLoading(true)
    try {
      const redirectTo = Linking.createURL('auth/callback')
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          skipBrowserRedirect: true,
        },
      })

      if (error) throw error
      if (!data?.url) throw new Error('Could not start Google sign in. Please try again.')

      const authResult = await WebBrowser.openAuthSessionAsync(data.url, redirectTo)
      if (authResult.type !== 'success' || !authResult.url) {
        return
      }

      await finalizeOAuthRedirect(authResult.url)
    } catch (error) {
      await showMessage({
        title: 'Google Sign-In Failed',
        message: error?.message || 'Please try again.',
        tone: 'error',
      })
    } finally {
      setGoogleLoading(false)
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
                    editable={!loading && !googleLoading}
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
                    editable={!loading && !googleLoading}
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
                    editable={!loading && !googleLoading}
                    value={form.password}
                    onFocus={() => setFocusedField('password')}
                    onBlur={() => setFocusedField('')}
                    onChangeText={(value) => updateField('password', value)}
                  />
                  <TouchableOpacity
                    style={styles.eyeButton}
                    onPress={() => setShowPassword((prev) => !prev)}
                    disabled={loading || googleLoading}
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
                    editable={!loading && !googleLoading}
                    value={form.confirmPassword}
                    onFocus={() => setFocusedField('confirmPassword')}
                    onBlur={() => setFocusedField('')}
                    onChangeText={(value) => updateField('confirmPassword', value)}
                  />
                  <TouchableOpacity
                    style={styles.eyeButton}
                    onPress={() => setShowConfirmPassword((prev) => !prev)}
                    disabled={loading || googleLoading}
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
                  (!canSubmit || loading || googleLoading) && styles.primaryButtonDisabled,
                ]}
                onPress={handleSignup}
                disabled={!canSubmit || loading || googleLoading}
                activeOpacity={0.88}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.primaryButtonText}>Create Account</Text>
                )}
              </TouchableOpacity>

              <View style={styles.oauthSeparator}>
                <View style={styles.oauthSeparatorLine} />
                <Text style={styles.oauthSeparatorText}>OR</Text>
                <View style={styles.oauthSeparatorLine} />
              </View>

              <TouchableOpacity
                style={[styles.googleButton, googleLoading && styles.googleButtonDisabled]}
                onPress={handleGoogleSignup}
                disabled={loading || googleLoading}
                activeOpacity={0.88}
              >
                {googleLoading ? (
                  <ActivityIndicator size="small" color="#111827" />
                ) : (
                  <>
                    <MaterialCommunityIcons name="google" size={20} color="#ea4335" />
                    <Text style={styles.googleButtonText}>Continue with Google</Text>
                  </>
                )}
              </TouchableOpacity>

              <View style={styles.footerRow}>
                <Text style={styles.footerRowText}>Already have an account? </Text>
                <TouchableOpacity onPress={() => navigation.navigate('Login')} disabled={loading || googleLoading}>
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
    fontSize: 34,
    ...typography.style.extraBold,
    letterSpacing: 1.2,
    color: '#FFFFFF',
    marginBottom: 6,
  },
  tagline: {
    fontSize: 13,
    ...typography.style.regular,
    color: 'rgba(255,255,255,0.78)',
  },
  formSection: {
    width: '100%',
    maxWidth: 460,
    alignSelf: 'center',
  },
  formTitle: {
    fontSize: 34,
    ...typography.style.extraBold,
    color: '#FFFFFF',
    marginBottom: 8,
  },
  formSubtitle: {
    fontSize: 14,
    ...typography.style.regular,
    color: 'rgba(255,255,255,0.74)',
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
    boxShadow: '0px 5px 12px rgba(11,31,21,0.10)',
    elevation: 3,
  },
  inputWrapperFocused: {
    borderColor: '#16A34A',
    boxShadow: '0px 5px 14px rgba(22,163,74,0.20)',
    elevation: 4,
  },
  inputIcon: {
    marginRight: 10,
    textAlignVertical: 'center',
  },
  input: {
    flex: 1,
    color: '#111827',
    ...typography.style.regular,
    fontSize: 16,
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
    boxShadow: '0px 10px 17px rgba(13,106,49,0.34)',
    elevation: 7,
  },
  primaryButtonDisabled: {
    backgroundColor: '#7FA984',
    boxShadow: '0px 10px 17px rgba(13,106,49,0.12)',
    elevation: 2,
  },
  primaryButtonText: {
    fontSize: 16,
    ...typography.style.semiBold,
    color: '#FFFFFF',
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 40,
  },
  oauthSeparator: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
  },
  oauthSeparatorLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  oauthSeparatorText: {
    fontSize: 12,
    ...typography.style.semiBold,
    color: 'rgba(255,255,255,0.7)',
    marginHorizontal: 12,
  },
  googleButton: {
    width: '100%',
    minHeight: 54,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#dbe4ef',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 28,
    elevation: 3,
  },
  googleButtonDisabled: {
    opacity: 0.75,
  },
  googleButtonText: {
    fontSize: 15,
    ...typography.style.bold,
    color: '#111827',
  },
  footerRowText: {
    fontSize: 14,
    ...typography.style.regular,
    color: 'rgba(255,255,255,0.8)',
  },
  footerRowLink: {
    fontSize: 14,
    ...typography.style.bold,
    color: '#FFFFFF',
  },
  footerText: {
    fontSize: 11,
    ...typography.style.regular,
    color: 'rgba(255,255,255,0.52)',
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 14,
    marginBottom: 4,
  },
})
