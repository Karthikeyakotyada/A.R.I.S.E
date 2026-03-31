import React, { useState } from 'react'
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
  Alert,
  ActivityIndicator,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { supabase } from '../lib/supabaseClient'

const APP_LOGO = require('../../assets/app-logo.png')
const FONT_FAMILY = Platform.select({
  ios: 'System',
  android: 'Roboto',
  default: 'sans-serif',
})

export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [focusedField, setFocusedField] = useState('')
  const [loading, setLoading] = useState(false)
  const [resettingPassword, setResettingPassword] = useState(false)
  const [errors, setErrors] = useState({})

  const validateForm = () => {
    const newErrors = {}

    if (!email.trim()) {
      newErrors.email = 'Email is required'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      newErrors.email = 'Enter a valid email'
    }

    if (!password) {
      newErrors.password = 'Password is required'
    } else if (password.length < 6) {
      newErrors.password = 'Password must be 6+ characters'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleLogin = async () => {
    if (!validateForm()) return

    setLoading(true)
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })

      if (error) {
        Alert.alert('Login Failed', error.message || 'Invalid credentials')
      } else if (data.user) {
        // Navigation will be handled by auth state listener
        Alert.alert('Success', 'Logged in successfully!')
      }
    } catch (err) {
      Alert.alert('Error', 'An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleForgotPassword = async () => {
    const trimmedEmail = email.trim()

    if (!trimmedEmail) {
      setErrors((prev) => ({ ...prev, email: 'Enter your email to reset password' }))
      Alert.alert('Email Required', 'Please enter your account email first.')
      return
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setErrors((prev) => ({ ...prev, email: 'Enter a valid email' }))
      Alert.alert('Invalid Email', 'Please enter a valid email address.')
      return
    }

    setResettingPassword(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail)
      if (error) throw error

      Alert.alert(
        'Reset Link Sent',
        'If this email is registered, a password reset link has been sent.'
      )
    } catch (err) {
      Alert.alert('Reset Failed', err?.message || 'Could not send reset email. Please try again.')
    } finally {
      setResettingPassword(false)
    }
  }

  const isFormValid = email.trim() && password && Object.keys(errors).length === 0

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Clean top-to-bottom healthcare gradient for readability */}
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
              <Text style={styles.formTitle}>Welcome Back</Text>
              <Text style={styles.formSubtitle}>Sign in to continue your health journey</Text>

              <View style={styles.inputGroup}>
                {/* Icon-led field styling for faster visual recognition */}
                <View
                  style={[
                    styles.inputWrapper,
                    focusedField === 'email' && styles.inputWrapperFocused,
                    errors.email && styles.inputWrapperError,
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
                    placeholder="name@example.com"
                    placeholderTextColor="#7A8794"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!loading}
                    value={email}
                    onFocus={() => setFocusedField('email')}
                    onBlur={() => setFocusedField('')}
                    onChangeText={(text) => {
                      setEmail(text)
                      if (errors.email) {
                        setErrors((prev) => ({ ...prev, email: '' }))
                      }
                    }}
                  />
                </View>
                {errors.email && <Text style={styles.errorMessage}>{errors.email}</Text>}
              </View>

              <View style={styles.inputGroup}>
                <View
                  style={[
                    styles.inputWrapper,
                    focusedField === 'password' && styles.inputWrapperFocused,
                    errors.password && styles.inputWrapperError,
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
                    placeholder="Enter your password"
                    placeholderTextColor="#7A8794"
                    secureTextEntry={!showPassword}
                    editable={!loading}
                    value={password}
                    onFocus={() => setFocusedField('password')}
                    onBlur={() => setFocusedField('')}
                    onChangeText={(text) => {
                      setPassword(text)
                      if (errors.password) {
                        setErrors((prev) => ({ ...prev, password: '' }))
                      }
                    }}
                  />
                  <TouchableOpacity
                    style={styles.eyeButton}
                    onPress={() => setShowPassword(!showPassword)}
                    disabled={loading}
                  >
                    <MaterialCommunityIcons
                      name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                      size={20}
                      color="#1B5E20"
                    />
                  </TouchableOpacity>
                </View>
                {errors.password && <Text style={styles.errorMessage}>{errors.password}</Text>}
              </View>

              <TouchableOpacity
                style={styles.forgotPasswordWrap}
                onPress={handleForgotPassword}
                disabled={loading || resettingPassword}
                activeOpacity={0.75}
              >
                <Text style={styles.forgotPassword}>
                  {resettingPassword ? 'Sending reset link...' : 'Forgot password?'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.signInButton,
                  (!isFormValid || loading) && styles.signInButtonDisabled,
                ]}
                onPress={handleLogin}
                disabled={!isFormValid || loading}
                activeOpacity={0.88}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.signInButtonText}>Sign In</Text>
                )}
              </TouchableOpacity>

              <View style={styles.signUpRow}>
                <Text style={styles.signUpText}>Don't have an account? </Text>
                <TouchableOpacity
                  onPress={() => navigation.navigate('Signup')}
                  disabled={loading}
                >
                  <Text style={styles.signUpLink}>Create one</Text>
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
    paddingBottom: 28,
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
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: '#DDE5EC',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    shadowColor: '#0B1F15',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 3,
  },
  inputWrapperFocused: {
    borderColor: '#16A34A',
    shadowOpacity: 0.14,
  },
  inputWrapperError: {
    borderColor: '#FB7185',
  },
  inputIcon: {
    marginRight: 10,
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
    padding: 6,
  },
  errorMessage: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    color: '#FFE4E6',
    fontWeight: '600',
    marginTop: 6,
    marginLeft: 2,
  },
  forgotPasswordWrap: {
    alignSelf: 'flex-end',
    marginBottom: 24,
  },
  forgotPassword: {
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    color: '#E4FFE8',
    fontWeight: '600',
  },
  signInButton: {
    width: '100%',
    backgroundColor: '#16A34A',
    borderRadius: 14,
    paddingVertical: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 34,
    shadowColor: '#0D6A31',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.32,
    shadowRadius: 16,
    elevation: 6,
  },
  signInButtonDisabled: {
    backgroundColor: '#7FA984',
    shadowOpacity: 0.12,
    elevation: 2,
  },
  signInButtonText: {
    fontFamily: FONT_FAMILY,
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  signUpRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 34,
  },
  signUpText: {
    fontFamily: FONT_FAMILY,
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '500',
  },
  signUpLink: {
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
    marginTop: 10,
  },
})