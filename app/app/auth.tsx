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
  Image,
  Linking,
  Alert,
} from 'react-native'
import { router } from 'expo-router'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { Colors } from '../constants/colors'
import type { WalletProvider } from '../lib/phantomConnect'

type Mode = 'signin' | 'signup' | 'forgot'
type Step = 'credentials' | 'username'

const USERNAME_RE = /^[a-z0-9_]{3,20}$/

export default function AuthScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [mode, setMode] = useState<Mode>('signin')
  const [step, setStep] = useState<Step>('credentials')
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null)
  const [resetSent, setResetSent] = useState(false)
  const [connectingWallet, setConnectingWallet] = useState<WalletProvider | null>(null)
  const [pendingUserId, setPendingUserId] = useState<string | null>(null)
  const { setSession, setUsername: storeUsername } = useAuthStore()

  async function handleWalletConnect(provider: WalletProvider) {
    setConnectingWallet(provider)
    setError(null)
    const { buildConnectUrl, resetDappKeyPair } = await import('../lib/phantomConnect')
    resetDappKeyPair()
    const url = buildConnectUrl(provider)
    const supported = await Linking.canOpenURL(url)
    if (!supported) {
      setError(`${provider.charAt(0).toUpperCase() + provider.slice(1)} is not installed`)
      setConnectingWallet(null)
      return
    }
    await Linking.openURL(url)
    setConnectingWallet(null)
  }

  async function handleSignIn() {
    if (!email || !password) return
    setLoading(true)
    setError(null)
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) { setError(error.message); return }

    // Load username from profile
    if (data.session) {
      setSession(data.session)
      const { data: profile } = await supabase
        .from('users')
        .select('username')
        .eq('id', data.session.user.id)
        .single()
      storeUsername(profile?.username ?? null)
    }
    router.replace('/(tabs)/agents')
  }

  async function handleSignUp() {
    if (!email || !password) return
    setLoading(true)
    setError(null)
    const { data, error } = await supabase.auth.signUp({ email, password })
    setLoading(false)
    if (error) { setError(error.message); return }
    setSession(data.session)
    setPendingUserId(data.user?.id ?? data.session?.user?.id ?? null)
    setStep('username')
  }

  async function handleForgotPassword() {
    if (!email) { setError('Enter your email first'); return }
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.resetPasswordForEmail(email)
    setLoading(false)
    if (error) { setError(error.message); return }
    setResetSent(true)
  }

  async function checkUsername(value: string) {
    const lower = value.toLowerCase()
    setUsername(lower)
    setUsernameAvailable(null)
    if (!USERNAME_RE.test(lower)) return
    setChecking(true)
    const { data } = await supabase
      .from('users')
      .select('id')
      .eq('username', lower)
      .maybeSingle()
    setChecking(false)
    setUsernameAvailable(!data)
  }

  async function handleSetUsername() {
    if (!USERNAME_RE.test(username) || !usernameAvailable) return
    setLoading(true)
    setError(null)
    const userId = pendingUserId
    if (!userId) { setError('Session expired. Please sign in again.'); setLoading(false); return }

    const { error } = await supabase
      .from('users')
      .update({ username })
      .eq('id', userId)

    setLoading(false)
    if (error) { setError(error.message); return }
    storeUsername(username)
    router.replace('/onboarding')
  }

  // ── Username step ──────────────────────────────────────────────────────────
  if (step === 'username') {
    const isValid = USERNAME_RE.test(username)
    const canSubmit = isValid && usernameAvailable === true && !loading

    return (
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.inner}>
          <Image source={require('../assets/slugs-logo.png')} style={styles.logoImage} resizeMode="contain" />

          <Text style={styles.usernameTitle}>Choose your slug</Text>
          <Text style={styles.usernameSubtitle}>
            This is your unique identity on SLUGS.{'\n'}You can't change it later.
          </Text>

          <View style={styles.usernameInputRow}>
            <Text style={styles.atSign}>@</Text>
            <TextInput
              style={styles.usernameInput}
              placeholder="your_slug"
              placeholderTextColor={Colors.textMuted}
              value={username}
              onChangeText={checkUsername}
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
            />
            {checking && <ActivityIndicator size="small" color={Colors.textMuted} style={{ marginRight: 12 }} />}
            {!checking && isValid && usernameAvailable === true && (
              <Text style={styles.availableCheck}>✓</Text>
            )}
            {!checking && isValid && usernameAvailable === false && (
              <Text style={styles.takenX}>✕</Text>
            )}
          </View>

          <Text style={styles.usernameHint}>
            3–20 characters · lowercase · letters, numbers, underscores
          </Text>

          {!isValid && username.length > 0 && (
            <Text style={styles.usernameError}>Invalid format</Text>
          )}
          {isValid && usernameAvailable === false && (
            <Text style={styles.usernameError}>@{username} is taken</Text>
          )}
          {error && <Text style={styles.usernameError}>{error}</Text>}

          <TouchableOpacity
            style={[styles.primaryBtn, !canSubmit && styles.primaryBtnDisabled]}
            onPress={handleSetUsername}
            disabled={!canSubmit}
          >
            {loading
              ? <ActivityIndicator color={Colors.bgPrimary} />
              : <Text style={styles.primaryBtnText}>Claim @{username || 'slug'}</Text>
            }
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    )
  }

  // ── Forgot password step ──────────────────────────────────────────────────
  if (mode === 'forgot') {
    return (
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.inner}>
          <Image source={require('../assets/slugs-logo.png')} style={styles.logoImage} resizeMode="contain" />

          <Text style={styles.usernameTitle}>Reset password</Text>
          <Text style={styles.usernameSubtitle}>
            Enter your email and we'll send a reset link.
          </Text>

          {resetSent ? (
            <Text style={styles.resetSentText}>
              Check your inbox — reset link sent to {email}
            </Text>
          ) : (
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
                autoFocus
              />
              {error && <Text style={styles.error}>{error}</Text>}
              <TouchableOpacity style={styles.primaryBtn} onPress={handleForgotPassword} disabled={loading}>
                {loading
                  ? <ActivityIndicator color={Colors.bgPrimary} />
                  : <Text style={styles.primaryBtnText}>Send reset link</Text>
                }
              </TouchableOpacity>
            </View>
          )}

          <TouchableOpacity onPress={() => { setMode('signin'); setError(null); setResetSent(false) }}>
            <Text style={styles.toggleText}>Back to sign in</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    )
  }

  // ── Credentials step ───────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.inner}>
        <View style={styles.logoRow}>
          <Image source={require('../assets/slugs-logo.png')} style={styles.logoImage} resizeMode="contain" />
        </View>
        <Text style={styles.tagline}>Mobile command center for AI agents</Text>

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

          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={mode === 'signin' ? handleSignIn : handleSignUp}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color={Colors.bgPrimary} />
              : <Text style={styles.primaryBtnText}>{mode === 'signin' ? 'Sign In' : 'Create Account'}</Text>
            }
          </TouchableOpacity>

          <TouchableOpacity onPress={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(null) }}>
            <Text style={styles.toggleText}>
              {mode === 'signin' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
            </Text>
          </TouchableOpacity>

          {mode === 'signin' && (
            <TouchableOpacity onPress={() => { setMode('forgot'); setError(null) }}>
              <Text style={styles.forgotText}>Forgot password?</Text>
            </TouchableOpacity>
          )}

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          {([
            { id: 'phantom', label: 'Phantom', icon: '◎' },
            { id: 'backpack', label: 'Backpack', icon: '⬡' },
          ] as { id: WalletProvider; label: string; icon: string }[]).map(({ id, label, icon }) => (
            <TouchableOpacity
              key={id}
              style={styles.walletBtn}
              onPress={() => handleWalletConnect(id)}
              disabled={!!connectingWallet}
            >
              {connectingWallet === id
                ? <ActivityIndicator color={Colors.textPrimary} />
                : <>
                    <Text style={styles.walletBtnText}>{icon}  {label}</Text>
                    <Text style={styles.walletBtnSub}>Solana wallet</Text>
                  </>
              }
            </TouchableOpacity>
          ))}
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
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  logoImage: {
    width: 160,
    height: 60,
    marginBottom: 8,
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
    backgroundColor: Colors.accentAmber,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  primaryBtnDisabled: {
    opacity: 0.4,
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

  forgotText: {
    color: Colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 4,
  },
  resetSentText: {
    color: Colors.accentGreen,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },

  // Username step
  usernameTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.textPrimary,
    marginBottom: 10,
    marginTop: 32,
  },
  usernameSubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 22,
    marginBottom: 32,
  },
  usernameInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0e0e0e',
    borderRadius: 12,
    borderBottomWidth: 2,
    borderBottomColor: Colors.bgBorder,
    marginBottom: 10,
  },
  atSign: {
    fontSize: 20,
    color: Colors.accentAmber,
    fontWeight: '700',
    paddingLeft: 16,
    paddingRight: 4,
  },
  usernameInput: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 18,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  availableCheck: {
    fontSize: 18,
    color: Colors.accentGreen,
    marginRight: 14,
    fontWeight: '700',
  },
  takenX: {
    fontSize: 18,
    color: Colors.accentRed,
    marginRight: 14,
    fontWeight: '700',
  },
  usernameHint: {
    fontSize: 12,
    color: Colors.textMuted,
    marginBottom: 8,
  },
  usernameError: {
    fontSize: 13,
    color: Colors.accentRed,
    marginBottom: 8,
  },
})
