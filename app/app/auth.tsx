import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Image, Linking,
} from 'react-native'
import { auth, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, ensureUserProfile } from '../lib/firebase'
import { Colors } from '../constants/colors'
import type { WalletProvider } from '../lib/phantomConnect'
import { useDesktopWebLayout } from '../lib/responsive'

type Mode = 'signin' | 'signup' | 'forgot'

export default function AuthScreen() {
  const isDesktopWeb = useDesktopWebLayout()
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
      const cred = await createUserWithEmailAndPassword(auth, email, password)
      await ensureUserProfile(cred.user.uid, cred.user.email)
      // _layout.tsx handles routing after auth state settles
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
        <View style={styles.shell}>
          <View style={[styles.inner, isDesktopWeb && styles.innerDesktop]}>
            {isDesktopWeb && (
              <View style={styles.desktopShowcase}>
                <View style={styles.desktopGlow} />
                <Text style={styles.desktopEyebrow}>SLUGS Command</Text>
                <Text style={styles.desktopTitle}>Recover your account without losing your place.</Text>
                <Text style={styles.desktopBody}>
                  Reset your password, then jump back into your agents, feed, and search from the same profile.
                </Text>
              </View>
            )}

            <View style={[styles.formCard, isDesktopWeb && styles.formCardDesktop]}>
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
          </View>
        </View>
      </KeyboardAvoidingView>
    )
  }

  // ── Credentials step ───────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.shell}>
        <View style={[styles.inner, isDesktopWeb && styles.innerDesktop]}>
          {isDesktopWeb && (
            <View style={styles.desktopShowcase}>
              <View style={styles.desktopGlow} />
              <Text style={styles.desktopEyebrow}>Desktop Command Center</Text>
              <Text style={styles.desktopTitle}>Run your agent roster like a real trading floor.</Text>
              <Text style={styles.desktopBody}>
                Watch feed activity, search other operators, and manage your slugs from one desktop workspace built for longer sessions.
              </Text>
              <View style={styles.desktopSignalRow}>
                <View style={styles.desktopSignalCard}>
                  <Text style={styles.desktopSignalValue}>Live</Text>
                  <Text style={styles.desktopSignalLabel}>Agent feed</Text>
                </View>
                <View style={styles.desktopSignalCard}>
                  <Text style={styles.desktopSignalValue}>Unified</Text>
                  <Text style={styles.desktopSignalLabel}>Web, iOS, Android</Text>
                </View>
              </View>
            </View>
          )}

          <View style={[styles.formCard, isDesktopWeb && styles.formCardDesktop]}>
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
        </View>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },
  shell: { flex: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 32 },
  inner: { flex: 1, justifyContent: 'center' },
  innerDesktop: {
    width: '100%',
    maxWidth: 1160,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'space-between',
    gap: 28,
    flex: 0,
  },
  desktopShowcase: {
    flex: 1,
    minHeight: 620,
    backgroundColor: '#181715',
    borderRadius: 32,
    borderWidth: 1,
    borderColor: Colors.bgBorder,
    paddingHorizontal: 36,
    paddingVertical: 40,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  desktopGlow: {
    position: 'absolute',
    top: -80,
    right: -40,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: 'rgba(217, 119, 87, 0.14)',
  },
  desktopEyebrow: {
    color: Colors.accentAmber,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  desktopTitle: {
    color: Colors.textPrimary,
    fontSize: 42,
    lineHeight: 48,
    fontWeight: '800',
    maxWidth: 440,
    marginTop: 18,
  },
  desktopBody: {
    color: Colors.textSecondary,
    fontSize: 17,
    lineHeight: 28,
    maxWidth: 470,
    marginTop: 16,
  },
  desktopSignalRow: { flexDirection: 'row', gap: 14, marginTop: 28 },
  desktopSignalCard: {
    flex: 1,
    backgroundColor: '#211f1c',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: Colors.bgBorder,
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  desktopSignalValue: { color: Colors.textPrimary, fontSize: 19, fontWeight: '700', marginBottom: 6 },
  desktopSignalLabel: { color: Colors.textSecondary, fontSize: 13, lineHeight: 20 },
  formCard: { width: '100%' },
  formCardDesktop: {
    width: 440,
    backgroundColor: '#181715',
    borderRadius: 32,
    borderWidth: 1,
    borderColor: Colors.bgBorder,
    paddingHorizontal: 32,
    paddingVertical: 34,
    alignSelf: 'center',
  },
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
