import { useState } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  TextInput, ActivityIndicator, Platform,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useAuthStore } from '../stores/authStore'
import { createClaudeAgent } from '../lib/firebase'
import { Colors } from '../constants/colors'

const TB_BRIDGE_URL = 'https://tb-bridge-1094657124615.us-central1.run.app'

type Step = 'pick' | 'trading-boy' | 'claude-agent' | 'success'

const CLAUDE_STRATEGIES = ['Grid Trader', 'Momentum', 'DCA', 'Breakout', 'Custom'] as const
type ClaudeStrategy = typeof CLAUDE_STRATEGIES[number]

const STRATEGY_DESCRIPTIONS: Record<ClaudeStrategy, string> = {
  'Grid Trader': 'Places buy and sell orders at regular price intervals, profiting from range-bound volatility without predicting direction.',
  'Momentum':    'Follows trending price action — enters when strength is confirmed and exits when reversal signals appear.',
  'DCA':         'Dollar-cost averages into positions at set intervals, reducing exposure to short-term volatility over time.',
  'Breakout':    'Enters on confirmed breaks above resistance or below support, targeting the continuation move.',
  'Custom':      'Describe your own strategy in plain language — Claude will interpret and execute it.',
}

const CLAUDE_SKILLS = [
  { id: 'technical_analysis', label: 'Technical Analysis', emoji: '📊' },
  { id: 'news_sentiment',     label: 'News Sentiment',     emoji: '📰' },
  { id: 'risk_manager',       label: 'Risk Manager',       emoji: '🛡'  },
  { id: 'onchain_data',       label: 'Onchain Data',       emoji: '⛓'  },
  { id: 'macro_regime',       label: 'Macro Regime',       emoji: '🌍' },
] as const

const SKILL_DESCRIPTIONS: Record<string, string> = {
  technical_analysis: 'Reads price action, RSI, MACD, and volume patterns to time entries and exits more precisely.',
  news_sentiment:     'Monitors crypto news in real time and posts updates to your feed whenever a story breaks that affects your markets. This agent posts news — not trades.',
  risk_manager:       'Watches position sizes, drawdown limits, and exposure across your portfolio. Pauses the agent if risk thresholds are hit.',
  onchain_data:       'Tracks wallet flows, exchange inflows/outflows, and on-chain activity to spot accumulation or distribution pressure.',
  macro_regime:       'Detects broader market conditions — risk-on vs. risk-off — and adjusts strategy aggression based on macro signals.',
}

interface DeployedAgent {
  id: string
  name: string
  type: 'cabal_trading_boy' | 'claude_managed'
  strategy?: string
  skills?: string[]
}

function BackMark() {
  return (
    <View style={s.backMark}>
      <View style={[s.backStroke, s.backStrokeTop]} />
      <View style={[s.backStroke, s.backStrokeBottom]} />
    </View>
  )
}

function ChevronMark() {
  return (
    <View style={s.chevronMark}>
      <View style={[s.chevronStroke, s.chevronStrokeTop]} />
      <View style={[s.chevronStroke, s.chevronStrokeBottom]} />
    </View>
  )
}

function CheckMark() {
  return (
    <View style={s.checkMark}>
      <View style={[s.checkStroke, s.checkStrokeShort]} />
      <View style={[s.checkStroke, s.checkStrokeLong]} />
    </View>
  )
}

