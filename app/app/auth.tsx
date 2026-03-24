import { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native'
import { router } from 'expo-router'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { Colors } from '../constants/colors'

export default function AuthScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { setSession } = useAuthStore()

  async function handleSubmit() {
    if (!email || !password) return
    setLoading(true)
    setError(null)

    const { data, error } = mode === 'signin'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password })

    setLoading(false)
    if (error) {
      setError(error.message)
    } else {
      setSession(data.session)
      router.replace('/(tabs)/agents')
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.inner}>
        {/* Logo */}
        <View style={styles.logoRow}>
          <Text style={styles.logo}>⌖</Text>
          <Text style={styles.logoText}>ClawTerminal</Text>
        </View>
        <Text style={styles.tagline}>Mobile command center for AI agents</Text>

        {/* Form */}
        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor={Colors.textMuted}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor={Colors.textMuted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
          />

          {error && <Text style={styles.error}>{error}</Text>}

          <TouchableOpacity style={styles.primaryBtn} onPress={handleSubmit} disabled={loading}>
            {loading
              ? <ActivityIndicator color={Colors.bgPrimary} />
              : <Text style={styles.primaryBtnText}>{mode === 'signin' ? 'Sign In' : 'Create Account'}</Text>
            }
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
            <Text style={styles.toggleText}>
              {mode === 'signin' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
            </Text>
          </TouchableOpacity>

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          <TouchableOpacity style={styles.walletBtn} disabled>
            <Text style={styles.walletBtnText}>⬡  Connect Wallet</Text>
            <Text style={styles.walletBtnSub}>Phantom · Solflare · Backpack</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgPrimary,
  },
  inner: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  logo: {
    fontSize: 32,
    color: Colors.accentCrimson,
    marginRight: 10,
  },
  logoText: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.textPrimary,
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 48,
  },
  form: {
    gap: 12,
  },
  input: {
    backgroundColor: '#0e0e0e',
    borderRadius: 12,
    borderBottomWidth: 2,
    borderBottomColor: Colors.bgBorder,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: Colors.textPrimary,
  },
  error: {
    color: Colors.accentRed,
    fontSize: 13,
  },
  primaryBtn: {
    backgroundColor: Colors.accentCrimson,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  primaryBtnText: {
    color: Colors.bgPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  toggleText: {
    color: Colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.bgBorder,
  },
  dividerText: {
    color: Colors.textMuted,
    fontSize: 12,
  },
  walletBtn: {
    backgroundColor: Colors.bgElevated,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.bgBorder,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    gap: 4,
    opacity: 0.5,
  },
  walletBtnText: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
  walletBtnSub: {
    color: Colors.textMuted,
    fontSize: 11,
  },
})
