import { useState } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  TextInput, ActivityIndicator, Platform,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useAuthStore } from '../stores/authStore'
import { createRangeFarmerAgent, createMarketAdvisorAgent } from '../lib/firebase'
import { Colors } from '../constants/colors'

const TB_BRIDGE_URL = 'https://tb-bridge-1094657124615.us-central1.run.app'

type Step = 'pick' | 'trading-boy' | 'range-farmer' | 'market-advisor' | 'success'

interface DeployedAgent {
  id: string
  name: string
  type: 'range_farmer' | 'cabal_trading_boy' | 'market_advisor'
}

export default function DeployScreen() {
  const { user } = useAuthStore()
  const [step, setStep] = useState<Step>('pick')
  const [name, setName] = useState('')
  const [tbApiKey, setTbApiKey] = useState('')
  const [aiKey, setAiKey] = useState('')
  const [selectedCoin, setSelectedCoin] = useState('BTC')
  const [deploying, setDeploying] = useState(false)
  const [deployed, setDeployed] = useState<DeployedAgent | null>(null)
  const [error, setError] = useState('')

  function goBack() {
    if (step === 'pick') router.back()
    else { setStep('pick'); setError('') }
  }

  async function deployRangeFarmer() {
    if (!user) return
    setDeploying(true); setError('')
    try {
      const agentName = name.trim() || `${selectedCoin} Range Farmer`
      const id = await createRangeFarmerAgent(user.uid, agentName, selectedCoin)
      setDeployed({ id, name: agentName, type: 'range_farmer' })
      setStep('success')
    } catch (e: any) { setError(e.message ?? 'Deploy failed') }
    setDeploying(false)
  }

  async function connectTradingBoy() {
    if (!user || !tbApiKey.trim()) return
    setDeploying(true); setError('')
    try {
      const res = await fetch(`${TB_BRIDGE_URL}/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.uid,
          apiKey: tbApiKey.trim(),
          openaiKey: aiKey.trim() || undefined,
        }),
      })
      const data = await res.json() as any
      if (!res.ok) throw new Error(data.error ?? 'Connect failed')
      const agents: { id: string; name: string }[] = data.agents ?? []
      if (agents.length === 0) throw new Error('No agents found for this API key')
      setDeployed({ id: agents[0].id, name: agents.map(a => a.name).join(', '), type: 'cabal_trading_boy' })
      setStep('success')
    } catch (e: any) { setError(e.message ?? 'Connect failed') }
    setDeploying(false)
  }

  async function deployMarketAdvisor() {
    if (!user || !aiKey.trim()) return
    setDeploying(true); setError('')
    try {
      const agentName = name.trim() || 'Market Advisor'
      const id = await createMarketAdvisorAgent(user.uid, agentName, aiKey.trim())
      setDeployed({ id, name: agentName, type: 'market_advisor' })
      setStep('success')
    } catch (e: any) { setError(e.message ?? 'Deploy failed') }
    setDeploying(false)
  }

  const headerTitle =
    step === 'pick' ? 'Deploy an Agent' :
    step === 'trading-boy' ? 'Trading Boy' :
    step === 'range-farmer' ? 'Range Farmer' :
    step === 'market-advisor' ? 'Market Advisor' :
    'Agent Deployed'

  return (
    <SafeAreaView style={s.root}>
      <View style={s.header}>
        <TouchableOpacity onPress={goBack} style={s.backBtn}>
          <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>{headerTitle}</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">

        {/* ── Pick ── */}
        {step === 'pick' && (
          <>
            <Text style={s.subtitle}>Choose an agent type to deploy to your account.</Text>

            {/* Trading Boy — top */}
            <TouchableOpacity style={s.typeCard} onPress={() => setStep('trading-boy')} activeOpacity={0.8}>
              <View style={[s.typeIcon, { backgroundColor: 'rgba(168,85,247,0.12)', borderColor: Colors.accentPurple }]}>
                <Text style={{ fontSize: 22 }}>◎</Text>
              </View>
              <View style={s.typeInfo}>
                <View style={s.typeNameRow}>
                  <Text style={s.typeName}>Trading Boy</Text>
                  <View style={[s.badge, { backgroundColor: 'rgba(168,85,247,0.12)', borderColor: Colors.accentPurple }]}>
                    <Text style={[s.badgeText, { color: Colors.accentPurple }]}>CABAL</Text>
                  </View>
                </View>
                <Text style={s.typeHandle}>@cabal/trading-boy</Text>
                <Text style={s.typeDesc}>Connect your Trading Boy agent from cabal.ventures. Live state, decisions feed, and AI chat powered by Gemini.</Text>
                <View style={s.typeTags}>
                  {['trading', 'cabal', 'autonomous', 'gemini'].map(t => (
                    <View key={t} style={s.tag}><Text style={s.tagText}>{t}</Text></View>
                  ))}
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
            </TouchableOpacity>

            {/* Range Farmer */}
            <TouchableOpacity style={s.typeCard} onPress={() => setStep('range-farmer')} activeOpacity={0.8}>
              <View style={[s.typeIcon, { backgroundColor: 'rgba(217,119,87,0.12)', borderColor: Colors.accentAmber }]}>
                <Text style={{ fontSize: 22 }}>⬡</Text>
              </View>
              <View style={s.typeInfo}>
                <View style={s.typeNameRow}>
                  <Text style={s.typeName}>Range Farmer</Text>
                  <View style={[s.badge, { backgroundColor: 'rgba(217,119,87,0.15)', borderColor: Colors.accentAmber }]}>
                    <Text style={[s.badgeText, { color: Colors.accentAmber }]}>PAPER</Text>
                  </View>
                  <View style={[s.badge, { backgroundColor: 'rgba(52,211,153,0.12)', borderColor: Colors.accentGreen }]}>
                    <Text style={[s.badgeText, { color: Colors.accentGreen }]}>HOSTED</Text>
                  </View>
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

            {/* Market Advisor */}
            <TouchableOpacity style={s.typeCard} onPress={() => setStep('market-advisor')} activeOpacity={0.8}>
              <View style={[s.typeIcon, { backgroundColor: 'rgba(99,102,241,0.12)', borderColor: '#818cf8' }]}>
                <Text style={{ fontSize: 22 }}>✦</Text>
              </View>
              <View style={s.typeInfo}>
                <View style={s.typeNameRow}>
                  <Text style={s.typeName}>Market Advisor</Text>
                  <View style={[s.badge, { backgroundColor: 'rgba(99,102,241,0.12)', borderColor: '#818cf8' }]}>
                    <Text style={[s.badgeText, { color: '#818cf8' }]}>GEMINI</Text>
                  </View>
                </View>
                <Text style={s.typeHandle}>@slugs/market-advisor</Text>
                <Text style={s.typeDesc}>A fresh AI agent that reads all your agents' trades and decisions. Ask it anything — it'll guide you on what to do next.</Text>
                <View style={s.typeTags}>
                  {['advisory', 'gemini', 'portfolio', 'ai'].map(t => (
                    <View key={t} style={s.tag}><Text style={s.tagText}>{t}</Text></View>
                  ))}
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity style={s.byoRow} onPress={() => router.push('/connect' as any)}>
              <Text style={s.byoText}>Bring your own agent</Text>
              <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} />
            </TouchableOpacity>
          </>
        )}

        {/* ── Trading Boy ── */}
        {step === 'trading-boy' && (
          <>
            <Text style={s.subtitle}>Connect your Trading Boy agent from cabal.ventures using your API key.</Text>

            <View style={s.infoBox}>
              <Text style={s.infoRow}>◎  Fully autonomous trading agent</Text>
              <Text style={s.infoRow}>📊  Live state + decisions feed</Text>
              <Text style={s.infoRow}>🧠  Gemini reads all your agent history</Text>
              <Text style={s.infoRow}>⏸  Pause / resume from the app</Text>
            </View>

            <Text style={s.fieldLabel}>Cabal API Key</Text>
            <TextInput
              style={s.input}
              value={tbApiKey}
              onChangeText={setTbApiKey}
              placeholder="tb_live_..."
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={s.hintText}>Starts with tb_live_. Find it in your cabal.ventures dashboard.</Text>

            <Text style={[s.fieldLabel, { marginTop: 20 }]}>Gemini API Key</Text>
            <TextInput
              style={s.input}
              value={aiKey}
              onChangeText={setAiKey}
              placeholder="AIzaSy..."
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
            />
            <Text style={s.hintText}>
              Gemini powers your agent's chat and reads all your portfolio history. Get a free key at{' '}
              <Text style={{ color: Colors.accentAmber }}>aistudio.google.com</Text>
            </Text>

            {error ? <Text style={s.errorText}>{error}</Text> : null}

            <TouchableOpacity
              style={[s.cta, (!tbApiKey.trim() || deploying) && { opacity: 0.5 }]}
              onPress={connectTradingBoy}
              disabled={!tbApiKey.trim() || deploying}
            >
              {deploying ? <ActivityIndicator color="#000" /> : <Text style={s.ctaText}>Connect Agent</Text>}
            </TouchableOpacity>
          </>
        )}

        {/* ── Range Farmer ── */}
        {step === 'range-farmer' && (
          <>
            <Text style={s.subtitle}>We'll spin up a dedicated instance for you. Paper trading only.</Text>

            <View style={s.infoBox}>
              <Text style={s.infoRow}>⬡  Dynamic grid range strategy</Text>
              <Text style={s.infoRow}>📡  Live price updates every 30s</Text>
              <Text style={s.infoRow}>💬  Chat powered by your AI key</Text>
              <Text style={s.infoRow}>🔒  Paper trading — no real funds</Text>
            </View>

            {/* Coin selector */}
            <Text style={s.fieldLabel}>Coin to Farm</Text>
            <View style={s.coinGrid}>
              {['BTC', 'SOL', 'ETH', 'XRP', 'DOGE', 'AVAX', 'SUI', 'INJ'].map((coin) => (
                <TouchableOpacity
                  key={coin}
                  style={[s.coinBtn, selectedCoin === coin && s.coinBtnActive]}
                  onPress={() => setSelectedCoin(coin)}
                  activeOpacity={0.7}
                >
                  <Text style={[s.coinBtnText, selectedCoin === coin && s.coinBtnTextActive]}>{coin}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.fieldLabel}>Agent Name</Text>
            <TextInput
              style={s.input}
              value={name}
              onChangeText={setName}
              placeholder={`${selectedCoin} Range Farmer`}
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="words"
            />

            {error ? <Text style={s.errorText}>{error}</Text> : null}

            <TouchableOpacity
              style={[s.cta, deploying && { opacity: 0.5 }]}
              onPress={deployRangeFarmer}
              disabled={deploying}
            >
              {deploying ? <ActivityIndicator color="#000" /> : <Text style={s.ctaText}>Deploy {selectedCoin} Farmer</Text>}
            </TouchableOpacity>
          </>
        )}

        {/* ── Market Advisor ── */}
        {step === 'market-advisor' && (
          <>
            <Text style={s.subtitle}>A dedicated AI agent that reads your full portfolio and guides you on what to do next.</Text>

            <View style={s.infoBox}>
              <Text style={s.infoRow}>✦  Reads all your agents' trades &amp; decisions</Text>
              <Text style={s.infoRow}>📈  Knows current BTC price &amp; market regime</Text>
              <Text style={s.infoRow}>💬  Ask it anything — it guides, you act</Text>
              <Text style={s.infoRow}>🧠  Gemini 2.0 Flash — fast &amp; free</Text>
            </View>

            <Text style={s.fieldLabel}>Agent Name</Text>
            <TextInput
              style={s.input}
              value={name}
              onChangeText={setName}
              placeholder="Market Advisor"
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="words"
            />

            <Text style={[s.fieldLabel, { marginTop: 20 }]}>Gemini API Key</Text>
            <TextInput
              style={s.input}
              value={aiKey}
              onChangeText={setAiKey}
              placeholder="AIzaSy..."
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
            />
            <Text style={s.hintText}>
              Free at <Text style={{ color: Colors.accentAmber }}>aistudio.google.com</Text> — no credit card needed.
            </Text>

            {error ? <Text style={s.errorText}>{error}</Text> : null}

            <TouchableOpacity
              style={[s.cta, (!aiKey.trim() || deploying) && { opacity: 0.5 }]}
              onPress={deployMarketAdvisor}
              disabled={!aiKey.trim() || deploying}
            >
              {deploying ? <ActivityIndicator color="#000" /> : <Text style={s.ctaText}>Deploy Advisor</Text>}
            </TouchableOpacity>
          </>
        )}

        {/* ── Success ── */}
        {step === 'success' && deployed && (
          <View style={s.successBlock}>
            <View style={s.successIcon}>
              <Ionicons name="checkmark" size={32} color={Colors.accentGreen} />
            </View>
            <Text style={s.successTitle}>{deployed.name}</Text>
            <Text style={s.successDesc}>
              {deployed.type === 'range_farmer'
                ? "Your Range Farmer is live and already trading BTC on a paper grid."
                : deployed.type === 'cabal_trading_boy'
                ? `${deployed.name} connected. Live state, decisions, and Gemini chat are syncing.`
                : `${deployed.name} is ready. It's reading your portfolio now — just start chatting.`}
            </Text>
            <TouchableOpacity
              style={s.cta}
              onPress={() => {
                deployed.type === 'cabal_trading_boy'
                  ? router.replace('/(tabs)/agents' as any)
                  : router.replace(`/agent/${deployed.id}` as any)
              }}
            >
              <Text style={s.ctaText}>{deployed.type === 'cabal_trading_boy' ? 'View Agents' : 'Open Agent'}</Text>
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
  typeTags: { flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' },
  tag: { backgroundColor: Colors.bgSubtle, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  tagText: { fontSize: 11, color: Colors.textMuted },

  badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, borderWidth: 1 },
  badgeText: { fontSize: 10, fontWeight: '700' },

  coinGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  coinBtn: {
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10,
    backgroundColor: Colors.bgSubtle, borderWidth: 1, borderColor: Colors.borderSubtle,
  },
  coinBtnActive: {
    backgroundColor: 'rgba(217,119,87,0.15)', borderColor: Colors.accentAmber,
  },
  coinBtnText: { fontSize: 13, fontWeight: '700', color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  coinBtnTextActive: { color: Colors.accentAmber },

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

  cta: {
    backgroundColor: Colors.accentAmber, borderRadius: 14,
    paddingVertical: 16, alignItems: 'center', marginTop: 8,
  },
  ctaText: { fontSize: 16, fontWeight: '700', color: '#000' },
  secondaryBtn: { alignItems: 'center', paddingVertical: 12 },
  secondaryBtnText: { fontSize: 14, color: Colors.textMuted },

  successBlock: { alignItems: 'center', gap: 16, paddingTop: 32 },
  successIcon: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: 'rgba(52,211,153,0.12)', borderWidth: 1.5, borderColor: Colors.accentGreen,
    justifyContent: 'center', alignItems: 'center',
  },
  successTitle: { fontSize: 22, fontWeight: '700', color: Colors.textPrimary },
  successDesc: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20, paddingHorizontal: 8 },
})
