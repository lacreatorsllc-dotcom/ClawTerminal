import { useEffect, useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Image, Linking, ScrollView,
} from 'react-native'
import * as WebBrowser from 'expo-web-browser'
import * as AuthSession from 'expo-auth-session'
import * as Google from 'expo-auth-session/providers/google'
import {
  auth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  ensureUserProfile,
  signInWithTwitterX,
  signInWithGoogleIdToken,
  signInWithGooglePopup,
  startNativeTwitterXSignIn,
  completeNativeTwitterXSignIn,
} from '../lib/firebase'
import { Colors } from '../constants/colors'
import type { WalletProvider } from '../lib/phantomConnect'
import { useDesktopWebLayout } from '../lib/responsive'
import { WalletPickerSheet } from '../components/WalletPickerSheet'

type Mode = 'signin' | 'signup' | 'forgot'

WebBrowser.maybeCompleteAuthSession()

const BASE_SOLANA_WALLETS: { id: WalletProvider; label: string; icon: string; subtitle: string }[] = [
  { id: 'phantom', label: 'Phantom', icon: '◎', subtitle: 'Most popular Solana wallet' },
  { id: 'backpack', label: 'Backpack', icon: '⬡', subtitle: 'Wallet plus xNFT ecosystem' },
  { id: 'solflare', label: 'Solflare', icon: '◌', subtitle: 'Popular Solana wallet for mobile and web' },
]

type SocialProvider = 'google' | 'twitter'

function SocialMark({ provider }: { provider: SocialProvider }) {
  if (provider === 'google') {
    return (
      <Text style={styles.googleMark}>
        <Text style={{ color: '#4285F4' }}>G</Text>
      </Text>
    )
  }

  return <Text style={styles.xMark}>X</Text>
}

