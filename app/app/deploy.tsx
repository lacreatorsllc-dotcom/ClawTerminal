import { useState } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  TextInput, ActivityIndicator, Linking, SafeAreaView,
} from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useAuthStore } from '../stores/authStore'
import { createRangeFarmerAgent, createCabalAgent } from '../lib/firebase'
import { Colors } from '../constants/colors'

type Step = 'pick' | 'range-farmer' | 'cabal' | 'success'

interface DeployedAgent {
  id: string
  name: string
  type: 'range_farmer' | 'cabal_blue_chip'
}

export default function DeployScreen() {
  const { user } = useAuthStore()
  const [step, setStep] = useState<Step>('pick')
  const [name, setName] = useState('Range Farmer')
  const [cabalChatId, setCabalChatId] = useState('')
  const [deploying, setDeploying] = useState(false)
  const [deployed, setDeployed] = useState<DeployedAgent | null>(null)
  const [error, setError] = useState('')

  async function deployRangeFarmer() {
    if (!user) return
    setDeploying(true)
    setError('')
    try {
      const id = await createRangeFarmerAgent(user.uid, name.trim() || 'Range Farmer')
      setDeployed({ id, name: name.trim() || 'Range Farmer', type: 'range_farmer' })
      setStep('success')
    } catch (e: any) {
      setError(e.message ?? 'Deploy failed')
    }
    setDeploying(false)
  }

  async function connectCabal() {
    if (!user || !cabalChatId.trim()) return
    setDeploying(true)
    setError('')
    try {
      const id = await createCabalAgent(user.uid, cabalChatId.trim())
      setDeployed({ id, name: 'Blue Chip', type: 'cabal_blue_chip' })
      setStep('success')
    } catch (e: any) {
      setError(e.message ?? 'Connect failed')
    }
    setDeploying(false)
  }

  return (
    <SafeAreaView style={s.root}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => step === 'pick' ? router.back() : setStep('pick')} style={s.backBtn}>
          <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>
          {step === 'pick' ? 'Deploy an Agent' :
           step === 'range-farmer' ? 'Range Farmer' :
           step === 'cabal' ? 'Blue Chip' :
           'Agent Deployed'}
        </Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">

        {/* ── Step: Pick ── */}
        {step === 'pick' && (
          <>
            <Text style={s.subtitle}>Choose an agent type to deploy to your account.</Text>

            {/* Range Farmer card */}
            <TouchableOpacity style={s.typeCard} onPress={() => setStep('range-farmer')} activeOpacity={0.8}>
              <View style={[s.typeIcon, { backgroundColor: 'rgba(217,119,87,0.12)', borderColor: Colors.accentAmber }]}>
                <Text style={{ fontSize: 22 }}>⬡</Text>
              </View>
              <View style={s.typeInfo}>
                <View style={s.typeNameRow}>
                  <Text style={s.typeName}>Range Farmer</Text>
                  <View style={s.paperBadge}><Text style={s.paperBadgeText}>PAPER</Text></View>
                  <View style={s.hostedBadge}><Text style={s.hostedBadgeText}>HOSTED</Text></View>
                </View>
                <Text style={s.typeHandle}>@slugs/range-farmer</Text>
                <Text style={s.typeDesc}>BTC grid trading. We host and run it 24/7. Paper trading only — no real funds.</Text>
                <View style={s.typeTags}>
                  {['grid', 'btc', 'paper'].map(t => (
                    <View key={t} style={s.tag}><Text style={s.tagText}>{t}</Text></View>
                  ))}
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
            </TouchableOpacity>

            {/* Blue Chip card */}
            <TouchableOpacity style={s.typeCard} onPress={() => setStep('cabal')} activeOpacity={0.8}>
              <View style={[s.typeIcon, { backgroundColor: 'rgba(106,155,204,0.12)', borderColor: '#6a9bcc' }]}>
                <Text style={{ fontSize: 22 }}>◈</Text>
              </View>
              <View style={s.typeInfo}>
                <View style={s.typeNameRow}>
                  <Text style={s.typeName}>Blue Chip</Text>
                  <View style={[s.hostedBadge, { backgroundColor: 'rgba(106,155,204,0.15)', borderColor: '#6a9bcc' }]}>
                    <Text style={[s.hostedBadgeText, { color: '#6a9bcc' }]}>CABAL</Text>
                  </View>
                </View>
                <Text style={s.typeHandle}>@cabal/blue-chip</Text>
                <Text style={s.typeDesc}>Connect your existing cabal.ventures bot. Chat with it here instead of Telegram.</Text>
                <View style={s.typeTags}>
                  {['trading', 'cabal', 'telegram'].map(t => (
                    <View key={t} style={s.tag}><Text style={s.tagText}>{t}</Text></View>
                  ))}
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
            </TouchableOpacity>

            {/* Bring your own */}
            <TouchableOpacity style={s.byoRow} onPress={() => router.push('/connect' as any)}>
              <Text style={s.byoText}>Bring your own agent</Text>
              <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} />
            </TouchableOpacity>
          </>
        )}

        {/* ── Step: Range Farmer ── */}
        {step === 'range-farmer' && (
          <>
            <Text style={s.subtitle}>We'll spin up a dedicated instance for you. Paper trading only.</Text>

            <View style={s.infoBox}>
              <Text style={s.infoRow}>⬡  Dynamic grid strategy</Text>
              <Text style={s.infoRow}>📡  Live BTC price updates</Text>
              <Text style={s.infoRow}>💬  Chat with your agent</Text>
              <Text style={s.infoRow}>🔒  Paper trading — no real funds</Text>
            </View>

            <Text style={s.fieldLabel}>Agent Name</Text>
            <TextInput
              style={s.input}
              value={name}
              onChangeText={setName}
              placeholder="Range Farmer"
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="words"
            />

            {error ? <Text style={s.errorText}>{error}</Text> : null}

            <TouchableOpacity
              style={[s.cta, deploying && { opacity: 0.5 }]}
              onPress={deployRangeFarmer}
              disabled={deploying}
            >
              {deploying
                ? <ActivityIndicator color="#000" />
                : <Text style={s.ctaText}>Deploy Agent</Text>
              }
            </TouchableOpacity>
          </>
        )}

        {/* ── Step: Cabal ── */}
        {step === 'cabal' && (
          <>
            <Text style={s.subtitle}>Blue Chip is a trading bot by our partners at cabal.ventures. Connect yours or get started.</Text>

            {/* New to cabal */}
            <View style={s.cabalBanner}>
              <View style={{ flex: 1 }}>
                <Text style={s.cabalBannerTitle}>New to cabal.ventures?</Text>
                <Text style={s.cabalBannerDesc}>Get a Blue Chip trading bot and manage it right here in the app.</Text>
              </View>
              <TouchableOpacity style={s.cabalBannerBtn} onPress={() => Linking.openURL('https://cabal.ventures')}>
                <Text style={s.cabalBannerBtnText}>Get Started</Text>
                <Ionicons name="open-outline" size={12} color="#6a9bcc" />
              </TouchableOpacity>
            </View>

            <View style={s.dividerRow}>
              <View style={s.dividerLine} />
              <Text style={s.dividerText}>already have one?</Text>
              <View style={s.dividerLine} />
            </View>

            <View style={s.stepList}>
              <Text style={s.stepItem}>1. Open your Blue Chip bot on Telegram</Text>
              <Text style={s.stepItem}>2. Send <Text style={s.code}>/whoami</Text> to the bot</Text>
              <Text style={s.stepItem}>3. Copy your Chat ID and paste it below</Text>
            </View>

            <Text style={s.fieldLabel}>Chat ID</Text>
            <TextInput
              style={s.input}
              value={cabalChatId}
              onChangeText={setCabalChatId}
              placeholder="e.g. -1001234567890"
              placeholderTextColor={Colors.textMuted}
              keyboardType="numbers-and-punctuation"
              autoCapitalize="none"
            />

            <Text style={s.hintText}>Links your bot to this app. Chat here instead of Telegram — same bot, all your slash commands work.</Text>

            {error ? <Text style={s.errorText}>{error}</Text> : null}

            <TouchableOpacity
              style={[s.cta, (!cabalChatId.trim() || deploying) && { opacity: 0.5 }]}
              onPress={connectCabal}
              disabled={!cabalChatId.trim() || deploying}
            >
              {deploying
                ? <ActivityIndicator color="#000" />
                : <Text style={s.ctaText}>Connect Agent</Text>
              }
            </TouchableOpacity>
          </>
        )}

        {/* ── Step: Success ── */}
        {step === 'success' && deployed && (
          <View style={s.successBlock}>
            <View style={s.successIcon}>
              <Ionicons name="checkmark" size={32} color={Colors.accentGreen} />
            </View>
            <Text style={s.successTitle}>{deployed.name}</Text>
            <Text style={s.successDesc}>
              {deployed.type === 'range_farmer'
                ? 'Your Range Farmer agent is live. It\'s already trading BTC on a paper grid.'
                : 'Your Blue Chip bot is connected. Messages will sync between here and Telegram.'}
            </Text>
            <TouchableOpacity
              style={s.cta}
              onPress={() => {
                router.replace(`/agent/${deployed.id}` as any)
              }}
            >
              <Text style={s.ctaText}>Open Agent</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.secondaryBtn} onPress={() => router.back()}>
              <Text style={s.secondaryBtnText}>Back to Agents</Text>
            </TouchableOpacity>
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bgPrimary },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12,
  },
  backBtn: { width: 36, height: 36, justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '600', color: Colors.textPrimary },
  body: { padding: 20, gap: 16 },
  subtitle: { fontSize: 14, color: Colors.textSecondary, lineHeight: 20 },

  typeCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 14,
    backgroundColor: Colors.bgCard, borderRadius: 16,
    padding: 16, borderWidth: 1, borderColor: Colors.borderSubtle,
  },
  typeIcon: {
    width: 48, height: 48, borderRadius: 14, borderWidth: 1.5,
    justifyContent: 'center', alignItems: 'center',
  },
  typeInfo: { flex: 1, gap: 4 },
  typeNameRow: { flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap' },
  typeName: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  typeHandle: { fontSize: 12, color: Colors.textMuted, fontFamily: 'monospace' },
  typeDesc: { fontSize: 13, color: Colors.textSecondary, lineHeight: 18, marginTop: 2 },
  typeTags: { flexDirection: 'row', gap: 6, marginTop: 6 },
  tag: { backgroundColor: Colors.bgSubtle, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  tagText: { fontSize: 11, color: Colors.textMuted },

  paperBadge: {
    backgroundColor: 'rgba(217,119,87,0.15)', borderWidth: 1, borderColor: Colors.accentAmber,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5,
  },
  paperBadgeText: { fontSize: 10, fontWeight: '700', color: Colors.accentAmber },
  hostedBadge: {
    backgroundColor: 'rgba(52,211,153,0.12)', borderWidth: 1, borderColor: Colors.accentGreen,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5,
  },
  hostedBadgeText: { fontSize: 10, fontWeight: '700', color: Colors.accentGreen },

  byoRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, paddingVertical: 8,
  },
  byoText: { fontSize: 13, color: Colors.textMuted },

  infoBox: {
    backgroundColor: Colors.bgCard, borderRadius: 14, padding: 16, gap: 10,
    borderWidth: 1, borderColor: Colors.borderSubtle,
  },
  infoRow: { fontSize: 14, color: Colors.textSecondary },

  fieldLabel: { fontSize: 12, fontWeight: '600', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    backgroundColor: Colors.bgCard, borderRadius: 12, borderWidth: 1,
    borderColor: Colors.borderSubtle, padding: 14,
    fontSize: 15, color: Colors.textPrimary,
  },
  hintText: { fontSize: 12, color: Colors.textMuted, lineHeight: 17 },
  errorText: { fontSize: 13, color: Colors.accentRed },

  stepList: { gap: 10 },
  stepItem: { fontSize: 14, color: Colors.textSecondary, lineHeight: 20 },
  code: { fontFamily: 'monospace', color: Colors.accentAmber, fontSize: 13 },

  telegramBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: Colors.bgCard, borderRadius: 10, borderWidth: 1,
    borderColor: Colors.accentAmber, paddingHorizontal: 14, paddingVertical: 9,
  },
  telegramBtnText: { fontSize: 13, color: Colors.accentAmber, fontWeight: '600' },

  cta: {
    backgroundColor: Colors.accentAmber, borderRadius: 14,
    paddingVertical: 16, alignItems: 'center', marginTop: 8,
  },
  ctaText: { fontSize: 16, fontWeight: '700', color: '#000' },

  secondaryBtn: { alignItems: 'center', paddingVertical: 12 },
  secondaryBtnText: { fontSize: 14, color: Colors.textMuted },

  cabalBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: 'rgba(106,155,204,0.08)', borderRadius: 14,
    borderWidth: 1, borderColor: 'rgba(106,155,204,0.25)', padding: 16,
  },
  cabalBannerTitle: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary, marginBottom: 3 },
  cabalBannerDesc: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17 },
  cabalBannerBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(106,155,204,0.12)', borderRadius: 10,
    borderWidth: 1, borderColor: 'rgba(106,155,204,0.3)',
    paddingHorizontal: 12, paddingVertical: 8,
  },
  cabalBannerBtnText: { fontSize: 12, fontWeight: '700', color: '#6a9bcc' },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dividerLine: { flex: 1, height: 1, backgroundColor: Colors.borderSubtle },
  dividerText: { fontSize: 11, color: Colors.textMuted },

  successBlock: { alignItems: 'center', gap: 16, paddingTop: 32 },
  successIcon: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: 'rgba(52,211,153,0.12)', borderWidth: 1.5, borderColor: Colors.accentGreen,
    justifyContent: 'center', alignItems: 'center',
  },
  successTitle: { fontSize: 22, fontWeight: '700', color: Colors.textPrimary },
  successDesc: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20, paddingHorizontal: 8 },
})
