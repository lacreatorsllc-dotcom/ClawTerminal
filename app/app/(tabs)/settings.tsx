import { useEffect, useState } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet, Alert, Image,
  TextInput, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { auth, signOut, getProfile, setProfile, subscribeToUserAgents } from '../../lib/firebase'
import { useAuthStore } from '../../stores/authStore'
import { Colors } from '../../constants/colors'

type AIProvider = 'gemini' | 'openai' | null

function detectProvider(key: string): AIProvider {
  if (key.startsWith('AIza')) return 'gemini'
  if (key.startsWith('sk-')) return 'openai'
  return null
}

function BackMark() {
  return (
    <View style={s.backMark}>
      <View style={[s.backStroke, s.backStrokeTop]} />
      <View style={[s.backStroke, s.backStrokeBottom]} />
    </View>
  )
}

function SettingsIconText({ children, muted = false }: { children: string; muted?: boolean }) {
  return (
    <Text style={[s.iconText, muted && s.iconTextMuted]}>
      {children}
    </Text>
  )
}

export default function SettingsScreen() {
  const { user, username, displayName, avatarUrl, walletAddress, walletProvider, setLoading: setAuthLoading } = useAuthStore()
  const [aiKey, setAiKey] = useState('')
  const [savedKey, setSavedKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [ownedAgents, setOwnedAgents] = useState<any[]>([])
  const [walletPromptDismissed, setWalletPromptDismissed] = useState(false)

  useEffect(() => {
    if (!user) return
    getProfile(user.uid).then((p) => {
      const k = (p?.ai_api_key as string) ?? ''
      setSavedKey(k)
      setAiKey(k)
      setWalletPromptDismissed(Boolean(p?.wallet_funding_prompt_dismissed))
      setLoading(false)
    })
  }, [user?.uid])

  useEffect(() => {
    if (!user) return
    return subscribeToUserAgents(user.uid, setOwnedAgents)
  }, [user?.uid])

  const provider = detectProvider(aiKey)
  const savedProvider = detectProvider(savedKey)
  const isDirty = aiKey !== savedKey
  const fundedAgents = ownedAgents.filter((agent) => typeof agent.wallet_address === 'string' && agent.wallet_address.length > 0)
  const fundingPrompt = fundedAgents.length > 0
    ? `${fundedAgents.length} agent wallet${fundedAgents.length === 1 ? '' : 's'} ready to fund`
    : 'No agent wallets ready yet'

  async function handleDismissWalletPrompt() {
    if (!user) return
    setWalletPromptDismissed(true)
    await setProfile(user.uid, { wallet_funding_prompt_dismissed: true })
  }

  async function handleSave() {
    if (!user || !aiKey.trim()) return
    setSaving(true)
    try {
      await setProfile(user.uid, { ai_api_key: aiKey.trim() })
      setSavedKey(aiKey.trim())
      Alert.alert('Saved', 'AI key updated. All your agents will use it.')
    } catch {
      Alert.alert('Error', 'Failed to save. Try again.')
    }
    setSaving(false)
  }

  async function handleRemove() {
    if (!user) return
    Alert.alert('Remove AI Key', 'Your agents won\'t be able to respond to free-form messages without a key.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: async () => {
          await setProfile(user.uid, { ai_api_key: '' })
          setAiKey('')
          setSavedKey('')
        }
      },
    ])
  }

  async function handleSignOut() {
    setAuthLoading(true)
    await signOut(auth)
  }

  function confirmSignOut() {
    if (Platform.OS === 'web') {
      if (window.confirm('Sign out of SLUGS?')) handleSignOut()
    } else {
      Alert.alert('Sign Out', 'Are you sure?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign Out', style: 'destructive', onPress: handleSignOut },
      ])
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={s.container} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <View style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.8}>
            {Platform.OS === 'web' ? <BackMark /> : <Ionicons name="chevron-back" size={18} color={Colors.textPrimary} />}
          </TouchableOpacity>
          <Text style={s.title}>Settings</Text>
        </View>

        {/* Account */}
        <View style={s.section}>
          <Text style={s.sectionLabel}>ACCOUNT</Text>
          <TouchableOpacity style={[s.card, s.accountCard]} onPress={() => router.push('/account')} activeOpacity={0.85}>
            <View style={s.accountIdentity}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={s.accountAvatarImage} />
              ) : (
                <View style={s.accountAvatarFallback}>
                  <Text style={s.accountAvatarInitial}>
                    {(username ?? user?.email ?? '?').replace(/[^a-zA-Z0-9]/g, '').slice(0, 2).toUpperCase() || '?'}
                  </Text>
                </View>
              )}
              <View style={s.accountCopy}>
                <Text style={s.label}>{displayName || (username ? `@${username}` : user?.email ?? 'Your account')}</Text>
                <Text style={s.value}>{user?.email ?? '—'}</Text>
              </View>
            </View>
            <Text style={s.chevron}>›</Text>
          </TouchableOpacity>
        </View>

        <View style={s.section}>
          <Text style={s.sectionLabel}>WALLETS & FUNDING</Text>

          {!walletPromptDismissed ? (
            <View style={s.walletPromptCard}>
              <View style={s.walletPromptHeader}>
                <View style={s.walletPromptCopy}>
                  <Text style={s.walletPromptTitle}>
                    {walletAddress ? `${walletProvider ?? 'Wallet'} connected` : 'Connect a wallet or fund an agent'}
                  </Text>
                  <Text style={s.walletPromptBody}>
                    {walletAddress
                      ? 'Use your wallet for approvals, or fund an agent wallet for autonomous trading.'
                      : 'Connect Phantom or Backpack, or send crypto to an agent wallet for autonomous trading.'}
                  </Text>
                </View>
                <TouchableOpacity style={s.walletPromptClose} onPress={handleDismissWalletPrompt} activeOpacity={0.8}>
                  {Platform.OS === 'web'
                    ? <SettingsIconText muted>×</SettingsIconText>
                    : <Ionicons name="close" size={16} color={Colors.textMuted} />
                  }
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          <TouchableOpacity style={[s.card, s.walletActionCard]} onPress={() => router.push('/account')}>
            <View style={s.walletActionTextWrap}>
              <Text style={s.label}>Personal wallet</Text>
              <Text style={s.walletActionSubtext}>
                {walletAddress
                  ? `${walletProvider ?? 'Wallet'} connected · ${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}`
                  : 'Connect Phantom or Backpack'}
              </Text>
            </View>
            <Text style={s.chevron}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[s.card, s.walletActionCard, { marginTop: 8 }]} onPress={() => router.push('/agent-wallets' as any)}>
            <View style={s.walletActionTextWrap}>
              <Text style={s.label}>Agent wallets</Text>
              <Text style={s.walletActionSubtext}>
                {fundingPrompt}. View every agent wallet and copy the funding address.
              </Text>
            </View>
            <Text style={s.chevron}>›</Text>
          </TouchableOpacity>
        </View>

        {/* AI Keys */}
        <View style={s.section}>
          <Text style={s.sectionLabel}>AI PROVIDER</Text>

          {/* Status pill */}
          {savedKey ? (
            <View style={s.connectedBanner}>
              <View style={[s.providerDot, { backgroundColor: Colors.accentGreen }]} />
              <Text style={s.connectedText}>
                {savedProvider === 'gemini' ? 'Gemini 2.0 Flash connected' : savedProvider === 'openai' ? 'OpenAI GPT-4o connected' : 'AI key connected'}
              </Text>
              <TouchableOpacity onPress={handleRemove}>
                {Platform.OS === 'web'
                  ? <SettingsIconText muted>×</SettingsIconText>
                  : <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
                }
              </TouchableOpacity>
            </View>
          ) : (
            <View style={s.disconnectedBanner}>
              <View style={[s.providerDot, { backgroundColor: '#818cf8' }]} />
              <Text style={s.disconnectedText}>Managed Gemini Flash is active. Add your own key only if you want agents to use your account.</Text>
            </View>
          )}

          {/* Key input */}
          {loading ? (
            <ActivityIndicator color={Colors.textMuted} style={{ marginTop: 12 }} />
          ) : (
            <View style={s.inputBlock}>
              <View style={s.inputRow}>
                <TextInput
                  key={showKey ? 'key-show' : 'key-hide'}
                  style={s.input}
                  value={aiKey}
                  onChangeText={setAiKey}
                  placeholder="AIzaSy... or sk-..."
                  placeholderTextColor={Colors.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry={!showKey}
                />
                <TouchableOpacity style={s.eyeBtn} onPress={() => setShowKey(v => !v)}>
                  {Platform.OS === 'web'
                    ? <SettingsIconText muted>{showKey ? 'hide' : 'show'}</SettingsIconText>
                    : <Ionicons name={showKey ? 'eye-off' : 'eye'} size={18} color={Colors.textMuted} />
                  }
                </TouchableOpacity>
              </View>

              {/* Provider detection */}
              {aiKey.length > 4 && (
                <View style={s.providerRow}>
                  <View style={[s.providerPill, {
                    backgroundColor: provider === 'gemini' ? 'rgba(99,102,241,0.12)' :
                                     provider === 'openai' ? 'rgba(52,211,153,0.12)' :
                                     'rgba(255,255,255,0.05)',
                    borderColor: provider === 'gemini' ? '#818cf8' :
                                 provider === 'openai' ? Colors.accentGreen :
                                 Colors.bgBorder,
                  }]}>
                    <Text style={[s.providerPillText, {
                      color: provider === 'gemini' ? '#818cf8' :
                             provider === 'openai' ? Colors.accentGreen :
                             Colors.textMuted,
                    }]}>
                      {provider === 'gemini' ? '✦ Gemini 2.0 Flash' :
                       provider === 'openai' ? '◎ OpenAI GPT-4o' :
                       '? Unknown format'}
                    </Text>
                  </View>
                </View>
              )}

              <Text style={s.hint}>
                New users use SLUGS managed Gemini Flash without seeing the private platform key.{'\n'}
                Add your own key to override it for all your agents.{'\n'}
                Gemini: <Text style={{ color: Colors.accentAmber }}>aistudio.google.com</Text>{'\n'}
                OpenAI: <Text style={{ color: Colors.accentAmber }}>platform.openai.com</Text>
              </Text>

              {isDirty && (
                <TouchableOpacity
                  style={[s.saveBtn, (!aiKey.trim() || saving) && { opacity: 0.5 }]}
                  onPress={handleSave}
                  disabled={!aiKey.trim() || saving}
                >
                  {saving
                    ? <ActivityIndicator color="#000" size="small" />
                    : <Text style={s.saveBtnText}>Save Key</Text>
                  }
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        {/* Agent */}
        <View style={s.section}>
          <Text style={s.sectionLabel}>AGENTS</Text>
          <TouchableOpacity style={s.card} onPress={() => router.push('/connect')}>
            <Text style={s.label}>Connect a new agent</Text>
            <Text style={s.chevron}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.card, { marginTop: 8 }]} onPress={() => router.push('/deploy' as any)}>
            <Text style={s.label}>Deploy an agent</Text>
            <Text style={s.chevron}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Sign out */}
        <View style={s.section}>
          <TouchableOpacity style={s.destructiveBtn} onPress={confirmSignOut}>
            <Text style={s.destructiveBtnText}>Sign Out</Text>
          </TouchableOpacity>
        </View>

        <Text style={s.version}>SLUGS v1.0.0</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },
  content: { paddingBottom: 60 },
  header: { paddingHorizontal: 24, paddingTop: 60, paddingBottom: 24, flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.bgElevated,
    borderWidth: 1,
    borderColor: Colors.bgBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backMark: { width: 10, height: 14, alignItems: 'center', justifyContent: 'center' },
  backStroke: {
    position: 'absolute',
    width: 8,
    height: 1.8,
    borderRadius: 2,
    backgroundColor: Colors.textPrimary,
    left: 1,
  },
  backStrokeTop: { top: 4, transform: [{ rotate: '-45deg' }] },
  backStrokeBottom: { bottom: 4, transform: [{ rotate: '45deg' }] },
  iconText: {
    color: Colors.textPrimary,
    fontSize: 15,
    lineHeight: 18,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  iconTextMuted: {
    color: Colors.textMuted,
    fontSize: 12,
    letterSpacing: 0.2,
  },
  title: { fontSize: 28, fontWeight: '700', color: Colors.textPrimary },

  section: { marginBottom: 24, paddingHorizontal: 16 },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: Colors.textMuted,
    letterSpacing: 1.2, marginBottom: 10, paddingHorizontal: 4,
    textTransform: 'uppercase',
  },

  card: {
    backgroundColor: '#0f0f0f', borderRadius: 16, padding: 16,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  accountCard: { alignItems: 'center' },
  accountIdentity: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12 },
  accountCopy: { flex: 1, gap: 4 },
  accountAvatarImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: Colors.accentAmber,
  },
  accountAvatarFallback: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: Colors.accentAmber,
    backgroundColor: Colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountAvatarInitial: { fontSize: 15, fontWeight: '700', color: Colors.accentAmber, letterSpacing: 0.5 },
  walletPromptCard: {
    backgroundColor: 'rgba(217,119,87,0.08)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(217,119,87,0.18)',
    padding: 16,
    marginBottom: 10,
  },
  walletPromptHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  walletPromptCopy: { gap: 6 },
  walletPromptTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  walletPromptBody: { fontSize: 13, lineHeight: 19, color: Colors.textSecondary },
  walletPromptClose: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  walletActionCard: { alignItems: 'flex-start' },
  walletActionTextWrap: { flex: 1, gap: 4, paddingRight: 12 },
  walletActionSubtext: { fontSize: 12, lineHeight: 18, color: Colors.textMuted },
  label: { fontSize: 15, color: Colors.textPrimary },
  value: { fontSize: 14, color: Colors.textSecondary },
  chevron: { fontSize: 20, color: Colors.textSecondary },

  connectedBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(52,211,153,0.08)', borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(52,211,153,0.2)',
    padding: 12, marginBottom: 12,
  },
  connectedText: { flex: 1, fontSize: 13, fontWeight: '600', color: Colors.accentGreen },
  disconnectedBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12,
    borderWidth: 1, borderColor: Colors.bgBorder,
    padding: 12, marginBottom: 12,
  },
  disconnectedText: { flex: 1, fontSize: 13, color: Colors.textMuted },
  providerDot: { width: 7, height: 7, borderRadius: 4 },

  inputBlock: { gap: 10 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#0f0f0f', borderRadius: 12,
    borderWidth: 1, borderColor: Colors.bgBorder,
  },
  input: {
    flex: 1, padding: 14, fontSize: 14,
    color: Colors.textPrimary, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  eyeBtn: { paddingHorizontal: 14 },

  providerRow: { flexDirection: 'row' },
  providerPill: {
    borderRadius: 8, borderWidth: 1,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  providerPillText: { fontSize: 12, fontWeight: '700' },

  hint: { fontSize: 12, color: Colors.textMuted, lineHeight: 18 },

  saveBtn: {
    backgroundColor: Colors.accentAmber, borderRadius: 12,
    paddingVertical: 14, alignItems: 'center',
  },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: '#000' },

  destructiveBtn: {
    backgroundColor: 'rgba(255,69,58,0.08)', borderRadius: 16,
    padding: 16, alignItems: 'center',
  },
  destructiveBtnText: { color: Colors.accentRed, fontSize: 15, fontWeight: '600' },
  version: { textAlign: 'center', color: Colors.textMuted, fontSize: 12, paddingBottom: 32, marginTop: 8 },
})