export default function DeployScreen() {
  const { user } = useAuthStore()
  const [step, setStep] = useState<Step>('pick')
  const [name, setName] = useState('')
  const [tbApiKey, setTbApiKey] = useState('')
  const [showTbKey, setShowTbKey] = useState(false)
  const [deploying, setDeploying] = useState(false)
  const [deployed, setDeployed] = useState<DeployedAgent | null>(null)
  const [error, setError] = useState('')
  const [claudeStrategy, setClaudeStrategy] = useState<ClaudeStrategy>('Grid Trader')
  const [claudeSkills, setClaudeSkills] = useState<Set<string>>(new Set(['technical_analysis', 'risk_manager']))
  const [customDesc, setCustomDesc] = useState('')
  const [customHint, setCustomHint] = useState<string | null>(null)
  const [validating, setValidating] = useState(false)
  const [focusedSkill, setFocusedSkill] = useState<string | null>(null)

  function goBack() {
    if (step === 'pick') router.back()
    else { setStep('pick'); setError('') }
  }

  async function connectTradingBoy() {
    if (!user || !tbApiKey.trim()) return
    setDeploying(true); setError('')
    try {
      const res = await fetch(`${TB_BRIDGE_URL}/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.uid, apiKey: tbApiKey.trim() }),
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

  async function deployClaudeAgent() {
    if (!user) return
    setDeploying(true); setError('')
    try {
      const agentName = name.trim() || `${claudeStrategy} Agent`
      const res = await fetch(`${TB_BRIDGE_URL}/claude-agents/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.uid,
          name: agentName,
          strategy: claudeStrategy,
          customDescription: claudeStrategy === 'Custom' ? customDesc.trim() : undefined,
          skills: Array.from(claudeSkills),
        }),
      })
      const data = await res.json() as any
      if (!res.ok) throw new Error(data.error ?? 'Deploy failed')
      const id = await createClaudeAgent(user.uid, agentName, data.claudeAgentId, data.claudeEnvId, claudeStrategy)
      setDeployed({ id, name: agentName, type: 'claude_managed', strategy: claudeStrategy, skills: Array.from(claudeSkills) })
      setStep('success')
    } catch (e: any) { setError(e.message ?? 'Deploy failed') }
    setDeploying(false)
  }

  function toggleSkill(id: string) {
    setClaudeSkills(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function validateCustomStrategy(desc: string) {
    if (!desc.trim() || desc.trim().length < 10) return
    setValidating(true)
    setCustomHint(null)
    try {
      const res = await fetch(`${TB_BRIDGE_URL}/validate-strategy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: desc.trim() }),
      })
      const data = await res.json() as any
      if (data.hint) setCustomHint(data.hint)
      else if (data.valid === false) setCustomHint(`This might not work as described. ${data.reason ?? ''}`)
    } catch {
      // network error — silently skip validation
    }
    setValidating(false)
  }

  const headerTitle =
    step === 'pick' ? 'Deploy an Agent' :
    step === 'trading-boy' ? 'Trading Boy' :
    step === 'claude-agent' ? 'Claude Agent' :
    'Agent Deployed'

  return (
    <SafeAreaView style={s.root}>
      <View style={s.header}>
        <TouchableOpacity onPress={goBack} style={s.backBtn}>
          {Platform.OS === 'web' ? <BackMark /> : <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} />}
        </TouchableOpacity>
        <Text style={s.headerTitle}>{headerTitle}</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">

        {/* ── Pick ── */}
        {step === 'pick' && (
          <>
            <Text style={s.subtitle}>Choose an agent to deploy.</Text>

            {/* Claude Agent — primary */}
            <TouchableOpacity style={[s.typeCard, s.typeCardFeatured]} onPress={() => setStep('claude-agent')} activeOpacity={0.8}>
              <View style={[s.typeIcon, { backgroundColor: 'rgba(251,146,60,0.12)', borderColor: '#fb923c' }]}>
                <Text style={{ fontSize: 22 }}>✦</Text>
              </View>
              <View style={s.typeInfo}>
                <View style={s.typeNameRow}>
                  <Text style={s.typeName}>Claude Agent</Text>
                  <View style={[s.badge, { backgroundColor: 'rgba(251,146,60,0.12)', borderColor: '#fb923c' }]}>
                    <Text style={[s.badgeText, { color: '#fb923c' }]}>CLAUDE</Text>
                  </View>
                  <View style={[s.badge, { backgroundColor: 'rgba(52,211,153,0.12)', borderColor: Colors.accentGreen }]}>
                    <Text style={[s.badgeText, { color: Colors.accentGreen }]}>HOSTED</Text>
                  </View>
                </View>
                <Text style={s.typeHandle}>@claude/trading-agent</Text>
                <Text style={s.typeDesc}>Powered by Claude. Hosted 24/7 with persistent memory, skill acquisition, and full tool access. Pick your strategy and go.</Text>
                <View style={s.typeTags}>
                  {['claude', 'memory', 'skills', 'hosted', 'paper'].map(t => (
                    <View key={t} style={s.tag}><Text style={s.tagText}>{t}</Text></View>
                  ))}
                </View>
              </View>
              {Platform.OS === 'web' ? <ChevronMark /> : <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />}
            </TouchableOpacity>

            {/* Trading Boy */}
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
                <Text style={s.typeDesc}>Connect your existing Trading Boy from cabal.ventures. Live state, decisions feed, and AI chat.</Text>
                <View style={s.typeTags}>
                  {['trading', 'cabal', 'autonomous', 'live'].map(t => (
                    <View key={t} style={s.tag}><Text style={s.tagText}>{t}</Text></View>
                  ))}
                </View>
              </View>
              {Platform.OS === 'web' ? <ChevronMark /> : <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />}
            </TouchableOpacity>

            <TouchableOpacity style={s.byoRow} onPress={() => router.push('/connect' as any)}>
              <Text style={s.byoText}>Bring your own agent</Text>
              {Platform.OS === 'web' ? <ChevronMark /> : <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} />}
            </TouchableOpacity>
          </>
        )}

        {/* ── Trading Boy ── */}
        {step === 'trading-boy' && (
          <>
            <Text style={s.subtitle}>Connect your Trading Boy from cabal.ventures using your API key.</Text>

            <View style={s.infoBox}>
              <Text style={s.infoRow}>◎  Fully autonomous trading agent</Text>
              <Text style={s.infoRow}>📊  Live state + decisions feed</Text>
              <Text style={s.infoRow}>🧠  Gemini reads all your agent history</Text>
              <Text style={s.infoRow}>⏸  Pause / resume from the app</Text>
            </View>

            <Text style={s.fieldLabel}>Cabal API Key</Text>
            <View style={s.keyInputRow}>
              <TextInput
                key={showTbKey ? 'tb-show' : 'tb-hide'}
                style={s.keyInput}
                value={tbApiKey}
                onChangeText={setTbApiKey}
                placeholder="tb_live_..."
                placeholderTextColor={Colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry={!showTbKey}
              />
              <TouchableOpacity style={s.eyeBtn} onPress={() => setShowTbKey(v => !v)}>
                {Platform.OS === 'web'
                  ? <Text style={s.eyeFallback}>{showTbKey ? 'Hide' : 'Show'}</Text>
                  : <Ionicons name={showTbKey ? 'eye-off' : 'eye'} size={18} color={Colors.textMuted} />}
              </TouchableOpacity>
            </View>
            <Text style={s.hintText}>Starts with tb_live_. Find it in your cabal.ventures dashboard.</Text>

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

        {/* ── Claude Agent ── */}
        {step === 'claude-agent' && (
          <>
            <Text style={s.subtitle}>A Claude-powered agent hosted 24/7. It learns from every trade and can acquire new skills over time.</Text>

            <View style={s.infoBox}>
              <Text style={s.infoRow}>✦  Runs on Claude — no API key needed</Text>
              <Text style={s.infoRow}>🧠  Persistent memory across sessions</Text>
              <Text style={s.infoRow}>⚡  Acquires skills as it trades</Text>
              <Text style={s.infoRow}>🔒  Paper trading — no real funds</Text>
            </View>

            <Text style={s.fieldLabel}>Agent Name</Text>
            <TextInput
              style={s.input}
              value={name}
              onChangeText={setName}
              placeholder={`${claudeStrategy} Agent`}
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="words"
            />

            <Text style={s.fieldLabel}>Strategy</Text>
            <View style={s.coinGrid}>
              {CLAUDE_STRATEGIES.map((strat) => (
                <TouchableOpacity
                  key={strat}
                  style={[s.coinBtn, claudeStrategy === strat && s.claudeBtnActive]}
                  onPress={() => { setClaudeStrategy(strat); setCustomHint(null) }}
                  activeOpacity={0.7}
                >
                  <Text style={[s.coinBtnText, claudeStrategy === strat && s.claudeBtnTextActive]}>{strat}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={s.stratDescCard}>
              <Text style={s.stratDescText}>{STRATEGY_DESCRIPTIONS[claudeStrategy]}</Text>
            </View>

            {claudeStrategy === 'Custom' && (
              <>
                <TextInput
                  style={[s.input, { minHeight: 96, textAlignVertical: 'top' }]}
                  value={customDesc}
                  onChangeText={(t) => { setCustomDesc(t); setCustomHint(null) }}
                  onBlur={() => validateCustomStrategy(customDesc)}
                  placeholder="e.g. Buy BTC when RSI drops below 30, sell when it hits 65. Hold max 3 positions."
                  placeholderTextColor="#555"
                  multiline
                  numberOfLines={4}
                  autoCapitalize="sentences"
                />
                {validating && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <ActivityIndicator size="small" color={Colors.accentAmber} />
                    <Text style={{ fontSize: 12, color: Colors.textMuted }}>Checking strategy…</Text>
                  </View>
                )}
                {customHint && !validating && (
                  <View style={s.hintBox}>
                    <Text style={s.hintBoxText}>{customHint}</Text>
                  </View>
                )}
              </>
            )}

            <Text style={s.fieldLabel}>Skills to Equip</Text>
            <View style={s.skillsGrid}>
              {CLAUDE_SKILLS.map(skill => {
                const active = claudeSkills.has(skill.id)
                const focused = focusedSkill === skill.id
                return (
                  <TouchableOpacity
                    key={skill.id}
                    style={[s.skillChip, active && s.skillChipActive, focused && s.skillChipFocused]}
                    onPress={() => {
                      toggleSkill(skill.id)
                      setFocusedSkill(focused ? null : skill.id)
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={s.skillEmoji}>{skill.emoji}</Text>
                    <Text style={[s.skillLabel, active && s.skillLabelActive]}>{skill.label}</Text>
                  </TouchableOpacity>
                )
              })}
            </View>

            {focusedSkill && SKILL_DESCRIPTIONS[focusedSkill] && (
              focusedSkill === 'news_sentiment' ? (
                <View style={s.newsSkillCard}>
                  <View style={s.newsSkillHeader}>
                    <Text style={s.newsSkillIcon}>📰</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={s.newsSkillTitle}>News Sentiment Agent</Text>
                      <View style={s.newsSkillBadge}>
                        <Text style={s.newsSkillBadgeText}>POSTS TO FEED</Text>
                      </View>
                    </View>
                  </View>
                  <Text style={s.newsSkillDesc}>
                    This agent monitors crypto news in real time and posts updates directly to your feed whenever a breaking story affects your markets — including sentiment analysis and which coins are impacted.
                  </Text>
                  <Text style={s.newsSkillNote}>
                    It doesn't place trades. Add a trading strategy alongside it if you want both.
                  </Text>
                </View>
              ) : (
                <View style={s.stratDescCard}>
                  <Text style={s.stratDescText}>{SKILL_DESCRIPTIONS[focusedSkill]}</Text>
                </View>
              )
            )}

            {error ? <Text style={s.errorText}>{error}</Text> : null}

            <TouchableOpacity
              style={[s.cta, { backgroundColor: '#fb923c' }, deploying && { opacity: 0.5 }]}
              onPress={deployClaudeAgent}
              disabled={deploying}
            >
              {deploying
                ? <ActivityIndicator color="#000" />
                : <Text style={s.ctaText}>Deploy Claude Agent</Text>}
            </TouchableOpacity>
          </>
        )}

        {/* ── Success ── */}
        {step === 'success' && deployed && (
          <View style={s.successBlock}>

            {/* Status pill */}
            <View style={s.successPill}>
              <View style={s.successPillDot} />
              <Text style={s.successPillText}>LIVE</Text>
            </View>

            {/* Agent card */}
            <View style={s.successCard}>
              <View style={s.successCardTop}>
                <View style={s.successAvatar}>
                  <Text style={s.successAvatarText}>{deployed.name[0]?.toUpperCase() ?? 'A'}</Text>
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={s.successAgentName}>{deployed.name}</Text>
                  {deployed.type === 'cabal_trading_boy' ? (
                    <View style={s.successTypeBadge}>
                      <Text style={s.successTypeBadgeText}>TRADING BOY</Text>
                    </View>
                  ) : deployed.strategy ? (
                    <View style={s.successTypeBadge}>
                      <Text style={s.successTypeBadgeText}>{deployed.strategy.toUpperCase()}</Text>
                    </View>
                  ) : null}
                </View>
              </View>

              {deployed.skills && deployed.skills.length > 0 && (
                <View style={s.successSkills}>
                  {deployed.skills.map((id) => {
                    const skill = CLAUDE_SKILLS.find((sk) => sk.id === id)
                    if (!skill) return null
                    return (
                      <View key={id} style={s.successSkillChip}>
                        <Text style={s.successSkillEmoji}>{skill.emoji}</Text>
                        <Text style={s.successSkillLabel}>{skill.label}</Text>
                      </View>
                    )
                  })}
                </View>
              )}

              <Text style={s.successDesc}>
                {deployed.type === 'cabal_trading_boy'
                  ? 'Connected. Live state, decisions, and chat are syncing.'
                  : 'Running 24/7. Chat with it to configure strategy, set limits, or check status.'}
              </Text>
            </View>

            <TouchableOpacity
              style={[s.cta, { width: '100%' }]}
              onPress={() => {
                deployed.type === 'cabal_trading_boy'
                  ? router.replace('/(tabs)/agents' as any)
                  : router.replace(`/agent/${deployed.id}` as any)
              }}
            >
              <Text style={s.ctaText}>{deployed.type === 'cabal_trading_boy' ? 'View Agents' : 'Open Agent'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.secondaryBtn} onPress={() => router.replace('/(tabs)/agents' as any)}>
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
  backMark: { width: 10, height: 14, alignItems: 'center', justifyContent: 'center' },
  backStroke: {
    position: 'absolute', width: 8, height: 1.8,
    borderRadius: 2, backgroundColor: Colors.textPrimary, left: 1,
  },
  backStrokeTop: { top: 4, transform: [{ rotate: '-45deg' }] },
  backStrokeBottom: { bottom: 4, transform: [{ rotate: '45deg' }] },
  chevronMark: { width: 10, height: 14, alignItems: 'center', justifyContent: 'center' },
  chevronStroke: {
    position: 'absolute', width: 7, height: 1.8,
    borderRadius: 2, backgroundColor: Colors.textMuted, right: 0,
  },
  chevronStrokeTop: { top: 4, transform: [{ rotate: '45deg' }] },
  chevronStrokeBottom: { bottom: 4, transform: [{ rotate: '-45deg' }] },
  checkMark: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  checkStroke: { position: 'absolute', height: 2.4, borderRadius: 2, backgroundColor: Colors.accentGreen },
  checkStrokeShort: { width: 9, left: 3, top: 14, transform: [{ rotate: '45deg' }] },
  checkStrokeLong: { width: 16, right: 1, top: 11, transform: [{ rotate: '-45deg' }] },

  headerTitle: { fontSize: 17, fontWeight: '600', color: Colors.textPrimary },
  body: { padding: 20, gap: 16 },
  subtitle: { fontSize: 14, color: Colors.textSecondary, lineHeight: 20 },

  typeCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 14,
    backgroundColor: Colors.bgCard, borderRadius: 16,
    padding: 16, borderWidth: 1, borderColor: Colors.borderSubtle,
  },
  typeCardFeatured: {
    borderColor: 'rgba(251,146,60,0.3)',
    backgroundColor: 'rgba(251,146,60,0.04)',
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
  coinBtnActive: { backgroundColor: 'rgba(217,119,87,0.15)', borderColor: Colors.accentAmber },
  coinBtnText: { fontSize: 13, fontWeight: '700', color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  coinBtnTextActive: { color: Colors.accentAmber },

  claudeBtnActive: { backgroundColor: 'rgba(251,146,60,0.15)', borderColor: '#fb923c' },
  claudeBtnTextActive: { color: '#fb923c' },

  stratDescCard: {
    backgroundColor: 'rgba(251,146,60,0.06)',
    borderRadius: 10, borderWidth: 1, borderColor: 'rgba(251,146,60,0.18)',
    padding: 12,
  },
  stratDescText: { fontSize: 13, color: Colors.textSecondary, lineHeight: 18 },

  hintBox: {
    backgroundColor: 'rgba(96,165,250,0.08)',
    borderRadius: 10, borderWidth: 1, borderColor: 'rgba(96,165,250,0.25)',
    padding: 12,
  },
  hintBoxText: { fontSize: 13, color: '#93c5fd', lineHeight: 18 },

  skillsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  skillChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10,
    backgroundColor: Colors.bgSubtle, borderWidth: 1, borderColor: Colors.borderSubtle,
  },
  skillChipActive: { backgroundColor: 'rgba(251,146,60,0.12)', borderColor: '#fb923c' },
  skillChipFocused: { borderColor: '#60a5fa', borderWidth: 1.5 },
  skillEmoji: { fontSize: 14 },
  skillLabel: { fontSize: 13, fontWeight: '600', color: Colors.textMuted },
  skillLabelActive: { color: '#fb923c' },

  newsSkillCard: {
    backgroundColor: 'rgba(96,165,250,0.07)',
    borderRadius: 14, borderWidth: 1, borderColor: 'rgba(96,165,250,0.3)',
    padding: 16, gap: 10,
  },
  newsSkillHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  newsSkillIcon: { fontSize: 24, lineHeight: 28 },
  newsSkillTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, marginBottom: 4 },
  newsSkillBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(96,165,250,0.15)', borderRadius: 5, borderWidth: 1,
    borderColor: 'rgba(96,165,250,0.4)', paddingHorizontal: 6, paddingVertical: 2,
  },
  newsSkillBadgeText: { fontSize: 10, fontWeight: '700', color: '#93c5fd' },
  newsSkillDesc: { fontSize: 13, color: Colors.textSecondary, lineHeight: 19 },
  newsSkillNote: { fontSize: 12, color: Colors.textMuted, lineHeight: 17, fontStyle: 'italic' },

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
  keyInputRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.bgCard, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.borderSubtle,
  },
  keyInput: { flex: 1, padding: 14, fontSize: 15, color: Colors.textPrimary },
  eyeBtn: { paddingHorizontal: 14, paddingVertical: 14 },
  eyeFallback: { color: Colors.textMuted, fontSize: 12, fontWeight: '700' },
  hintText: { fontSize: 12, color: Colors.textMuted, lineHeight: 17 },
  errorText: { fontSize: 13, color: Colors.accentRed },

  cta: {
    backgroundColor: Colors.accentAmber, borderRadius: 14,
    paddingVertical: 16, alignItems: 'center', marginTop: 8,
  },
  ctaText: { fontSize: 16, fontWeight: '700', color: '#000' },
  secondaryBtn: { alignItems: 'center', paddingVertical: 12 },
  secondaryBtnText: { fontSize: 14, color: Colors.textMuted },

  successBlock: { gap: 16, paddingTop: 16 },

  successPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(52,211,153,0.1)', borderRadius: 20,
    borderWidth: 1, borderColor: 'rgba(52,211,153,0.3)',
    paddingHorizontal: 12, paddingVertical: 5,
  },
  successPillDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.accentGreen },
  successPillText: { fontSize: 11, fontWeight: '700', color: Colors.accentGreen, letterSpacing: 1 },

  successCard: {
    backgroundColor: Colors.bgCard, borderRadius: 18,
    borderWidth: 1, borderColor: Colors.borderSubtle,
    padding: 18, gap: 14,
  },
  successCardTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  successAvatar: {
    width: 52, height: 52, borderRadius: 16,
    backgroundColor: 'rgba(251,146,60,0.15)', borderWidth: 1.5, borderColor: '#fb923c',
    justifyContent: 'center', alignItems: 'center',
  },
  successAvatarText: { fontSize: 22, fontWeight: '800', color: '#fb923c' },
  successAgentName: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary },
  successTypeBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(251,146,60,0.1)', borderRadius: 5,
    borderWidth: 1, borderColor: 'rgba(251,146,60,0.3)',
    paddingHorizontal: 7, paddingVertical: 2,
  },
  successTypeBadgeText: { fontSize: 10, fontWeight: '700', color: '#fb923c' },

  successSkills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  successSkillChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: Colors.bgSubtle, borderRadius: 8,
    borderWidth: 1, borderColor: Colors.borderSubtle,
    paddingHorizontal: 9, paddingVertical: 5,
  },
  successSkillEmoji: { fontSize: 12 },
  successSkillLabel: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },

  successDesc: { fontSize: 13, color: Colors.textSecondary, lineHeight: 19 },
})
