import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Image, Linking,
} from 'react-native'
import { auth, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail } from '../lib/firebase'
import { Colors } from '../constants/colors'
import type { WalletProvider } from '../lib/phantomConnect'

type Mode = 'signin' | 'signup' | 'forgot'

export default function AuthScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<Mode>('signin')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resetSent, setResetSent] = useState(false)
  const [connectingWallet, setConnectingWallet] = useState<WalletProvider | null>(null)

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
    try {
      await signInWithEmailAndPassword(auth, email, password)
      // _layout.tsx onAuthStateChanged handles routing
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleSignUp() {
    if (!email || !password) return
    setLoading(true)
    setError(null)
    try {
      await createUserWithEmailAndPassword(auth, email, password)
      // _layout.tsx routes new users (no username) to /set-username
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleForgotPassword() {
    if (!email) { setError('Enter your email first'); return }
    setLoading(true)
    setError(null)
    try {
      await sendPasswordResetEmail(auth, email)
      setResetSent(true)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  // ── Forgot password step ──────────────────────────────────────────────────
  if (mode === 'forgot') {
    return (
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.inner}>
          <Image source={require('../assets/slugs-logo.png')} style={styles.logoImage} resizeMode="contain" />
          <Text style={styles.usernameTitle}>Reset password</Text>
          <Text style={styles.usernameSubtitle}>Enter your email and we'll send a reset link.</Text>

          {resetSent ? (
            <Text style={styles.resetSentText}>Check your inbox — reset link sent to {email}</Text>
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
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
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
  container: { flex: 1, backgroundColor: Colors.bgPrimary },
  inner: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
  logoRow: { alignItems: 'flex-start', marginBottom: 8 },
  logoImage: { width: 160, height: 60, marginBottom: 8 },
  tagline: { fontSize: 14, color: Colors.textSecondary, marginBottom: 48 },
  form: { gap: 12 },
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
  error: { color: Colors.accentRed, fontSize: 13 },
  primaryBtn: {
    backgroundColor: Colors.accentAmber,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  primaryBtnText: { color: Colors.bgPrimary, fontSize: 16, fontWeight: '600' },
  toggleText: { color: Colors.textSecondary, fontSize: 14, textAlign: 'center', marginTop: 8 },
  forgotText: { color: Colors.textMuted, fontSize: 13, textAlign: 'center', marginTop: 4 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 },
  dividerLine: { flex: 1, height: 1, backgroundColor: Colors.bgBorder },
  dividerText: { color: Colors.textMuted, fontSize: 12 },
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
  walletBtnText: { color: Colors.textPrimary, fontSize: 15, fontWeight: '600' },
  walletBtnSub: { color: Colors.textMuted, fontSize: 11 },
  resetSentText: { color: Colors.accentGreen, fontSize: 14, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  usernameTitle: { fontSize: 28, fontWeight: '800', color: Colors.textPrimary, marginBottom: 10, marginTop: 32 },
  usernameSubtitle: { fontSize: 14, color: Colors.textSecondary, lineHeight: 22, marginBottom: 32 },
})