function SocialSignInButton({
  provider,
  label,
  loading,
  disabled,
  onPress,
}: {
  provider: SocialProvider
  label: string
  loading?: boolean
  disabled?: boolean
  onPress: () => void
}) {
  const isGoogle = provider === 'google'
  return (
    <TouchableOpacity
      style={[
        styles.socialBtn,
        isGoogle ? styles.googleSocialBtn : styles.xSocialBtn,
        disabled && styles.walletBtnDisabled,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.84}
    >
      {loading ? (
        <ActivityIndicator color={isGoogle ? Colors.textPrimary : '#000'} />
      ) : (
        <>
          <SocialMark provider={provider} />
          <Text style={[styles.socialBtnText, isGoogle ? styles.googleSocialText : styles.xSocialText]}>
            {label}
          </Text>
        </>
      )}
    </TouchableOpacity>
  )
}

function paramsFromUrl(url: string) {
  const query = url.includes('?') ? url.split('?')[1]?.split('#')[0] : ''
  return new URLSearchParams(query ?? '')
}

function GoogleSignInButton({
  config,
  loading,
  setLoading,
  setError,
}: {
  config: { iosClientId?: string; androidClientId?: string; webClientId?: string }
  loading: boolean
  setLoading: (value: boolean) => void
  setError: (value: string | null) => void
}) {
  const [, googleResponse, promptGoogleAsync] = Google.useIdTokenAuthRequest({
    ...config,
    selectAccount: true,
  })

  useEffect(() => {
    if (!googleResponse) return

    if (googleResponse.type === 'error') {
      setLoading(false)
      setError('Google sign-in failed. Please try again.')
      return
    }

    if (googleResponse.type !== 'success') {
      setLoading(false)
      return
    }

    const idToken = googleResponse.params?.id_token
    if (!idToken) {
      setLoading(false)
      setError('Google sign-in did not return an ID token.')
      return
    }

    void (async () => {
      try {
        await signInWithGoogleIdToken(idToken)
      } catch (e: any) {
        setError(e?.message ?? 'Google sign-in failed')
      } finally {
        setLoading(false)
      }
    })()
  }, [googleResponse, setError, setLoading])

  async function handleGoogleSignIn() {
    setLoading(true)
    setError(null)

    try {
      if (Platform.OS === 'web') {
        await signInWithGooglePopup()
        setLoading(false)
        return
      }
      await promptGoogleAsync()
    } catch (e: any) {
      setLoading(false)
      setError(e?.message ?? 'Google sign-in failed')
    }
  }

  return (
    <SocialSignInButton
      provider="google"
      label="Sign in with Google"
      loading={loading}
      disabled={loading}
      onPress={handleGoogleSignIn}
    />
  )
}

export default function AuthScreen() {
  const isDesktopWeb = useDesktopWebLayout()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<Mode>('signin')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resetSent, setResetSent] = useState(false)
  const [connectingWallet, setConnectingWallet] = useState<WalletProvider | null>(null)
  const [walletSheetVisible, setWalletSheetVisible] = useState(false)
  const googleIosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID
  const googleAndroidClientId = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID
  const googleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID
  const googleClientConfig =
    Platform.OS === 'web'
      ? { webClientId: googleWebClientId }
      : Platform.OS === 'ios'
        ? { iosClientId: googleIosClientId, webClientId: googleWebClientId }
        : { androidClientId: googleAndroidClientId, webClientId: googleWebClientId }
  const googleEnabled = Platform.OS === 'web'
    ? true
    : Platform.OS === 'ios'
      ? !!googleIosClientId && !!googleWebClientId
      : !!googleAndroidClientId && !!googleWebClientId
  const walletOptions = Platform.OS === 'android'
    ? [
        { id: 'seeker' as WalletProvider, label: 'Seeker wallet', icon: 'S', subtitle: 'Use Android native wallet connection' },
        ...BASE_SOLANA_WALLETS,
      ]
    : BASE_SOLANA_WALLETS

  async function handleWalletConnect(provider: WalletProvider) {
    setConnectingWallet(provider)
    setError(null)
    try {
      if (provider === 'seeker' && Platform.OS === 'android') {
        const { connectSeekerWallet } = await import('../lib/mobileWallet')
        await connectSeekerWallet()
        return
      }

      const {
        beginMobileWalletConnect,
        connectInjectedWallet,
        getWalletInstallUrl,
      } = await import('../lib/phantomConnect')

      if (Platform.OS === 'web') {
        const result = await connectInjectedWallet(provider)
        if (!result) {
          window.open(getWalletInstallUrl(provider), '_blank', 'noopener,noreferrer')
          setError(`${provider.charAt(0).toUpperCase() + provider.slice(1)} is not installed in this browser`)
          return
        }
        return
      }

      const url = beginMobileWalletConnect(provider)
      const supported = await Linking.canOpenURL(url)
      if (!supported) {
        await Linking.openURL(getWalletInstallUrl(provider))
        setError(`${provider.charAt(0).toUpperCase() + provider.slice(1)} is not installed on this device`)
        return
      }

      await Linking.openURL(url)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Wallet connection failed'
      setError(message)
    } finally {
      setConnectingWallet(null)
    }
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

  async function handleTwitterSignIn() {
    setLoading(true)
    setError(null)
    try {
      if (Platform.OS === 'web') {
        await signInWithTwitterX()
        return
      }

      const callbackUrl = AuthSession.makeRedirectUri({
        native: 'slugs://auth/twitter',
        scheme: 'slugs',
        path: 'auth/twitter',
      })
      const start = await startNativeTwitterXSignIn(callbackUrl)
      const response = await WebBrowser.openAuthSessionAsync(start.authUrl, callbackUrl)

      if (response.type !== 'success') {
        setError('X sign-in was cancelled.')
        return
      }

      const params = paramsFromUrl(response.url)
      const oauthToken = params.get('oauth_token')
      const oauthVerifier = params.get('oauth_verifier')

      if (!oauthToken || !oauthVerifier) {
        setError('X sign-in did not return verification data.')
        return
      }

      if (oauthToken !== start.oauthToken) {
        setError('X sign-in returned an unexpected token. Please try again.')
        return
      }

      await completeNativeTwitterXSignIn({
        oauthToken,
        oauthVerifier,
        oauthTokenSecret: start.oauthTokenSecret,
      })
    } catch (e: any) {
      const message = e?.message ?? 'X sign-in failed'
      setError(message)
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
        <ScrollView contentContainerStyle={styles.shell} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
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
        </ScrollView>
      </KeyboardAvoidingView>
    )
  }

  // ── Credentials step ───────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.shell} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
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

              <View style={styles.socialStack}>
                <TouchableOpacity
                  style={[styles.phantomBtn, (loading || !!connectingWallet) && styles.walletBtnDisabled]}
                  onPress={() => handleWalletConnect('phantom')}
                  disabled={loading || !!connectingWallet}
                  activeOpacity={0.84}
                >
                  {connectingWallet === 'phantom'
                    ? <ActivityIndicator color="#fff" />
                    : <>
                        <Text style={styles.phantomIcon}>◎</Text>
                        <Text style={styles.phantomBtnText}>Sign in with Phantom</Text>
                      </>
                  }
                </TouchableOpacity>

                <SocialSignInButton
                  provider="twitter"
                  label="Sign in with X"
                  loading={loading}
                  disabled={loading}
                  onPress={handleTwitterSignIn}
                />
              </View>

              <Text style={styles.termsText}>
                By signing up, you agree to our{'\n'}Terms of Service and Privacy Policy.
              </Text>
            </View>
          </View>
        </View>

      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },
  shell: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 32 },
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
  socialStack: { gap: 12 },
  socialBtn: {
    minHeight: 60,
    borderRadius: 18,
    paddingHorizontal: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  googleSocialBtn: {
    backgroundColor: '#111018',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  xSocialBtn: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  socialBtnText: {
    fontSize: 19,
    lineHeight: 24,
    fontWeight: '800',
    letterSpacing: 0.1,
  },
  googleSocialText: { color: '#ffffff' },
  xSocialText: { color: '#070707' },
  googleMark: {
    fontSize: 26,
    lineHeight: 28,
    fontWeight: '900',
    minWidth: 30,
    textAlign: 'center',
  },
  xMark: {
    color: '#000',
    fontSize: 25,
    lineHeight: 28,
    fontWeight: '900',
    minWidth: 30,
    textAlign: 'center',
  },
  termsText: {
    color: Colors.textMuted,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 6,
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
  },
  googleBtn: {
    borderColor: 'rgba(255,255,255,0.12)',
  },
  twitterBtn: {
    marginTop: 2,
  },
  walletBtnDisabled: {
    opacity: 0.5,
  },
  walletBtnText: { color: Colors.textPrimary, fontSize: 15, fontWeight: '600' },
  walletBtnSub: { color: Colors.textMuted, fontSize: 11 },
  phantomBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, paddingVertical: 14, borderRadius: 14,
    backgroundColor: '#AB9FF2',
  },
  phantomIcon: { fontSize: 18, color: '#fff', fontWeight: '700' },
  phantomBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  resetSentText: { color: Colors.accentGreen, fontSize: 14, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  usernameTitle: { fontSize: 28, fontWeight: '800', color: Colors.textPrimary, marginBottom: 10, marginTop: 32 },
  usernameSubtitle: { fontSize: 14, color: Colors.textSecondary, lineHeight: 22, marginBottom: 32 },
})
