import { useEffect, useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView,
} from 'react-native'
import { router } from 'expo-router'
import { isUsernameTaken, claimUsername } from '../lib/firebase'
import { useAuthStore } from '../stores/authStore'
import { Colors } from '../constants/colors'
import { useDesktopWebLayout } from '../lib/responsive'

const USERNAME_RE = /^[a-z0-9_]{3,20}$/

export default function SetUsernameScreen() {
  const { user, username: currentUsername, setUsername: storeUsername } = useAuthStore()
  const isFirstTime = !currentUsername
  const isDesktopWeb = useDesktopWebLayout()

  const [username, setUsernameLocal] = useState(currentUsername ?? '')
  const [checking, setChecking] = useState(false)
  const [available, setAvailable] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (currentUsername) {
      setUsernameLocal(currentUsername)
      setAvailable(true)
    }
  }, [currentUsername])

  async function onChangeText(value: string) {
    const lower = value.toLowerCase()
    setUsernameLocal(lower)
    setAvailable(null)
    setError(null)
    if (!USERNAME_RE.test(lower)) return
    if (lower === currentUsername) {
      setAvailable(true)
      return
    }
    setChecking(true)
    const taken = await isUsernameTaken(lower)
    setChecking(false)
    setAvailable(!taken)
  }

  async function handleClaim() {
    if (!USERNAME_RE.test(username) || !available || !user) return
    setLoading(true)
    setError(null)
    try {
      await claimUsername(user.uid, username)
      storeUsername(username)
      router.replace('/(tabs)/agents' as any)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const isValid = USERNAME_RE.test(username)
  const canSubmit = isValid && available === true && !loading

  const claimForm = (
    <View style={styles.form}>
      {isFirstTime && <Text style={styles.formLabel}>Pick your slug</Text>}

      <View style={styles.inputRow}>
        <Text style={styles.atSign}>@</Text>
        <TextInput
          style={styles.input}
          placeholder="your_slug"
          placeholderTextColor={Colors.textMuted}
          value={username}
          onChangeText={onChangeText}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus={!isDesktopWeb}
        />
        {checking && <ActivityIndicator size="small" color={Colors.textMuted} style={styles.indicator} />}
        {!checking && isValid && available === true && <Text style={styles.check}>✓</Text>}
        {!checking && isValid && available === false && <Text style={styles.cross}>✕</Text>}
      </View>

      <Text style={styles.hint}>3–20 characters · lowercase · letters, numbers, underscores</Text>

      {!isValid && username.length > 0 && (
        <Text style={styles.errorText}>Invalid format</Text>
      )}
      {isValid && available === false && (
        <Text style={styles.errorText}>@{username} is taken</Text>
      )}
      {error && <Text style={styles.errorText}>{error}</Text>}

      <TouchableOpacity
        style={[styles.claimBtn, !canSubmit && styles.claimBtnDisabled]}
        onPress={handleClaim}
        disabled={!canSubmit}
      >
        {loading
          ? <ActivityIndicator color={Colors.bgPrimary} />
          : <Text style={styles.claimBtnText}>
              {isFirstTime
                ? (username && isValid ? `Claim @${username}` : 'Claim your slug')
                : (username === currentUsername ? `Keep @${username || 'slug'}` : `Save @${username || 'slug'}`)
              }
            </Text>
        }
      </TouchableOpacity>

      {isFirstTime && (
        <Text style={styles.footnote}>You can change this later from your profile.</Text>
      )}
    </View>
  )

  // ── First-time: desktop web two-column layout ─────────────────────────────
  if (isFirstTime && isDesktopWeb) {
    return (
      <View style={styles.webShell}>
        <View style={styles.webInner}>
          {/* Left: hero panel */}
          <View style={styles.webPanel}>
            <View style={styles.webGlow} />
            <Text style={styles.webEyebrow}>SLUGS</Text>
            <Text style={styles.webPanelTitle}>Your slug is your identity in the agent network.</Text>
            <Text style={styles.webPanelBody}>
              Other users find you, follow your work, and track your agents' performance — all by slug. Your agents share your namespace.
            </Text>
            <View style={styles.webFactList}>
              {[
                { icon: '◈', text: 'Follow any agent by slug and watch it live' },
                { icon: '▸', text: 'Your agents share your namespace — @you/agent-name' },
                { icon: '⌖', text: 'Slugs are permanent identifiers — choose carefully' },
              ].map(({ icon, text }) => (
                <View key={text} style={styles.webFactRow}>
                  <Text style={styles.webFactIcon}>{icon}</Text>
                  <Text style={styles.webFactText}>{text}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Right: form card */}
          <View style={styles.webCard}>
            <Text style={styles.webCardTitle}>Claim your slug</Text>
            <Text style={styles.webCardSubtitle}>
              Pick a unique handle. You can change it later.
            </Text>
            {claimForm}
          </View>
        </View>
      </View>
    )
  }

  // ── First-time: mobile layout ─────────────────────────────────────────────
  if (isFirstTime) {
    return (
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.firstTimeScroll}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.hero}>
            <Text style={styles.heroIcon}>⊕</Text>
            <Text style={styles.heroTitle}>Claim your slug.</Text>
            <Text style={styles.heroBody}>
              Your slug is your identity in the agent network — a unique handle for you and your agents. Others use it to find you, follow your work, and track performance.
            </Text>
          </View>

          <View style={styles.card}>
            {[
              { icon: '◈', text: 'Follow any agent by slug and watch it live' },
              { icon: '▸', text: 'Your agents share your namespace — @you/agent-name' },
              { icon: '⌖', text: 'Slugs are permanent identifiers — choose carefully' },
            ].map(({ icon, text }) => (
              <View key={text} style={styles.cardRow}>
                <Text style={styles.cardIcon}>{icon}</Text>
                <Text style={styles.cardText}>{text}</Text>
              </View>
            ))}
          </View>

          {claimForm}
        </ScrollView>
      </KeyboardAvoidingView>
    )
  }

  // ── Edit mode: desktop web centered card ──────────────────────────────────
  if (isDesktopWeb) {
    return (
      <View style={styles.webShell}>
        <View style={styles.webEditCard}>
          <TouchableOpacity style={styles.backRow} onPress={() => router.back()}>
            <Text style={styles.backArrow}>‹</Text>
            <Text style={styles.backLabel}>Profile</Text>
          </TouchableOpacity>
          <Text style={styles.editTitle}>Edit your slug</Text>
          <Text style={styles.editSubtitle}>Update the handle people use to find you on SLUGS.</Text>
          {claimForm}
        </View>
      </View>
    )
  }

  // ── Edit mode: mobile ─────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <TouchableOpacity style={styles.backRow} onPress={() => router.back()}>
        <Text style={styles.backArrow}>‹</Text>
        <Text style={styles.backLabel}>Profile</Text>
      </TouchableOpacity>

      <View style={styles.inner}>
        <Text style={styles.editTitle}>Edit your slug</Text>
        <Text style={styles.editSubtitle}>Update the handle people use to find you on SLUGS.</Text>
        {claimForm}
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },

  // Mobile first-time
  firstTimeScroll: {
    flexGrow: 1,
    paddingTop: Platform.OS === 'ios' ? 72 : 40,
    paddingBottom: 48,
    paddingHorizontal: 28,
    gap: 32,
  },
  hero: { gap: 16 },
  heroIcon: { fontSize: 64, color: Colors.accentCrimson },
  heroTitle: {
    fontSize: 38,
    fontWeight: '800',
    color: Colors.textPrimary,
    letterSpacing: -0.5,
    lineHeight: 44,
  },
  heroBody: { fontSize: 16, color: Colors.textSecondary, lineHeight: 25 },
  card: {
    backgroundColor: Colors.bgSurface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.bgBorder,
    padding: 18,
    gap: 14,
  },
  cardRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  cardIcon: { fontSize: 16, color: Colors.accentCrimson, marginTop: 1, width: 18 },
  cardText: { flex: 1, fontSize: 14, color: Colors.textSecondary, lineHeight: 20 },

  // Mobile edit
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 24,
    gap: 4,
  },
  backArrow: { fontSize: 24, color: Colors.accentAmber, lineHeight: 28 },
  backLabel: { fontSize: 16, color: Colors.accentAmber },
  inner: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingBottom: 60,
  },
  editTitle: { fontSize: 28, fontWeight: '800', color: Colors.textPrimary, marginBottom: 10 },
  editSubtitle: { fontSize: 14, color: Colors.textSecondary, lineHeight: 22, marginBottom: 32 },

  // Shared form
  form: { gap: 0 },
  formLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bgElevated,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.bgBorder,
    marginBottom: 10,
  },
  atSign: {
    fontSize: 20,
    color: Colors.accentAmber,
    fontWeight: '700',
    paddingLeft: 16,
    paddingRight: 4,
  },
  input: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 18,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  indicator: { marginRight: 12 },
  check: { fontSize: 18, color: Colors.accentGreen, marginRight: 14, fontWeight: '700' },
  cross: { fontSize: 18, color: Colors.accentRed, marginRight: 14, fontWeight: '700' },
  hint: { fontSize: 12, color: Colors.textMuted, marginBottom: 8 },
  errorText: { fontSize: 13, color: Colors.accentRed, marginBottom: 8 },
  claimBtn: {
    backgroundColor: Colors.accentCrimson,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 16,
  },
  claimBtnDisabled: { opacity: 0.4 },
  claimBtnText: { color: Colors.bgPrimary, fontSize: 16, fontWeight: '600' },
  footnote: {
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 14,
  },

  // Desktop web shell
  webShell: {
    flex: 1,
    backgroundColor: Colors.bgPrimary,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 48,
  },
  webInner: {
    width: '100%',
    maxWidth: 1100,
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 28,
  },

  // Desktop hero panel
  webPanel: {
    flex: 1,
    backgroundColor: '#181715',
    borderRadius: 32,
    borderWidth: 1,
    borderColor: Colors.bgBorder,
    paddingHorizontal: 40,
    paddingVertical: 44,
    justifyContent: 'space-between',
    overflow: 'hidden',
    minHeight: 540,
  },
  webGlow: {
    position: 'absolute',
    top: -80,
    right: -40,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: 'rgba(255, 69, 58, 0.10)',
  },
  webEyebrow: {
    color: Colors.accentCrimson,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  webPanelTitle: {
    color: Colors.textPrimary,
    fontSize: 38,
    lineHeight: 46,
    fontWeight: '800',
    maxWidth: 420,
    marginTop: 20,
  },
  webPanelBody: {
    color: Colors.textSecondary,
    fontSize: 16,
    lineHeight: 26,
    maxWidth: 440,
    marginTop: 16,
  },
  webFactList: { gap: 16, marginTop: 36 },
  webFactRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  webFactIcon: { fontSize: 16, color: Colors.accentCrimson, marginTop: 1, width: 20 },
  webFactText: { flex: 1, fontSize: 14, color: Colors.textSecondary, lineHeight: 20 },

  // Desktop form card
  webCard: {
    width: 440,
    backgroundColor: '#181715',
    borderRadius: 32,
    borderWidth: 1,
    borderColor: Colors.bgBorder,
    paddingHorizontal: 36,
    paddingVertical: 40,
    alignSelf: 'center',
    gap: 8,
  },
  webCardTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.textPrimary,
    marginBottom: 6,
  },
  webCardSubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 22,
    marginBottom: 24,
  },

  // Desktop edit card
  webEditCard: {
    width: 480,
    backgroundColor: '#181715',
    borderRadius: 32,
    borderWidth: 1,
    borderColor: Colors.bgBorder,
    paddingHorizontal: 36,
    paddingVertical: 36,
    gap: 0,
  },
})
