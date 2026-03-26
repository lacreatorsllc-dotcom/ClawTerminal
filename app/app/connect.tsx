import { useState, useEffect, useRef } from 'react'
import { Ionicons } from '@expo/vector-icons'
import { View, Text, TouchableOpacity, StyleSheet, Platform, Linking, ActivityIndicator, TextInput } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { router } from 'expo-router'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { useAgentsStore } from '../stores/agentsStore'
import { Colors } from '../constants/colors'
import TelegramTokenField from '../components/TelegramTokenField'

type Method = 'telegram' | 'cli' | 'script' | null
type TelegramStep = 'method' | 'instructions' | 'token' | 'connecting' | 'success'

const EDGE_FUNCTION_URL = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/telegram-connector`

export default function ConnectScreen() {
  const { user } = useAuthStore()
  const { upsertAgent } = useAgentsStore()

  const [method, setMethod] = useState<Method>(null)
  const [step, setStep] = useState<TelegramStep>('method')

  // Telegram flow state
  const [token, setToken] = useState('')
  const [connectingLabel, setConnectingLabel] = useState('Connecting to your bot...')
  const [botName, setBotName] = useState('')
  const [botUsername, setBotUsername] = useState('')
  const [agentName, setAgentName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const connectingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // CLI flow state
  const [copied, setCopied] = useState(false)
  const [cliWaiting, setCliWaiting] = useState(false)

  const userId = user?.id ?? null
  const installCmd = userId ? `npx claw-connector connect --token ${userId}` : null

  // ── CLI: poll for new agent (fallback for when postgres_changes isn't enabled) ──
  useEffect(() => {
    if (!cliWaiting || !user) return

    // Track agent IDs we knew about before waiting
    const knownIds = new Set(useAgentsStore.getState().agents.map((a: any) => a.id))

    const checkForNewAgent = async () => {
      const { data } = await supabase.from('agents').select('*').eq('user_id', user.id)
      if (!data) return
      const newAgent = data.find((a: any) => !knownIds.has(a.id))
      if (newAgent) {
        upsertAgent(newAgent)
        router.replace('/(tabs)/agents')
      }
    }

    // Also try postgres_changes for instant delivery
    const channel = supabase
      .channel(`user:${user.id}:agents:connect`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'agents',
        filter: `user_id=eq.${user.id}`,
      }, (payload) => {
        upsertAgent(payload.new as any)
        router.replace('/(tabs)/agents')
      })
      .subscribe()

    const poll = setInterval(checkForNewAgent, 3_000)
    const timeout = setTimeout(() => setCliWaiting(false), 60_000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(poll)
      clearTimeout(timeout)
    }
  }, [cliWaiting, user])

  // ── Connecting step: escalating timeout labels ─────────────────────────────
  useEffect(() => {
    if (step !== 'connecting') return
    const t1 = setTimeout(() => setConnectingLabel('Still waiting...'), 15_000)
    const t2 = setTimeout(() => setConnectingLabel('Taking longer than usual...'), 45_000)
    const t3 = setTimeout(() => {
      setError('Connection timed out. Check your token and try again.')
      setStep('token')
    }, 60_000)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [step])

  async function handleCopy() {
    if (!installCmd) return
    await Clipboard.setStringAsync(installCmd)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleTelegramConnect() {
    if (!userId) return
    setError(null)
    setStep('connecting')
    setConnectingLabel('Connecting to your bot...')

    try {
      const res = await fetch(EDGE_FUNCTION_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
        body: JSON.stringify({ action: 'register', token, userId }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Couldn\'t reach this bot. Check your token and try again.')
        setStep('token')
        return
      }

      setBotName(data.botName)
      setBotUsername(data.botUsername)
      setAgentName(data.botName)
      upsertAgent({ id: data.agentId, name: data.botName, status: 'connected', user_id: userId })
      setStep('success')
    } catch (e) {
      setError('Network error. Check your connection and try again.')
      setStep('token')
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn}>
          <Text style={styles.closeBtnText}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Connect an agent</Text>
      </View>

      <View style={styles.content}>

        {/* ── Step 1: Method picker ── */}
        {step === 'method' && (
          <>
            {/* Connect to Claude — hero */}
            <TouchableOpacity style={styles.claudeCard} activeOpacity={0.85}>
              <View style={styles.claudeCardGlow} />
              <View style={styles.claudeCardInner}>
                <View style={styles.claudeCardIcon}>
                  <Text style={styles.claudeCardIconText}>✦</Text>
                </View>
                <View style={styles.claudeCardText}>
                  <Text style={styles.claudeCardTitle}>Connect to Claude</Text>
                  <Text style={styles.claudeCardSubtitle}>Sign in with your Claude account</Text>
                </View>
                <Text style={styles.claudeCardChevron}>›</Text>
              </View>
            </TouchableOpacity>

            {/* Telegram — primary */}
            <TouchableOpacity
              style={styles.primaryCard}
              onPress={() => { setMethod('telegram'); setStep('instructions') }}
              activeOpacity={0.85}
            >
              <View style={styles.primaryCardInner}>
                <View style={styles.primaryCardIcon}>
                  <Text style={styles.primaryCardIconText}>✈</Text>
                </View>
                <View style={styles.primaryCardText}>
                  <Text style={styles.primaryCardTitle}>Telegram Bot</Text>
                  <Text style={styles.primaryCardSubtitle}>Paste your bot token — no terminal needed</Text>
                </View>
                <Text style={styles.primaryCardChevron}>›</Text>
              </View>
            </TouchableOpacity>

            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerLabel}>Other methods</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* CLI */}
            <TouchableOpacity
              style={styles.secondaryRow}
              onPress={() => { setMethod('cli'); setCliWaiting(false) }}
              activeOpacity={0.8}
            >
              <Text style={styles.secondaryRowTitle}>Claude Code</Text>
              <Text style={styles.secondaryRowSubtitle}>Run a command in your terminal</Text>
            </TouchableOpacity>

            {/* Custom Script */}
            <TouchableOpacity
              style={styles.secondaryRow}
              activeOpacity={0.8}
            >
              <Text style={styles.secondaryRowTitle}>Custom Script</Text>
              <Text style={styles.secondaryRowSubtitle}>Manual connector setup</Text>
            </TouchableOpacity>
          </>
        )}

        {/* ── CLI flow (inline under method picker) ── */}
        {step === 'method' && method === 'cli' && (
          <View style={styles.cliBlock}>
            <Text style={styles.stepTitle}>Run this command</Text>
            <Text style={styles.stepDesc}>In your agent's environment, run the connector command below.</Text>
            <View style={styles.commandBox}>
              <View style={styles.commandHeader}>
                <Text style={styles.commandHeaderLabel}>bash</Text>
                <TouchableOpacity style={styles.copyBtn} onPress={handleCopy}>
                  {copied
                    ? <Ionicons name="checkmark" size={18} color={Colors.accentGreen} />
                    : <Ionicons name="copy-outline" size={18} color={Colors.textSecondary} />
                  }
                </TouchableOpacity>
              </View>
              <View style={styles.commandBody}>
                <Text style={styles.command}>{installCmd}</Text>
              </View>
            </View>
            <TouchableOpacity
              style={[styles.primaryBtn, styles.cliBluBtn]}
              onPress={() => setCliWaiting(true)}
            >
              <Text style={[styles.primaryBtnText, styles.cliBluBtnText]}>
                {cliWaiting ? 'Waiting for agent...' : 'I ran it — connect'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Step 2: BotFather instructions ── */}
        {step === 'instructions' && (
          <>
            <Text style={styles.stepTitle}>Create a Telegram bot</Text>
            <Text style={styles.stepDesc}>You'll need a bot token from @BotFather. Takes about 30 seconds.</Text>

            <View style={styles.instructionsList}>
              <View style={styles.instructionRow}>
                <Text style={styles.instructionNum}>1</Text>
                <View style={styles.instructionContent}>
                  <Text style={styles.instructionText}>Open Telegram and message @BotFather</Text>
                  <TouchableOpacity onPress={() => Linking.openURL('tg://resolve?domain=BotFather')}>
                    <Text style={styles.deepLink}>Open Telegram →</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <View style={styles.instructionRow}>
                <Text style={styles.instructionNum}>2</Text>
                <Text style={styles.instructionText}>Send <Text style={styles.code}>/newbot</Text> and follow the prompts</Text>
              </View>
              <View style={styles.instructionRow}>
                <Text style={styles.instructionNum}>3</Text>
                <Text style={styles.instructionText}>Copy the token BotFather gives you</Text>
              </View>
            </View>

            <Text style={styles.tokenExample}>Looks like: 110201543:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw</Text>

            <TouchableOpacity style={styles.primaryBtn} onPress={() => setStep('token')}>
              <Text style={styles.primaryBtnText}>I have my token →</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setStep('method')}>
              <Text style={styles.backLink}>← Back</Text>
            </TouchableOpacity>
          </>
        )}

        {/* ── Step 3: Paste token ── */}
        {step === 'token' && (
          <>
            <Text style={styles.stepTitle}>Paste your bot token</Text>
            {error && <Text style={styles.errorBanner}>{error}</Text>}
            <TelegramTokenField value={token} onChange={setToken} />
            <TouchableOpacity
              style={[styles.primaryBtn, !/^\d+:[A-Za-z0-9_-]{35,}$/.test(token) && styles.primaryBtnDisabled]}
              disabled={!/^\d+:[A-Za-z0-9_-]{35,}$/.test(token)}
              onPress={handleTelegramConnect}
            >
              <Text style={styles.primaryBtnText}>Connect</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setError(null); setStep('instructions') }}>
              <Text style={styles.backLink}>← Back</Text>
            </TouchableOpacity>
          </>
        )}

        {/* ── Step 4: Connecting ── */}
        {step === 'connecting' && (
          <View style={styles.centeredBlock}>
            <ActivityIndicator size="large" color={Colors.accentTeal} />
            <Text style={styles.connectingLabel}>{connectingLabel}</Text>
          </View>
        )}

        {/* ── Step 5: Success ── */}
        {step === 'success' && (
          <>
            <View style={styles.successIcon}>
              <Text style={styles.successEmoji}>✓</Text>
            </View>
            <Text style={styles.stepTitle}>Connected</Text>
            <Text style={styles.stepDesc}>Found: @{botUsername}</Text>

            <View style={styles.renameBlock}>
              <Text style={styles.renameLabel}>Agent name</Text>
              <TextInput
                style={styles.renameInput}
                value={agentName}
                onChangeText={setAgentName}
                placeholder="Agent name"
                placeholderTextColor={Colors.textMuted}
              />
            </View>

            <TouchableOpacity style={styles.primaryBtn} onPress={() => router.replace('/(tabs)/agents')}>
              <Text style={styles.primaryBtnText}>Done</Text>
            </TouchableOpacity>
          </>
        )}

      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'ios' ? 60 : 24,
    paddingBottom: 16,
    gap: 16,
  },
  closeBtn: { padding: 4 },
  closeBtnText: { color: Colors.textSecondary, fontSize: 18 },
  title: { fontSize: 20, fontWeight: '600', color: Colors.textPrimary },
  content: { flex: 1, paddingHorizontal: 24, paddingTop: 24, gap: 14 },

  // Connect to Claude card
  claudeCard: {
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 69, 58, 0.35)',
    overflow: 'hidden',
    backgroundColor: Colors.bgSurface,
  },
  claudeCardGlow: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: 60,
    backgroundColor: 'rgba(255, 69, 58, 0.06)',
  },
  claudeCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 18,
  },
  claudeCardIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 69, 58, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  claudeCardIconText: { fontSize: 22, color: Colors.accentCrimson },
  claudeCardText: { flex: 1, gap: 3 },
  claudeCardTitle: { fontSize: 17, fontWeight: '700', color: Colors.textPrimary, letterSpacing: -0.2 },
  claudeCardSubtitle: { fontSize: 13, color: Colors.textSecondary },
  claudeCardChevron: { fontSize: 22, color: Colors.accentCrimson },

  // Primary card (Telegram)
  primaryCard: {
    backgroundColor: Colors.bgSurface,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#1a3a6e',
    padding: 18,
  },
  primaryCardInner: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  primaryCardIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#1a3a6e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryCardIconText: { fontSize: 22, color: '#4fa3e0' },
  primaryCardText: { flex: 1, gap: 3 },
  primaryCardTitle: { fontSize: 16, fontWeight: '600', color: Colors.textPrimary },
  primaryCardSubtitle: { fontSize: 13, color: Colors.textSecondary },
  primaryCardChevron: { fontSize: 22, color: Colors.textSecondary },

  // Divider
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dividerLine: { flex: 1, height: 1, backgroundColor: Colors.bgBorder },
  dividerLabel: { fontSize: 12, color: Colors.textMuted },

  // Secondary rows
  secondaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.bgSurface,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 8,
  },
  secondaryRowTitle: { fontSize: 15, fontWeight: '500', color: Colors.textPrimary },
  secondaryRowSubtitle: { fontSize: 12, color: Colors.textMuted },

  // CLI block
  cliBlock: { gap: 12 },
  stepTitle: { fontSize: 22, fontWeight: '700', color: Colors.textPrimary },
  stepDesc: { fontSize: 14, color: Colors.textSecondary, lineHeight: 20 },
  commandBox: {
    backgroundColor: Colors.bgElevated,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.bgBorder,
    overflow: 'hidden',
  },
  commandHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 8,
  },
  commandHeaderLabel: { fontSize: 12, fontWeight: '500', color: Colors.textSecondary },
  commandBody: { paddingHorizontal: 14, paddingBottom: 14 },
  command: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 12, color: Colors.accentGreen, lineHeight: 18 },
  copyBtn: { padding: 4 },

  // Instructions
  instructionsList: { gap: 16 },
  instructionRow: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  instructionNum: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.bgElevated,
    textAlign: 'center',
    lineHeight: 24,
    fontSize: 13,
    fontWeight: '600',
    color: Colors.accentTeal,
    overflow: 'hidden',
  },
  instructionContent: { flex: 1, gap: 4 },
  instructionText: { flex: 1, fontSize: 14, color: Colors.textPrimary, lineHeight: 20 },
  deepLink: { fontSize: 13, color: Colors.accentTeal, fontWeight: '500' },
  code: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', color: Colors.accentTeal },
  tokenExample: { fontSize: 12, color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },

  // Error
  errorBanner: { color: Colors.accentRed, fontSize: 13, backgroundColor: 'rgba(255,69,58,0.08)', borderRadius: 8, padding: 12 },

  // Connecting
  centeredBlock: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20 },
  connectingLabel: { fontSize: 16, color: Colors.textSecondary },

  // Success
  successIcon: { alignItems: 'center', paddingVertical: 24 },
  successEmoji: { fontSize: 64, color: Colors.accentGreen },
  renameBlock: { gap: 8 },
  renameLabel: { fontSize: 13, color: Colors.textSecondary },
  renameInput: {
    backgroundColor: Colors.bgElevated,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.bgBorder,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: Colors.textPrimary,
  },

  // Shared
  primaryBtn: {
    backgroundColor: Colors.accentCrimson,
    borderRadius: 24,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  primaryBtnText: { color: Colors.bgPrimary, fontSize: 16, fontWeight: '600' },
  primaryBtnDisabled: { opacity: 0.4 },
  cliBluBtn: { backgroundColor: 'rgba(255, 69, 58, 0.08)' },
  cliBluBtnText: { color: Colors.accentRed },
  backLink: { color: Colors.textSecondary, fontSize: 14, textAlign: 'center' },
})
