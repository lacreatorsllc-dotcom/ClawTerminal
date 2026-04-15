import { useEffect, useState } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet, Alert,
  TextInput, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { auth, signOut, getProfile, setProfile } from '../../lib/firebase'
import { useAuthStore } from '../../stores/authStore'
import { Colors } from '../../constants/colors'

type AIProvider = 'gemini' | 'openai' | null

function detectProvider(key: string): AIProvider {
  if (key.startsWith('AIza')) return 'gemini'
  if (key.startsWith('sk-')) return 'openai'
  return null
}

export default function SettingsScreen() {
  const { user } = useAuthStore()
  const [aiKey, setAiKey] = useState('')
  const [savedKey, setSavedKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    getProfile(user.uid).then((p) => {
      const k = (p?.ai_api_key as string) ?? ''
      setSavedKey(k)
      setAiKey(k)
      setLoading(false)
    })
  }, [user?.uid])

  const provider = detectProvider(aiKey)
  const savedProvider = detectProvider(savedKey)
  const isDirty = aiKey !== savedKey

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
    await signOut(auth)
    router.replace('/auth')
  }

  function confirmSignOut() {
    Alert.alert('Sign Out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: handleSignOut },
    ])
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={s.container} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <View style={s.header}>
          <Text style={s.title}>Settings</Text>
        </View>

        {/* Account */}
        <View style={s.section}>
          <Text style={s.sectionLabel}>ACCOUNT</Text>
          <View style={s.card}>
            <Text style={s.label}>Email</Text>
            <Text style={s.value}>{user?.email ?? '—'}</Text>
          </View>
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
                <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>
          ) : (
            <View style={s.disconnectedBanner}>
              <View style={[s.providerDot, { backgroundColor: Colors.textMuted }]} />
              <Text style={s.disconnectedText}>No AI key — agents can't respond to free-form chat</Text>
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
                  <Ionicons name={showKey ? 'eye-off' : 'eye'} size={18} color={Colors.textMuted} />
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
                Used for all agent chat — Trading Boy, Market Advisor, Range Farmer.{'\n'}
                Gemini: <Text style={{ color: Colors.accentAmber }}>aistudio.google.com</Text> (free){'\n'}
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
  header: { paddingHorizontal: 24, paddingTop: 60, paddingBottom: 24 },
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
