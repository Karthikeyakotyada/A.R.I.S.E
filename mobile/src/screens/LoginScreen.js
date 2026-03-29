import React, { useState } from 'react'
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native'
import { supabase } from '../lib/supabaseClient'

const FORM_CARD_SHADOW_STYLE =
  Platform.OS === 'web'
    ? { boxShadow: '0px 2px 8px rgba(0,0,0,0.10)' }
    : {}

const PRIMARY_BUTTON_SHADOW_STYLE =
  Platform.OS === 'web'
    ? { boxShadow: '0px 2px 6px rgba(30,90,74,0.25)' }
    : {}

const PRIMARY_BUTTON_DISABLED_SHADOW_STYLE =
  Platform.OS === 'web' ? { boxShadow: 'none' } : {}

export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
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

  const isFormValid = email.trim() && password && Object.keys(errors).length === 0

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header Section */}
          <View style={styles.headerSection}>
            <View style={styles.headerBox}>
              <Text style={styles.headerIcon}>🏥</Text>
              <Text style={styles.headerTitle}>ARISE</Text>
              <Text style={styles.headerSubtitle}>Healthcare Platform</Text>
            </View>
          </View>

          {/* Login Form Card */}
          <View style={styles.formContainer}>
            <Text style={styles.formTitle}>Sign In</Text>
            <Text style={styles.formSubtitle}>
              Enter your credentials to access your account
            </Text>

            {/* Email Input */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email Address</Text>
              <View
                style={[
                  styles.inputBox,
                  errors.email && styles.inputBoxError,
                ]}
              >
                <Text style={styles.inputPrefix}>✉️</Text>
                <TextInput
                  style={styles.input}
                  placeholder="name@example.com"
                  placeholderTextColor="#999"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!loading}
                  value={email}
                  onChangeText={(text) => {
                    setEmail(text)
                    if (errors.email) {
                      setErrors((prev) => ({ ...prev, email: '' }))
                    }
                  }}
                />
              </View>
              {errors.email && (
                <Text style={styles.errorMessage}>{errors.email}</Text>
              )}
            </View>

            {/* Password Input */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Password</Text>
              <View
                style={[
                  styles.inputBox,
                  errors.password && styles.inputBoxError,
                ]}
              >
                <Text style={styles.inputPrefix}>🔐</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter your password"
                  placeholderTextColor="#999"
                  secureTextEntry={!showPassword}
                  editable={!loading}
                  value={password}
                  onChangeText={(text) => {
                    setPassword(text)
                    if (errors.password) {
                      setErrors((prev) => ({ ...prev, password: '' }))
                    }
                  }}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  disabled={loading}
                  style={styles.eyeButton}
                >
                  <Text style={styles.eyeIcon}>
                    {showPassword ? '👁️' : '👁️‍🗨️'}
                  </Text>
                </TouchableOpacity>
              </View>
              {errors.password && (
                <Text style={styles.errorMessage}>{errors.password}</Text>
              )}
            </View>

            {/* Forgot Password Link */}
            <TouchableOpacity
              onPress={() => navigation.navigate('ForgotPassword')}
              disabled={loading}
            >
              <Text style={styles.forgotPassword}>Forgot password?</Text>
            </TouchableOpacity>

            {/* Sign In Button */}
            <TouchableOpacity
              style={[
                styles.signInButton,
                (!isFormValid || loading) && styles.signInButtonDisabled,
              ]}
              onPress={handleLogin}
              disabled={!isFormValid || loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.signInButtonText}>Sign In</Text>
              )}
            </TouchableOpacity>

            {/* Divider */}
            <View style={styles.divider} />

            {/* Sign Up Link */}
            <View style={styles.signUpContainer}>
              <Text style={styles.signUpText}>Don't have an account? </Text>
              <TouchableOpacity
                onPress={() => navigation.navigate('Signup')}
                disabled={loading}
              >
                <Text style={styles.signUpLink}>Create one</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Footer */}
          <View style={styles.footerSection}>
            <Text style={styles.footerIcon}>🔒</Text>
            <Text style={styles.footerText}>
              Secure authentication powered by Supabase
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  headerSection: {
    marginBottom: 40,
    marginTop: 20,
    alignItems: 'center',
  },
  headerBox: {
    alignItems: 'center',
  },
  headerIcon: {
    fontSize: 60,
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 40,
    fontWeight: '900',
    color: '#1e5a4a',
    letterSpacing: 1,
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#666',
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  formContainer: {
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingVertical: 32,
    paddingHorizontal: 24,
    marginBottom: 24,
    elevation: 3,
    ...FORM_CARD_SHADOW_STYLE,
  },
  formTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  formSubtitle: {
    fontSize: 13,
    color: '#666',
    fontWeight: '500',
    marginBottom: 28,
    lineHeight: 20,
  },
  inputGroup: {
    marginBottom: 24,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2d3748',
    marginBottom: 8,
    letterSpacing: 0.3,
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    height: 56,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    backgroundColor: '#fafbfc',
    gap: 10,
  },
  inputBoxError: {
    borderColor: '#e53e3e',
    backgroundColor: '#fff5f5',
  },
  inputPrefix: {
    fontSize: 20,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: '#1a1a1a',
    fontWeight: '500',
    padding: 0,
  },
  eyeButton: {
    padding: 8,
    marginRight: -8,
  },
  eyeIcon: {
    fontSize: 18,
    opacity: 0.6,
  },
  errorMessage: {
    fontSize: 12,
    color: '#e53e3e',
    fontWeight: '600',
    marginTop: 6,
  },
  forgotPassword: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1e5a4a',
    textDecorationLine: 'underline',
    marginBottom: 24,
  },
  signInButton: {
    height: 56,
    borderRadius: 12,
    backgroundColor: '#1e5a4a',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    elevation: 4,
    ...PRIMARY_BUTTON_SHADOW_STYLE,
  },
  signInButtonDisabled: {
    backgroundColor: '#cbd5e0',
    elevation: 0,
    ...PRIMARY_BUTTON_DISABLED_SHADOW_STYLE,
  },
  signInButtonText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.5,
  },
  divider: {
    height: 1,
    backgroundColor: '#e2e8f0',
    marginBottom: 20,
  },
  signUpContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  signUpText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  signUpLink: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1e5a4a',
    textDecorationLine: 'underline',
  },
  footerSection: {
    alignItems: 'center',
    marginTop: 20,
    paddingVertical: 16,
  },
  footerIcon: {
    fontSize: 24,
    marginBottom: 8,
  },
  footerText: {
    fontSize: 12,
    color: '#999',
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 18,
  },
})